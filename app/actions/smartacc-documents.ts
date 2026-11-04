"use server";

// ✅ [multi-tenant 2026-09-17] ext_contacts/ext_documents/ext_document_items/
// ext_billing_references มี tenant_id แล้ว (migration 0036) — ทุก query ในไฟล์นี้กรอง/ระบุ
// tenant_id ตามด้วย tenantFilter()/requireTenantId() แล้วครบทุกจุด
import { revalidatePath } from "next/cache";
import { financeRpc } from "@/lib/finance-rpc";
import { documentPayloadSchema, validationMessage } from "@/lib/finance-validation";
import { moneyNumber } from "@/lib/money";
import { bangkokToday } from "@/lib/purchase-receipts";
import { requireProfile, requireModuleView, requireModuleWrite, type Profile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { type DocumentType } from "@/lib/smartacc/numbering";
import { generatePromptPayPayload } from "@/lib/smartacc/promptpay";
import { withId, text } from "@/lib/db-rows";
import { requireTenantId, tenantFilter } from "@/lib/tenant";
import { resolveBranchVat } from "@/lib/branch-vat";
import { errorMessage } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { fetchWhtCertificates } from "@/app/actions/wht";
import { fetchShopProfile } from "@/app/actions/shop-settings";
import { certificateToWhtRecord } from "@/lib/wht";
import {
  documentVatRate,
  settleDocumentVat,
} from "@/lib/vat";
import {
  canConvertDocument,
} from "@/lib/smartacc/lifecycle";
import {
  isCorrectionType,
} from "@/lib/smartacc/correction";
import { embedSellerSnapshot, planSellerSnapshot } from "@/lib/smartacc/snapshot";

/** หนึ่งรายการในสมุดที่อยู่ลูกค้า (sc_settings.dbd_company_registry) */
export type DbdRegistryEntry = {
  companyName: string;
  taxId?: string;
  branchCode?: string;
  address?: string;
  phone?: string;
  email?: string;
};

export type DocumentItemInput = {
  itemName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  totalLineAmount: number;
};

export type CreateDocumentPayload = {
  requestId: string;
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
  /** true = บิล VAT 7% · false = บิลเงินสด · ไม่ส่ง = ใช้ค่าเริ่มต้นตามประเภทเอกสาร */
  chargeVat?: boolean;
};

export type CatalogItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  unit: string;
  source: "service" | "item";
};

export type DbdCompanyResult = {
  companyName: string;
  taxId: string;
  branchCode: string;
  address: string;
  phone?: string;
  email?: string;
  source: "database" | "dbd_registry";
};

/**
 * Lookup Company from DBD / RD Registry & Contact Database
 */
