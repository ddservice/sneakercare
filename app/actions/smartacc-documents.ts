"use server";

// ✅ [multi-tenant 2026-09-17] ext_contacts/ext_documents/ext_document_items/
// ext_billing_references มี tenant_id แล้ว (migration 0036) — ทุก query ในไฟล์นี้กรอง/ระบุ
// tenant_id ตามด้วย tenantFilter()/requireTenantId() แล้วครบทุกจุด
import { revalidatePath } from "next/cache";
import { requireProfile, requireModuleView, requireModuleWrite } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDocumentNumber, type DocumentType } from "@/lib/smartacc/numbering";
import { generatePromptPayPayload } from "@/lib/smartacc/promptpay";
import { withId, text } from "@/lib/db-rows";
import { requireTenantId, tenantFilter } from "@/lib/tenant";
import { getSelectedBranchId } from "@/lib/branch";
import { resolveBranchVat } from "@/lib/branch-vat";
import { errorMessage } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { fetchWhtCertificates } from "@/app/actions/wht";
import { certificateToWhtRecord } from "@/lib/wht";
import {
  canIssueTaxInvoice,
  documentVatRate,
  settleDocumentVat,
} from "@/lib/vat";

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
  const supabase = createAdminClient();
  let tenantId: string;
  try {
    tenantId = await requireTenantId(profile);
  } catch (err) {
    return { success: false as const, error: errorMessage(err, "ไม่สามารถระบุกิจการที่จะออกเอกสารได้") };
  }

  // 1. VAT — อ่านจากสาขาที่เลือก ไม่เชื่อค่าจากหน้าจอ (แต่ละสาขาคนละนิติบุคคล)
  const vatCtx = await resolveBranchVat(profile);
  if (payload.docType === "TAX_INVOICE" && !vatCtx.branchSelected) {
    return {
      success: false as const,
      error: "เลือกสาขาที่หัวเว็บก่อน — VAT เป็นของแต่ละสาขา (คนละนิติบุคคล)",
    };
  }
  const vatRegistered = vatCtx.vatRegistered;

  if (payload.docType === "TAX_INVOICE" && !canIssueTaxInvoice(vatRegistered)) {
    const branchHint = vatCtx.branchName ? `สาขา ${vatCtx.branchName}` : "สาขานี้";
    return {
      success: false as const,
      error: `${branchHint} ยังไม่จด VAT จึงออกใบกำกับภาษีไม่ได้ — ตั้งค่าในการ์ดสาขาที่ /settings หรือออกใบเสร็จเงินสด`,
    };
  }

  const subtotal = payload.items.reduce((sum, item) => sum + item.totalLineAmount, 0);
  const vatRate = documentVatRate(vatRegistered, payload.docType, payload.chargeVat);
  const totals = settleDocumentVat(subtotal, vatRate);
  const vatAmount = totals.vatAmount;
  const grandTotal = totals.grandTotal;

  // 2. Generate Standard Numbering: PREFIX-YYYYMMDD-XXXX (ตัวนับแยกต่อ tenant — migration 0036)
  const docNumber = await generateDocumentNumber(payload.docType, tenantId, new Date(payload.issueDate));
  const shareToken = "doc_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

  // 3. Generate Dynamic PromptPay QR Payload
  let promptpayPayload: string | null = null;
  if (payload.promptPayTarget) {
    promptpayPayload = generatePromptPayPayload(payload.promptPayTarget, grandTotal);
  }

  const customerName = payload.companyName.trim();
  if (!customerName) {
    return { success: false as const, error: "กรุณาระบุชื่อลูกค้าบนเอกสาร" };
  }

  // 4. Upsert Contact — ต้องได้ contact_id จริงก่อนออกเอกสาร ไม่งั้นใบเสนอราคา/ใบแจ้งหนี้
  // พิมพ์โดยไม่มีชื่อลูกค้า (เจอจริง: เดิมประกาศ contactId = null แล้วไม่เคย insert ext_contacts)
  const taxDigits = (payload.taxId || "").replace(/\D/g, "");
  let contactQuery = supabase
    .schema("extension_layer")
    .from("ext_contacts")
    .select("id")
    .eq("tenant_id", tenantId);
  if (taxDigits.length === 13) {
    contactQuery = contactQuery.eq("tax_id", taxDigits);
  } else {
    contactQuery = contactQuery.eq("company_name", customerName);
  }
  const { data: existingRows } = await contactQuery.limit(1);
  const existingContact = existingRows?.[0] ?? null;

  const contactFields = {
    company_name: customerName,
    tax_id: taxDigits || payload.taxId || null,
    branch_code: payload.branchCode || "00000",
    address: payload.address || null,
    phone: payload.phone || null,
    email: payload.email || null,
    tenant_id: tenantId,
  };

  let contactId: string | null = existingContact?.id ?? null;
  if (contactId) {
    await supabase.schema("extension_layer").from("ext_contacts").update(contactFields).eq("id", contactId);
  } else {
    const { data: insertedContact, error: contactErr } = await supabase
      .schema("extension_layer")
      .from("ext_contacts")
      .insert(contactFields)
      .select("id")
      .single();
    if (contactErr || !insertedContact) {
      return { success: false as const, error: `บันทึกชื่อลูกค้าไม่สำเร็จ: ${contactErr?.message ?? "ไม่ทราบสาเหตุ"}` };
    }
    contactId = insertedContact.id;
  }

  if (payload.companyName) {
    try {
      // สมุดที่อยู่ลูกค้าเป็นข้อมูลต่อ tenant ไม่ใช่ของกลาง — ใช้ tenantId ที่ได้มาแล้วตอนต้นฟังก์ชัน
      const { data: regSetting } = await supabase.from("sc_settings")
        .select("value")
        .eq("key", "dbd_company_registry")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      // สมุดที่อยู่ลูกค้าที่เก็บเป็น JSON ก้อนเดียวใน sc_settings (ดูหัวข้อ SmartAcc ข้อ 4 ใน CLAUDE.md)
      let currentRegistry: DbdRegistryEntry[] = [];
      if (regSetting?.value) {
        currentRegistry = JSON.parse(regSetting.value);
      }

      const existingIdx = currentRegistry.findIndex(
        (c) => (payload.taxId && c.taxId === payload.taxId) || c.companyName === payload.companyName
      );

      const newEntry = {
        companyName: payload.companyName,
        taxId: payload.taxId || "",
        branchCode: payload.branchCode || "00000",
        address: payload.address || "",
        phone: payload.phone || "",
        email: payload.email || "",
      };

      if (existingIdx >= 0) {
        currentRegistry[existingIdx] = { ...currentRegistry[existingIdx], ...newEntry };
      } else {
        currentRegistry.unshift(newEntry);
      }

      await supabase.from("sc_settings").upsert(
        {
          key: "dbd_company_registry",
          value: JSON.stringify(currentRegistry.slice(0, 100)),
          tenant_id: tenantId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,key" }
      );
    } catch (err) {
      // เอกสารหลักสร้างสำเร็จไปแล้ว แค่การ "จำลูกค้าไว้ค้นครั้งถัดไป" ล้มเหลว — ไม่ทำให้ทั้ง
      // ฟังก์ชันพัง แต่ log ไว้ ไม่งั้นจะดูเหมือนฟีเจอร์จำลูกค้าใช้งานได้ทั้งที่จริงๆ เขียนไม่ลง
      console.error("[createDocument] บันทึกลูกค้าลง dbd_company_registry ล้มเหลว:", err);
    }
  }

  // 5. Insert Document
  //
  // ⚠️ [แก้บั๊กจริง 2026-09-17] เดิมใส่ `profile.branch_id` ตรงๆ แต่คอลัมน์นี้ FK ไป
  // `extension_layer.ext_branches` (ตารางว่างที่แอปไม่เคยใช้) ในขณะที่ UUID ของโปรไฟล์ชี้
  // `inv_branches` ⇒ insert โดนปฏิเสธทุกครั้ง แล้ว `throw` ทำให้ Next โชว์ overlay
  // "Server Components render" แทนข้อความไทย ตอนนี้ใช้สาขาที่เลือกที่หัวเว็บ (คุกกี้) และถ้า
  // FK เก่ายังไม่ย้าย (ก่อน apply 0039) ลองใส่ null อีกรอบ — เอกสารผูก tenant อยู่แล้ว
  const selectedBranchId = await getSelectedBranchId(profile);
  const docRow = {
    doc_type: payload.docType,
    doc_number: docNumber,
    contact_id: contactId,
    tenant_id: tenantId,
    issue_date: payload.issueDate,
    due_date: payload.dueDate || null,
    credit_term_days: payload.creditTermDays || 0,
    status: "DRAFT" as const,
    subtotal_amount: totals.subtotal,
    discount_amount: 0.0,
    vat_rate: vatRate,
    vat_amount: vatAmount,
    grand_total: grandTotal,
    promptpay_payload: promptpayPayload,
    share_token: shareToken,
    notes: payload.notes || null,
    ref_parent_doc_id: payload.refParentDocId || null,
    ref_parent_doc_number: payload.refParentDocNumber || null,
  };

  const insertDoc = (branchId: string | null) =>
    supabase
      .schema("extension_layer")
      .from("ext_documents")
      .insert({ ...docRow, branch_id: branchId })
      .select("id, doc_number")
      .single();

  let { data: doc, error: docErr } = await insertDoc(selectedBranchId);
  if (docErr && selectedBranchId && /ext_documents_branch_id_fkey/.test(docErr.message)) {
    ({ data: doc, error: docErr } = await insertDoc(null));
  }

  if (docErr || !doc) {
    return { success: false as const, error: `สร้างเอกสารไม่สำเร็จ: ${docErr?.message ?? "ไม่ทราบสาเหตุ"}` };
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
      tenant_id: tenantId,
    }));

    await supabase
      .schema("extension_layer")
      .from("ext_document_items")
      .insert(lineItems);
  }

  // 7. Insert Billing References if converting DOs
  if (payload.billingRefDocIds && payload.billingRefDocIds.length > 0) {
    for (const refId of payload.billingRefDocIds) {
      await supabase
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
          tenant_id: tenantId,
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

  const items: DocumentItemInput[] = (sourceDoc.ext_document_items || []).map((it) => ({
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
    ...(Number(sourceDoc.vat_rate) === 7 ? { chargeVat: true } : {}),
  };

  const res = await createSmartAccDocument(payload);
  if (!res.success) return res;

  // Update source doc status
  await supabase
    .schema("extension_layer")
    .from("ext_documents")
    .update({ status: "CONVERTED" })
    .eq("id", sourceDocId)
    .eq("tenant_id", tenantId);

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
  const supabase = createAdminClient();
  let tenantId: string;
  try {
    tenantId = await requireTenantId(profile);
  } catch (err) {
    return { success: false as const, error: errorMessage(err, "ไม่สามารถระบุกิจการที่จะลบเอกสารได้") };
  }

  const { data: doomed, error: fetchErr } = await supabase
    .schema("extension_layer")
    .from("ext_documents")
    .select("id, doc_type, doc_number, issue_date, status, grand_total, notes, ref_parent_doc_number, ext_contacts(company_name, tax_id)")
    .eq("id", docId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchErr || !doomed) {
    return { success: false as const, error: "ไม่พบเอกสารที่ต้องการลบ" };
  }

  const { data: billedAs } = await supabase
    .schema("extension_layer")
    .from("ext_billing_references")
    .select("billing_note_id")
    .eq("ref_doc_id", docId)
    .eq("tenant_id", tenantId)
    .limit(8);

  if (billedAs && billedAs.length > 0) {
    const noteIds = billedAs
      .map((row) => row.billing_note_id)
      .filter((id): id is string => Boolean(id));
    const { data: notes } = noteIds.length
      ? await supabase
          .schema("extension_layer")
          .from("ext_documents")
          .select("doc_number")
          .in("id", noteIds)
          .eq("tenant_id", tenantId)
      : { data: [] as { doc_number: string }[] };
    const nums = (notes ?? []).map((n) => n.doc_number).filter(Boolean).join(", ");
    return {
      success: false as const,
      error: `เอกสารถูกอ้างในใบวางบิล${nums ? ` (${nums})` : ""} — ลบใบวางบิลนั้นก่อน`,
    };
  }

  const { error: slipErr } = await supabase
    .schema("extension_layer")
    .from("ext_slip_verifications")
    .delete()
    .eq("document_id", docId);
  if (slipErr) {
    console.error("[invoicing] ลบสลิปที่ผูกเอกสารไม่สำเร็จ:", slipErr.message);
  }

  const { error } = await supabase
    .schema("extension_layer")
    .from("ext_documents")
    .delete()
    .eq("id", docId)
    .eq("tenant_id", tenantId);

  if (error) {
    return { success: false as const, error: `ลบเอกสารไม่ได้: ${error.message}` };
  }

  const contact = doomed.ext_contacts;
  await logAudit({
    action: "DELETE",
    entity: "document",
    entity_id: doomed.doc_number,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: {
      id: doomed.id,
      doc_type: doomed.doc_type,
      doc_number: doomed.doc_number,
      issue_date: doomed.issue_date,
      status: doomed.status,
      grand_total: doomed.grand_total,
      company_name: contact?.company_name ?? null,
      tax_id: contact?.tax_id ?? null,
      notes: doomed.notes,
    },
  });

  revalidatePath("/invoicing");
  revalidatePath("/billing-notes");
  revalidatePath("/tax-filing");
  return { success: true as const, docNumber: doomed.doc_number };
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
    .neq("status", "PAID");
  const pendingTenantId = await tenantFilter(profile);
  if (pendingTenantId) query = query.eq("tenant_id", pendingTenantId);

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

  const [docsRes, expensesRes, certs] = await Promise.all([
    docsQuery,
    expensesQuery,
    fetchWhtCertificates(yearMonth).catch((err) => {
      console.error("[tax-filing] อ่านหนังสือรับรองไม่สำเร็จ:", err);
      return [];
    }),
  ]);

  return {
    salesDocs: docsRes.data ?? [],
    expenses: expensesRes.data ?? [],
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


