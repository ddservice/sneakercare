"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDocumentNumber, type DocumentType } from "@/lib/smartacc/numbering";
import { generatePromptPayPayload } from "@/lib/smartacc/promptpay";

export type DocumentItemInput = {
  itemName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  totalLineAmount: number;
};

export type CreateDocumentPayload = {
  docType: DocumentType;
  companyName: string;
  taxId?: string;
  branchCode?: string;
  address?: string;
  phone?: string;
  email?: string;
  issueDate: string;
  dueDate?: string;
  creditTermDays?: number;
  items: DocumentItemInput[];
  notes?: string;
  promptPayTarget?: string;
  billingRefDocIds?: string[];
  refParentDocId?: string;
  refParentDocNumber?: string;
};

export type CatalogItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  unit: string;
  source: "service" | "item";
};

/**
 * Fetch real catalog of services and inventory items from live database
 */
export async function fetchCatalogItems(): Promise<CatalogItem[]> {
  await requireProfile();
  const supabase = createAdminClient();

  const [servicesRes, itemsRes] = await Promise.all([
    supabase.from("services").select("id, name, category, base_price").eq("is_active", true),
    supabase.from("items").select("id, name, category, base_unit"),
  ]);

  const catalog: CatalogItem[] = [];

  if (servicesRes.data) {
    servicesRes.data.forEach((s: any) => {
      catalog.push({
        id: s.id,
        name: s.name,
        category: s.category || "บริการ",
        price: Number(s.base_price || 0),
        unit: "คู่/งาน",
        source: "service",
      });
    });
  }

  if (itemsRes.data) {
    itemsRes.data.forEach((i: any) => {
      catalog.push({
        id: i.id,
        name: i.name,
        category: i.category || "สินค้า/อุปกรณ์",
        price: 0, // Consumables/Supplies price
        unit: i.base_unit || "ชิ้น",
        source: "item",
      });
    });
  }

  return catalog;
}

/**
 * Fetch real documents from database with relational items
 */