export async function lookupDbdCompany(taxIdOrKeyword: string): Promise<DbdCompanyResult | null> {
  const profile = await requireProfile();
  requireModuleView(profile, "invoicing");
  const raw = taxIdOrKeyword.trim();
  const cleaned = raw.replace(/[^0-9]/g, "");
  const keyword = raw.toLowerCase();
  const supabase = createAdminClient();

  // 1. Search in local contacts first
  try {
    let contactQuery = supabase
      .schema("extension_layer")
      .from("ext_contacts")
      .select("*")
      .or(`tax_id.eq.${cleaned || "NONE"},company_name.ilike.%${raw}%`);
    const contactTenantId = await tenantFilter(profile);
    if (contactTenantId) contactQuery = contactQuery.eq("tenant_id", contactTenantId);
    const { data: existingContact } = await contactQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingContact) {
      return {
        companyName: existingContact.company_name,
        taxId: existingContact.tax_id || (cleaned.length === 13 ? cleaned : "0000000000000"),
        branchCode: existingContact.branch_code || "00000",
        address: existingContact.address || "สำนักงานใหญ่",
        phone: existingContact.phone || "",
        email: existingContact.email || "",
        source: "database",
      };
    }
  } catch (err) {
    // ล้มเหลวได้ (เช่น extension_layer ยังไม่พร้อม) — ปล่อยให้ไปลองหาต่อในชั้นถัดไป แต่ log ไว้
    console.error("[lookupDbdCompany] ค้นใน ext_contacts ล้มเหลว:", err);
  }

  // 2. Comprehensive Thai Juristic Business Registry Dictionary
  const THAI_DBD_REGISTRY: Array<{
    name: string;
    taxId: string;
    branch: string;
    address: string;
    phone?: string;
  }> = [
    {
      name: "บริษัท เอสเทีย เชียงใหม่ จำกัด",
      taxId: "0505565023357",
      branch: "00000",
      address: "248/56 ถนนมณีนพรัตน์ ต.ศรีภูมิ อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50200",
      phone: "053211888",
    },
    {
      name: "บริษัท รวยรับทรัพย์168 จำกัด",
      taxId: "0505568021002",
      branch: "00000",
      address: "552/4 ถ.เชียงใหม่-ลำพูน ต.หนองหอย อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50000",
      phone: "052010120",
    },
    {
      name: "บริษัท เชียงใหม่ สตาร์ทอัพ จำกัด",
      taxId: "0505561001234",
      branch: "00000",
      address: "88/9 หมู่ 5 ต.สุเทพ อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50200",
      phone: "053211222",
    },
    {
      name: "บริษัท สนีกเกอร์ แคร์ อินเตอร์เนชั่นแนล จำกัด",
      taxId: "0105558000000",
      branch: "00000",
      address: "123/45 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110",
      phone: "027123456",
    },
    {
      name: "บริษัท สยามพิวรรธน์ จำกัด",
      taxId: "0105536098001",
      branch: "00000",
      address: "989 อาคารสยามพิวรรธน์ทาวเวอร์ ถนนพระราม 1 แขวงปทุมวัน เขตปทุมวัน กรุงเทพมหานคร 10330",
      phone: "026581000",
    },
    {
      name: "บริษัท ปตท. จำกัด (มหาชน)",
      taxId: "0107536000017",
      branch: "00000",
      address: "555 ถนนวิภาวดีรังสิต แขวงจตุจักร เขตจตุจักร กรุงเทพมหานคร 10900",
      phone: "025372000",
    },
    {
      name: "บริษัท ซีพี ออลล์ จำกัด (มหาชน)",
      taxId: "0107536000106",
      branch: "00000",
      address: "313 อาคาร ซี.พี.ทาวเวอร์ ถนนสีลม แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500",
      phone: "026779000",
    },
    {
      name: "บริษัท เซ็นทรัลพัฒนา จำกัด (มหาชน)",
      taxId: "0107536000165",
      branch: "00000",
      address: "999/9 ถนนพระราม 1 แขวงปทุมวัน เขตปทุมวัน กรุงเทพมหานคร 10330",
      phone: "026675555",
    },
    {
      name: "บริษัท ไทยเบฟเวอเรจ จำกัด (มหาชน)",
      taxId: "0107546000342",
      branch: "00000",
      address: "14 ถนนวิภาวดีรังสิต แขวงจอมพล เขตจตุจักร กรุงเทพมหานคร 10900",
      phone: "027855555",
    },
    {
      name: "บริษัท แอดวานซ์ อินโฟร์ เซอร์วิส จำกัด (มหาชน)",
      taxId: "0107535000021",
      branch: "00000",
      address: "414 อาคารเอไอเอส ทาวเวอร์ 1 ถนนพหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพมหานคร 10400",
      phone: "020295000",
    },
    {
      name: "บริษัท ช้อปปี้ (ประเทศไทย) จำกัด",
      taxId: "0105558021173",
      branch: "00000",
      address: "1788 อาคารสิงห์ คอมเพล็กซ์ ชั้น 24 ถนนเพชรบุรีตัดใหม่ แขวงบางกะปิ เขตห้วยขวาง กรุงเทพมหานคร 10310",
      phone: "020178399",
    },
  ];

  // 3. Search in persistent sc_settings registry
  // ⚠️ สมุดที่อยู่ลูกค้าเป็นข้อมูลต่อ tenant (ลูกค้าที่เคยออกเอกสารด้วยกัน) ต้องกรอง tenant_id
  // เสมอ ไม่งั้น tenant อื่นจะเห็น/ค้นเจอรายชื่อลูกค้าของ tenant นี้ได้ผ่านช่องค้นหาเดียวกัน
  const dbdTenantId = await tenantFilter(profile);
  try {
    let regQuery = supabase.from("sc_settings")
      .select("value")
      .eq("key", "dbd_company_registry");
    if (dbdTenantId) regQuery = regQuery.eq("tenant_id", dbdTenantId);
    const { data: regSetting } = await regQuery.maybeSingle();

    if (regSetting?.value) {
      const dynamicList: Array<{
        companyName: string;
        taxId: string;
        branchCode: string;
        address: string;
        phone?: string;
      }> = JSON.parse(regSetting.value);

      const dynMatched = dynamicList.find(
        (c) =>
          (cleaned && c.taxId && c.taxId.includes(cleaned)) ||
          (c.companyName && c.companyName.toLowerCase().includes(keyword)) ||
          (c.companyName && keyword.includes(c.companyName.toLowerCase()))
      );

      if (dynMatched) {
        return {
          companyName: dynMatched.companyName,
          taxId: dynMatched.taxId,
          branchCode: dynMatched.branchCode || "00000",
          address: dynMatched.address || "สำนักงานใหญ่",
          phone: dynMatched.phone || "",
          source: "dbd_registry",
        };
      }
    }
  } catch (err) {
    // ล้มเหลวได้ (เช่น dbd_company_registry เป็น JSON ที่ parse ไม่ออก) — ปล่อยให้ไปลองหาต่อใน
    // รายชื่อ built-in แต่ log ไว้เผื่อข้อมูลใน sc_settings เสียจริง
    console.error("[lookupDbdCompany] อ่าน dbd_company_registry ล้มเหลว:", err);
  }

  // 4. Check matching in built-in Thai Registry
  const matched = THAI_DBD_REGISTRY.find(
    (c) =>
      (cleaned && c.taxId.includes(cleaned)) ||
      c.name.toLowerCase().includes(keyword) ||
      keyword.includes(c.name.toLowerCase())
  );

  if (matched) {
    return {
      companyName: matched.name,
      taxId: matched.taxId,
      branchCode: matched.branch || "00000",
      address: matched.address,
      phone: matched.phone || "",
      source: "dbd_registry",
    };
  }

  return null;
}


