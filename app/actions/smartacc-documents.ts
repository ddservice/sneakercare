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
  billingRefDocIds?: string[]; // For DO-Picker in Billing Notes
};

export async function lookupDbdCompany(taxIdOrKeyword: string) {
  await requireProfile();
  const cleaned = taxIdOrKeyword.trim();

  // Mock DBD Juristic Lookup database
  const dbdDatabase: Record<string, { companyName: string; taxId: string; branchCode: string; address: string }> = {
    "0105558000000": {
      companyName: "บริษัท สนีกเกอร์ แคร์ อินเตอร์เนชั่นแนล จำกัด (สำนักงานใหญ่)",
      taxId: "0105558000000",
      branchCode: "00000",
      address: "เลขที่ 123/45 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110",
    },
    "0505562000000": {
      companyName: "บริษัท เชียงใหม่ ฟุตแวร์ เซอร์วิส จำกัด",
      taxId: "0505562000000",
      branchCode: "00000",
      address: "เลขที่ 88/9 หมู่ 5 ตำบลสุเทพ อำเภอเมืองเชียงใหม่ จังหวัดเชียงใหม่ 50200",
    },
  };

  const found = Object.values(dbdDatabase).find(
    (c) => c.taxId === cleaned || c.companyName.includes(cleaned)
  );

  if (found) return found;

  if (cleaned.length === 13 && /^\d+$/.test(cleaned)) {
    return {
      companyName: `บริษัท นิติบุคคล ทะเบียน ${cleaned} จำกัด`,
      taxId: cleaned,
      branchCode: "00000",
      address: "กรุงเทพมหานคร",
    };
  }

  return null;
}

export async function createSmartAccDocument(payload: CreateDocumentPayload) {
  const profile = await requireProfile();
  const supabase = createAdminClient();

  // 1. Calculate Totals
  const subtotal = payload.items.reduce((sum, item) => sum + item.totalLineAmount, 0);
  const vatRate = 7.0;
  const vatAmount = subtotal * (vatRate / 100);
  const grandTotal = subtotal + vatAmount;

  // 2. Generate Numbering & Share Token
  const docNumber = await generateDocumentNumber(payload.docType, new Date(payload.issueDate));
  const shareToken = "doc_" + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);

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

  revalidatePath("/invoicing");
  revalidatePath("/billing-notes");
  return { success: true, docId: doc.id, docNumber: doc.doc_number, shareToken };
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