export async function fetchSmartAccDocuments(filterType?: DocumentType) {
  await requireProfile();
  const supabase = createAdminClient();

  let query = (supabase as any)
    .schema("extension_layer")
    .from("ext_documents")
    .select("*, ext_contacts(*), ext_document_items(*)")
    .order("created_at", { ascending: false });

  if (filterType) {
    query = query.eq("doc_type", filterType);
  }

  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

/**
 * Create or save a new document with dynamic numbering and PromptPay payload
 */
export async function createSmartAccDocument(payload: CreateDocumentPayload) {
  const profile = await requireProfile();
  const supabase = createAdminClient();

  // 1. Calculate Totals
  const subtotal = payload.items.reduce((sum, item) => sum + item.totalLineAmount, 0);
  const isTaxApplicable = ["INVOICE", "BILLING_NOTE", "TAX_INVOICE", "RECEIPT"].includes(payload.docType);
  const vatRate = isTaxApplicable ? 7.0 : 0.0;
  const vatAmount = subtotal * (vatRate / 100);
  const grandTotal = subtotal + vatAmount;

  // 2. Generate Standard Numbering: PREFIX-YYYYMMDD-XXXX
  const docNumber = await generateDocumentNumber(payload.docType, new Date(payload.issueDate));
  const shareToken = "doc_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

  // 3. Generate Dynamic PromptPay QR Payload
  let promptpayPayload: string | null = null;
  if (payload.promptPayTarget) {
    promptpayPayload = generatePromptPayPayload(payload.promptPayTarget, grandTotal);
  }

  // 4. Upsert Contact
  let contactId: string | null = null;
  if (payload.companyName) {
    const { data: contact } = await (supabase as any)
      .schema("extension_layer")
      .from("ext_contacts")
      .insert({
        company_name: payload.companyName,
        tax_id: payload.taxId || null,
        branch_code: payload.branchCode || "00000",
        address: payload.address || null,
        phone: payload.phone || null,
        email: payload.email || null,
      })
      .select("id")
      .single();

    if (contact) contactId = contact.id;
  }

  // 5. Insert Document
  const { data: doc, error: docErr } = await (supabase as any)
    .schema("extension_layer")
    .from("ext_documents")
    .insert({
      doc_type: payload.docType,
      doc_number: docNumber,
      contact_id: contactId,
      branch_id: profile.branch_id,
      issue_date: payload.issueDate,
      due_date: payload.dueDate || null,
      credit_term_days: payload.creditTermDays || 0,
      status: "DRAFT",
      subtotal_amount: subtotal,
      discount_amount: 0.0,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      grand_total: grandTotal,
      promptpay_payload: promptpayPayload,
      share_token: shareToken,
      notes: payload.notes || null,
      ref_parent_doc_id: payload.refParentDocId || null,
      ref_parent_doc_number: payload.refParentDocNumber || null,
    })
    .select("id, doc_number")
    .single();

  if (docErr || !doc) {
    throw new Error(`สร้างเอกสารไม่สำเร็จ: ${docErr?.message}`);
  }

  // 6. Insert Line Items
  if (payload.items.length > 0) {
    const lineItems = payload.items.map((item, idx) => ({
      document_id: doc.id,
      item_name: item.itemName,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      discount: item.discount,
      total_line_amount: item.totalLineAmount,
      sort_order: idx,
    }));

    await (supabase as any)
      .schema("extension_layer")
      .from("ext_document_items")
      .insert(lineItems);
  }

  // 7. Insert Billing References if converting DOs
  if (payload.billingRefDocIds && payload.billingRefDocIds.length > 0) {
    for (const refId of payload.billingRefDocIds) {
      await (supabase as any)
        .schema("extension_layer")
        .from("ext_billing_references")
        .insert({
          billing_note_id: doc.id,
          ref_doc_id: refId,
          ref_doc_type: "DO",
          ref_doc_number: docNumber,
          ref_date: payload.issueDate,
          total_amount: grandTotal,
          balance_due: grandTotal,
        });
    }
  }

  revalidatePath("/invoicing");
  revalidatePath("/billing-notes");
  return { success: true, docId: doc.id, docNumber: doc.doc_number, shareToken };
}

/**
 * Converts a source document (e.g. Quotation QA-...) to a target document (e.g. Invoice INV-...)
 */
export async function convertDocument(sourceDocId: string, targetDocType: DocumentType) {
  await requireProfile();
  const supabase = createAdminClient();

  // 1. Fetch Source Document
  const { data: sourceDoc, error } = await (supabase as any)
    .schema("extension_layer")
    .from("ext_documents")
    .select("*, ext_contacts(*), ext_document_items(*)")
    .eq("id", sourceDocId)
    .single();

  if (error || !sourceDoc) {
    throw new Error("ไม่พบเอกสารต้นทางที่ต้องการแปลง");
  }

  const items: DocumentItemInput[] = (sourceDoc.ext_document_items || []).map((it: any) => ({
    itemName: it.item_name,
    quantity: Number(it.quantity),
    unitPrice: Number(it.unit_price),
    discount: Number(it.discount || 0),
    totalLineAmount: Number(it.total_line_amount),
  }));

  const payload: CreateDocumentPayload = {
    docType: targetDocType,
    companyName: sourceDoc.ext_contacts?.company_name || "ลูกค้าทั่วไป",
    taxId: sourceDoc.ext_contacts?.tax_id || undefined,
    branchCode: sourceDoc.ext_contacts?.branch_code || "00000",
    address: sourceDoc.ext_contacts?.address || undefined,
    phone: sourceDoc.ext_contacts?.phone || undefined,
    email: sourceDoc.ext_contacts?.email || undefined,
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    creditTermDays: sourceDoc.credit_term_days || 30,
    items,
    notes: `แปลงมาจากเอกสาร ${sourceDoc.doc_number}`,
    refParentDocId: sourceDoc.id,
    refParentDocNumber: sourceDoc.doc_number,
  };

  const res = await createSmartAccDocument(payload);

  // Update source doc status
  await (supabase as any)
    .schema("extension_layer")
    .from("ext_documents")
    .update({ status: "CONVERTED" })
    .eq("id", sourceDocId);

  revalidatePath("/invoicing");
  return res;
}

export async function fetchPendingDeliveryOrders() {
  await requireProfile();
  const supabase = createAdminClient();

  const { data, error } = await (supabase as any)
    .schema("extension_layer")
    .from("ext_documents")
    .select("id, doc_number, doc_type, issue_date, grand_total, status, ext_contacts(company_name)")
    .in("doc_type", ["DO", "INVOICE"])
    .neq("status", "PAID")
    .order("issue_date", { ascending: false });

  if (error) return [];
  return data ?? [];
}

export async function fetchTaxFilingData(yearMonth?: string) {
  await requireProfile();
  const supabase = createAdminClient();

  const [docsRes, expensesRes] = await Promise.all([
    (supabase as any)
      .schema("extension_layer")
      .from("ext_documents")
      .select("*, ext_contacts(*)")
      .in("doc_type", ["INVOICE", "TAX_INVOICE", "RECEIPT"])
      .order("issue_date", { ascending: false }),
    supabase
      .from("expenses")
      .select("*")
      .order("expense_date", { ascending: false }),
  ]);

  return {
    salesDocs: docsRes.data ?? [],
    expenses: expensesRes.data ?? [],
  };
}