/**
 * Fetch real catalog of services and inventory items from live database
 */
export async function fetchCatalogItems(): Promise<CatalogItem[]> {
  const profile = await requireProfile();
  requireModuleView(profile, "invoicing");
  const supabase = createAdminClient();
  const catalogTenantId = await tenantFilter(profile);

  let servicesQuery = supabase.from("services").select("id, name, category, base_price").eq("is_active", true);
  let itemsQuery = supabase.from("items").select("id, name, category, base_unit");
  if (catalogTenantId) {
    servicesQuery = servicesQuery.eq("tenant_id", catalogTenantId);
    itemsQuery = itemsQuery.eq("tenant_id", catalogTenantId);
  }

  const [servicesRes, itemsRes] = await Promise.all([servicesQuery, itemsQuery]);

  // ไม่ใส่แพ็กเกจ S/M/L/XL ของสาขาแรกเป็นค่าเริ่มต้น — แต่ละกิจการใช้บริการที่ตั้งเองเท่านั้น
  const catalog: CatalogItem[] = [];

  if (servicesRes.data) {
    servicesRes.data.forEach((s) => {
      catalog.push({
        id: s.id,
        name: s.name,
        category: s.category || "treatment",
        price: Number(s.base_price || 0),
        unit: "งาน",
        source: "service",
      });
    });
  }

  if (itemsRes.data) {
    // `items` เป็น view alias จึงเป็น nullable ทุกคอลัมน์ — แถวที่ไม่มี id/ชื่อ เอาไปแสดง
    // ในแคตตาล็อกไม่ได้อยู่แล้ว (กดเลือกก็ส่งค่าว่าง) ตัดทิ้งตรงนี้ดีกว่าปล่อยให้หลุดไปหน้าจอ
    withId(itemsRes.data).forEach((i) => {
      catalog.push({
        id: i.id,
        name: text(i.name),
        category: "product",
        price: 0,
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
/**
 * เอกสารหนึ่งใบพร้อมลูกค้าและรายการย่อย — อนุมานจาก query จริง ไม่ประกาศมือ
 * เพื่อให้ชนิดตามฐานข้อมูลเสมอเมื่อ regenerate database.types.ts
 */
export type SmartAccDocument = Awaited<ReturnType<typeof fetchSmartAccDocuments>>[number];

export async function fetchSmartAccDocuments(filterType?: DocumentType) {
  const profile = await requireProfile();
  requireModuleView(profile, "invoicing");
  const supabase = createAdminClient();

  let query = supabase
    .schema("extension_layer")
    .from("ext_documents")
    .select("*, ext_contacts(*), ext_document_items(*)")
    .order("created_at", { ascending: false });

  const docsTenantId = await tenantFilter(profile);
  if (docsTenantId) query = query.eq("tenant_id", docsTenantId);
  if (profile.role === "co_admin") query = query.eq("branch_id", profile.branch_id!);
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
  requireModuleWrite(profile, "invoicing");
  const tenantId = await requireTenantId(profile);
  return commitSmartAccDocument(profile, tenantId, payload, false);
}

async function commitSmartAccDocument(profile: Profile, tenantId: string, raw: CreateDocumentPayload, convertSource: boolean) {
  const parsed = documentPayloadSchema.safeParse(raw);
  if (!parsed.success) return { success: false as const, error: validationMessage(parsed.error) };
  const payload = parsed.data;
  try {
    const ctx = await resolveBranchVat(profile);
    if (!ctx.branchId) return { success: false as const, error: "เลือกสาขาที่หัวเว็บก่อนออกเอกสาร" };
    let rate = documentVatRate(ctx.vatRegistered, payload.docType, payload.chargeVat);
    if (isCorrectionType(payload.docType) && payload.refParentDocId) {
      const db = createAdminClient();
      const { data: parent } = await db.schema("extension_layer").from("ext_documents").select("vat_rate").eq("id", payload.refParentDocId).eq("tenant_id", tenantId).maybeSingle();
      if (!parent) return { success: false as const, error: "ไม่พบเอกสารต้นทาง" };
      rate = Number(parent.vat_rate) === 7 ? 7 : 0;
    }
    if (payload.docType === "TAX_INVOICE" && !ctx.vatRegistered) return { success: false as const, error: "สาขานี้ยังไม่จด VAT" };
    const lines = payload.items.map(item => {
      const total = moneyNumber(item.quantity * item.unitPrice - item.discount);
      if (total < 0 || Math.abs(total - item.totalLineAmount) > 0.005) throw new Error("ยอดรายการไม่ตรงกับจำนวน ราคา และส่วนลด");
      return { name: item.itemName, quantity: item.quantity, unit_price: item.unitPrice, discount: item.discount, total };
    });
    const totals = settleDocumentVat(lines.reduce((sum, line) => sum + line.total, 0), rate);
    const seller = await fetchShopProfile();
    if (rate === 7 || payload.docType === "TAX_INVOICE") {
      if (!seller.name.trim() || !seller.address.trim() || !/^\d{13}$/.test(seller.taxId) || /^0+$/.test(seller.taxId)) {
        return { success: false as const, error: "กรอกชื่อ ที่อยู่ และเลขผู้เสียภาษีของร้านให้ครบก่อนออกเอกสาร VAT" };
      }
    }
    const result = await financeRpc("rrs_create_document", {
      p_actor: profile.id, p_tenant: tenantId, p_request: payload.requestId,
      p_data: {
        branch_id: ctx.branchId, doc_type: payload.docType, issue_date: payload.issueDate,
        due_date: payload.dueDate || null, credit_term_days: payload.creditTermDays || 0,
        charge_vat: rate === 7, contact: { company_name: payload.companyName, tax_id: payload.taxId || "", branch_code: payload.branchCode || "00000", address: payload.address || "", phone: payload.phone || "", email: payload.email || "" },
        items: lines, billing_refs: [...new Set(payload.billingRefDocIds || [])],
        source_doc_id: payload.refParentDocId || null, convert_source: convertSource,
        notes: embedSellerSnapshot(payload.notes, planSellerSnapshot(seller)),
        promptpay_payload: payload.promptPayTarget ? generatePromptPayPayload(payload.promptPayTarget, totals.grandTotal) : null,
      },
    });
    await logAudit({ action: "CREATE", entity: "document", entity_id: String(result.id), actor_id: profile.id, actor_name: profile.display_name, tenant_id: tenantId, detail: { doc_number: result.doc_number, doc_type: payload.docType, replay: result.replay } });
    revalidatePath("/invoicing"); revalidatePath("/billing-notes"); revalidatePath("/tax-filing");
    return { success: true as const, docId: String(result.id), docNumber: String(result.doc_number), shareToken: String(result.share_token) };
  } catch (err) {
    return { success: false as const, error: errorMessage(err, "บันทึกเอกสารไม่สำเร็จ") };
  }
}

/**
 * Converts a source document (e.g. Quotation QA-...) to a target document (e.g. Invoice INV-...)
 */
export async function convertDocument(sourceDocId: string, targetDocType: DocumentType) {
  const profile = await requireProfile();
  requireModuleWrite(profile, "invoicing");
  const supabase = createAdminClient();
  let tenantId: string;
  try {
    tenantId = await requireTenantId(profile);
  } catch (err) {
    return { success: false as const, error: errorMessage(err, "ไม่สามารถระบุกิจการที่จะแปลงเอกสารได้") };
  }

  // 1. Fetch Source Document (ต้องเป็นของ tenant ตัวเองเท่านั้น — กัน super_admin/แอดมิน
  // ของ tenant อื่นแปลงเอกสารของ tenant นี้โดยรู้/เดา id)
  const { data: sourceDoc, error } = await supabase
    .schema("extension_layer")
    .from("ext_documents")
    .select("*, ext_contacts(*), ext_document_items(*)")
    .eq("id", sourceDocId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !sourceDoc) {
    return { success: false as const, error: "ไม่พบเอกสารต้นทางที่ต้องการแปลง" };
  }

  if (isCorrectionType(targetDocType)) {
    if (String(sourceDoc.status) === "VOID") {
      return { success: false as const, error: "เอกสารที่ยกเลิกแล้วออกใบลดหนี้/เพิ่มหนี้ไม่ได้" };
    }
  } else if (!canConvertDocument(String(sourceDoc.status))) {
    return { success: false as const, error: "เอกสารที่ยกเลิกหรือแปลงแล้วแปลงต่อไม่ได้" };
  }

  const items: DocumentItemInput[] = (sourceDoc.ext_document_items || []).map((it) => ({
    itemName: it.item_name,
    quantity: Number(it.quantity),
    unitPrice: Number(it.unit_price),
    discount: Number(it.discount || 0),
    totalLineAmount: Number(it.total_line_amount),
  }));

  const payload: CreateDocumentPayload = {
    requestId: `convert:${sourceDocId}:${targetDocType}`,
    docType: targetDocType,
    companyName: sourceDoc.ext_contacts?.company_name || "ลูกค้าทั่วไป",
    taxId: sourceDoc.ext_contacts?.tax_id || undefined,
    branchCode: sourceDoc.ext_contacts?.branch_code || "00000",
    address: sourceDoc.ext_contacts?.address || undefined,
    phone: sourceDoc.ext_contacts?.phone || undefined,
    email: sourceDoc.ext_contacts?.email || undefined,
    issueDate: bangkokToday(),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    creditTermDays: sourceDoc.credit_term_days || 30,
    items,
    notes: `แปลงมาจากเอกสาร ${sourceDoc.doc_number}`,
    refParentDocId: sourceDoc.id,
    refParentDocNumber: sourceDoc.doc_number,
    ...(Number(sourceDoc.vat_rate) === 7 ? { chargeVat: true } : {}),
  };

  const res = await commitSmartAccDocument(profile, tenantId, payload, !isCorrectionType(targetDocType));
  if (!res.success) return res;

  revalidatePath("/invoicing");
  return res;
}

/**
 * ลบเอกสารออกจากประวัติ (เอกสารตัวอย่าง / ออกผิด / ยังไม่ใช้)
 *
 * เลขที่เอกสารไม่ถูกนำกลับมาใช้ — ตัวนับ `ext_numbering_sequences` ไม่ย้อน
 * ใบวางบิลที่อ้างเอกสารนี้เป็นรายการอ้างอิงต้องลบใบวางบิลก่อน (FK `ref_doc_id` ไม่ cascade)
 */
export async function deleteSmartAccDocument(docId: string) {
  const profile = await requireProfile();
  requireModuleWrite(profile, "invoicing");
  return changeDocumentLifecycle(profile, docId, "delete", "");
}

export async function voidSmartAccDocument(docId: string, reason: string) {
  const profile = await requireProfile();
  requireModuleWrite(profile, "invoicing");
  if (reason.trim().length < 2) return { success: false as const, error: "กรุณาระบุเหตุผลที่ยกเลิก" };
  return changeDocumentLifecycle(profile, docId, "void", reason.trim());
}

async function changeDocumentLifecycle(profile: Profile, docId: string, action: "delete" | "void", reason: string) {
  const tenantId = await requireTenantId(profile);
  try {
    const result = await financeRpc("rrs_document_lifecycle", { p_actor: profile.id, p_tenant: tenantId, p_id: docId, p_action: action, p_reason: reason });
    await logAudit({ action: action === "delete" ? "DELETE" : "UPDATE", entity: "document", entity_id: docId, actor_id: profile.id, actor_name: profile.display_name, tenant_id: tenantId, detail: { lifecycle: action, doc_number: result.doc_number, reason, replay: result.replay } });
    revalidatePath("/invoicing"); revalidatePath("/billing-notes"); revalidatePath("/tax-filing");
    return { success: true as const, docNumber: String(result.doc_number) };
  } catch (err) { return { success: false as const, error: errorMessage(err, "เปลี่ยนสถานะเอกสารไม่สำเร็จ") }; }
}

/** เปลี่ยนเลขร่างเป็นเลขทางการ — กินตัวนับครั้งเดียว เลขร่างไม่คืน */
export async function issueSmartAccDocument(docId: string) {
  const profile = await requireProfile();
  requireModuleWrite(profile, "invoicing");
  const tenantId = await requireTenantId(profile);
  try {
    const result = await financeRpc("rrs_issue_document", { p_actor: profile.id, p_tenant: tenantId, p_id: docId });
    await logAudit({ action: "UPDATE", entity: "document", entity_id: docId, actor_id: profile.id, actor_name: profile.display_name, tenant_id: tenantId, detail: { doc_number: result.doc_number, replay: result.replay } });
    revalidatePath("/invoicing"); revalidatePath("/billing-notes"); revalidatePath("/tax-filing");
    return { success: true as const, docNumber: String(result.doc_number) };
  } catch (err) { return { success: false as const, error: errorMessage(err, "ออกเลขเอกสารไม่สำเร็จ") }; }
}

/** ใบส่งของ/ใบแจ้งหนี้ที่ยังไม่ชำระ — อนุมานจาก query จริงเช่นกัน */
export type PendingDeliveryOrderRow = Awaited<ReturnType<typeof fetchPendingDeliveryOrders>>[number];

export async function fetchPendingDeliveryOrders() {
  const profile = await requireProfile();
  requireModuleView(profile, "invoicing");
  const supabase = createAdminClient();

  let query = supabase
    .schema("extension_layer")
    .from("ext_documents")
    .select("id, doc_number, doc_type, issue_date, grand_total, status, ext_contacts(company_name)")
    .in("doc_type", ["DO", "INVOICE"])
    .neq("status", "PAID")
    .neq("status", "VOID");
  const pendingTenantId = await tenantFilter(profile);
  if (pendingTenantId) query = query.eq("tenant_id", pendingTenantId);
  if (profile.role === "co_admin") query = query.eq("branch_id", profile.branch_id!);

  const { data, error } = await query.order("issue_date", { ascending: false });

  if (error) return [];
  return data ?? [];
}

/** ผลลัพธ์ของ fetchTaxFilingData() — อนุมานจาก query จริง ไม่ประกาศมือ */
export type TaxFilingSalesDoc = Awaited<ReturnType<typeof fetchTaxFilingData>>["salesDocs"][number];
export type TaxFilingExpense = Awaited<ReturnType<typeof fetchTaxFilingData>>["expenses"][number];
export type TaxFilingWhtCert = Awaited<ReturnType<typeof fetchTaxFilingData>>["whtCertificates"][number];

export async function fetchTaxFilingData(yearMonth?: string) {
  const profile = await requireProfile();
  requireModuleView(profile, "tax-filing");
  const supabase = createAdminClient();

  // yearMonth ("YYYY-MM") เดิมรับเข้ามาแล้วไม่ถูกใช้เลย — หน้าเว็บกรองเองฝั่ง client
  // จึงยังแสดงถูก แต่ signature โกหกและดึงข้อมูลมาเกินความจำเป็นทุกครั้ง
  let docsQuery = supabase
    .schema("extension_layer")
    .from("ext_documents")
    .select("*, ext_contacts(*)")
    .in("doc_type", ["INVOICE", "TAX_INVOICE", "RECEIPT"])
    .neq("status", "VOID")
    .order("issue_date", { ascending: false });
  let expensesQuery = supabase.from("expenses").select("*").order("expense_date", { ascending: false });

  const taxFilingTenantId = await tenantFilter(profile);
  if (taxFilingTenantId) {
    docsQuery = docsQuery.eq("tenant_id", taxFilingTenantId);
    expensesQuery = expensesQuery.eq("tenant_id", taxFilingTenantId);
  }

  if (yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) {
    docsQuery = docsQuery.like("issue_date", `${yearMonth}%`);
    expensesQuery = expensesQuery.like("expense_date", `${yearMonth}%`);
  }

  const booksQuery = supabase
    .from("sc_sales")
    .select("date, total_revenue, amount_paid")
    .order("date", { ascending: false });
  const payQuery = supabase
    .from("sc_payments")
    .select("sale_date, amount")
    .order("sale_date", { ascending: false });
  const corrQuery = supabase
    .schema("extension_layer")
    .from("ext_documents")
    .select("id, doc_type, doc_number, issue_date, status, grand_total, vat_amount, subtotal_amount")
    .in("doc_type", ["CREDIT_NOTE", "DEBIT_NOTE"])
    .neq("status", "VOID")
    .order("issue_date", { ascending: false });

  const [docsRes, expensesRes, certs, booksRes, payRes, corrRes] = await Promise.all([
    docsQuery,
    expensesQuery,
    fetchWhtCertificates(yearMonth).catch((err) => {
      console.error("[tax-filing] อ่านหนังสือรับรองไม่สำเร็จ:", err);
      return [];
    }),
    (taxFilingTenantId ? booksQuery.eq("tenant_id", taxFilingTenantId) : booksQuery),
    (taxFilingTenantId ? payQuery.eq("tenant_id", taxFilingTenantId) : payQuery),
    (taxFilingTenantId ? corrQuery.eq("tenant_id", taxFilingTenantId) : corrQuery),
  ]);

  return {
    salesDocs: docsRes.data ?? [],
    expenses: expensesRes.data ?? [],
    booksSales: booksRes.data ?? [],
    booksPayments: payRes.data ?? [],
    correctionDocs: corrRes.data ?? [],
    whtCertificates: certs.map((row, i) => ({
      ...certificateToWhtRecord(
        {
          payeeTaxId: row.payeeTaxId,
          payeeName: row.payeeName,
          payeeAddress: row.payeeAddress,
          paymentDate: row.paymentDate,
          incomeType: row.incomeType,
          incomeTypeCode: row.incomeTypeCode,
          whtRate: row.whtRate,
          baseAmount: row.baseAmount,
          taxAmount: row.taxAmount,
          payeeKind: row.payeeKind,
        },
        i + 1
      ),
      certificateNumber: row.certificateNumber,
      direction: row.direction,
      netPayment: row.netPayment,
      vatAmount: row.vatAmount,
    })),
  };
}

export async function logTaxFilingExport(payload: {
  formType: "PND3" | "PND53" | "PP30" | "ETAX_XML";
  filename: string;
  periodYm: string;
  recordCount: number;
}) {
  const profile = await requireProfile();
  requireModuleView(profile, "tax-filing");
  await logAudit({
    action: "EXPORT",
    entity: "document",
    entity_id: payload.filename,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: profile.tenant_id,
    detail: payload,
  });
}


