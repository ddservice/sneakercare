"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireModuleView, requireModuleWrite } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenantId, tenantFilter } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/errors";
import {
  settleWht,
  pndFormForPayee,
  classifyPayeeKindFromTaxId,
  incomeTypeForCategory,
  certificateNumber,
  periodYmFromIsoDate,
  validatePayeeTaxId,
  type WhtPayeeKind,
  type PndFormType,
} from "@/lib/wht";

export type WhtPayee = {
  id: string;
  kind: WhtPayeeKind;
  name: string;
  taxId: string;
  address: string;
};

export type WhtCertificateRow = {
  id: string;
  certificateNumber: string;
  direction: "payable" | "receivable";
  formType: PndFormType;
  paymentDate: string;
  payeeName: string;
  payeeTaxId: string;
  payeeAddress: string;
  payeeKind: WhtPayeeKind;
  incomeType: string;
  incomeTypeCode: string;
  baseAmount: number;
  vatAmount: number;
  grossAmount: number;
  whtRate: number;
  taxAmount: number;
  netPayment: number;
  legacyOpexId: number | null;
  rentalRecordId: number | null;
};

function digits(value: string): string {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

export async function fetchWhtPayees(): Promise<WhtPayee[]> {
  const profile = await requireProfile();
  requireModuleView(profile, "expenses");
  const supabase = createAdminClient();
  let query = supabase
    .from("sc_wht_payees")
    .select("id, kind, name, tax_id, address")
    .eq("is_active", true)
    .order("name");
  const tenantId = await tenantFilter(profile);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((p) => ({
    id: p.id,
    kind: p.kind === "juristic" ? "juristic" : "person",
    name: p.name,
    taxId: p.tax_id,
    address: p.address ?? "",
  }));
}

export async function upsertWhtPayee(input: {
  id?: string;
  kind: WhtPayeeKind;
  name: string;
  taxId: string;
  address?: string;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "expenses");
  const name = input.name.trim();
  if (!name) return { success: false, error: "กรุณาระบุชื่อผู้รับเงิน / เจ้าของตึก" };
  const taxId = digits(input.taxId);
  const taxErr = validatePayeeTaxId(taxId);
  if (taxErr) return { success: false, error: taxErr };

  let tenantId: string;
  try {
    tenantId = await requireTenantId(profile);
  } catch (err) {
    return { success: false, error: errorMessage(err, "เลือกสาขาของกิจการก่อน") };
  }

  const kind: WhtPayeeKind = input.kind === "juristic" ? "juristic" : "person";
  const supabase = createAdminClient();
  const payload = {
    tenant_id: tenantId,
    kind,
    name,
    tax_id: taxId,
    address: input.address?.trim() || null,
    is_active: true,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("sc_wht_payees")
      .update(payload)
      .eq("id", input.id)
      .eq("tenant_id", tenantId)
      .select("id")
      .maybeSingle();
    if (error || !data) return { success: false, error: error?.message ?? "แก้ผู้รับเงินไม่สำเร็จ" };
    return { success: true, id: data.id };
  }

  const { data, error } = await supabase
    .from("sc_wht_payees")
    .upsert(payload, { onConflict: "tenant_id,tax_id" })
    .select("id")
    .maybeSingle();
  if (error || !data) return { success: false, error: error?.message ?? "บันทึกผู้รับเงินไม่สำเร็จ" };
  return { success: true, id: data.id };
}

export async function fetchWhtCertificates(yearMonth?: string): Promise<WhtCertificateRow[]> {
  const profile = await requireProfile();
  requireModuleView(profile, "tax-filing");
  const supabase = createAdminClient();
  let query = supabase
    .from("sc_wht_certificates")
    .select(
      "id, certificate_number, direction, form_type, payment_date, income_type_code, income_type_label, base_amount, vat_amount, gross_amount, wht_rate, tax_amount, net_payment, legacy_opex_id, rental_record_id, payee_id, sc_wht_payees(name, tax_id, address, kind)"
    )
    .order("payment_date", { ascending: true });
  const tenantId = await tenantFilter(profile);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  if (yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) {
    const [y, m] = yearMonth.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    query = query
      .gte("payment_date", `${yearMonth}-01`)
      .lte("payment_date", `${yearMonth}-${String(last).padStart(2, "0")}`);
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((row) => {
    const payee = Array.isArray(row.sc_wht_payees) ? row.sc_wht_payees[0] : row.sc_wht_payees;
    const kind: WhtPayeeKind = payee?.kind === "juristic" ? "juristic" : "person";
    return {
      id: row.id,
      certificateNumber: row.certificate_number,
      direction: row.direction === "receivable" ? "receivable" : "payable",
      formType: row.form_type === "PND3" ? "PND3" : "PND53",
      paymentDate: row.payment_date,
      payeeName: payee?.name ?? "ผู้รับเงิน",
      payeeTaxId: payee?.tax_id ?? "",
      payeeAddress: payee?.address ?? "",
      payeeKind: kind,
      incomeType: row.income_type_label,
      incomeTypeCode: row.income_type_code,
      baseAmount: Number(row.base_amount),
      vatAmount: Number(row.vat_amount),
      grossAmount: Number(row.gross_amount),
      whtRate: Number(row.wht_rate),
      taxAmount: Number(row.tax_amount),
      netPayment: Number(row.net_payment),
      legacyOpexId: row.legacy_opex_id,
      rentalRecordId: row.rental_record_id,
    };
  });
}

export async function issuePayableCertificate(input: {
  payeeId: string;
  paymentDate: string;
  baseAmount: number;
  vatRate?: number;
  whtRate: number;
  category?: string;
  legacyOpexId?: number;
  createdBy?: string | null;
  tenantId: string;
}): Promise<{ success: true; certificateNumber: string } | { success: false; error: string }> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "expenses");
  const settlement = settleWht({
    baseAmount: input.baseAmount,
    vatRate: input.vatRate,
    whtRate: input.whtRate,
    category: input.category,
  });
  if (settlement.whtAmount <= 0) {
    return { success: false, error: "ไม่มียอดหัก ณ ที่จ่าย จึงไม่ออกหนังสือรับรอง" };
  }

  const supabase = createAdminClient();
  const { data: payee, error: payeeErr } = await supabase
    .from("sc_wht_payees")
    .select("id, kind, name")
    .eq("id", input.payeeId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (payeeErr || !payee) return { success: false, error: "ไม่พบผู้รับเงินของกิจการนี้" };

  const kind: WhtPayeeKind = payee.kind === "juristic" ? "juristic" : "person";
  const formType = pndFormForPayee(kind);
  const income = incomeTypeForCategory(input.category);
  const periodYm = periodYmFromIsoDate(input.paymentDate);
  const from = `${periodYm}-01`;
  const { count } = await supabase
    .from("sc_wht_certificates")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", input.tenantId)
    .gte("payment_date", from)
    .lte("payment_date", `${periodYm}-31`);
  const certNo = certificateNumber(periodYm, (count ?? 0) + 1);

  const { error } = await supabase.from("sc_wht_certificates").insert({
    tenant_id: input.tenantId,
    payee_id: payee.id,
    direction: "payable",
    form_type: formType,
    income_type_code: income.code,
    income_type_label: income.label,
    certificate_number: certNo,
    payment_date: input.paymentDate,
    base_amount: settlement.baseAmount,
    vat_amount: settlement.vatAmount,
    gross_amount: settlement.grossAmount,
    wht_rate: settlement.whtRate,
    tax_amount: settlement.whtAmount,
    net_payment: settlement.netPayment,
    legacy_opex_id: input.legacyOpexId ?? null,
    created_by: input.createdBy ?? null,
  });
  if (error) return { success: false, error: error.message };
  return { success: true, certificateNumber: certNo };
}

export async function recordRentalWht(input: {
  rentalId: number;
  tenantName: string;
  tenantTaxId?: string;
  whtRate: number;
}): Promise<{ success: true } | { success: false; error: string }> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "expenses");
  const tenantId = await requireTenantId(profile);
  const supabase = createAdminClient();

  const { data: room, error: findErr } = await supabase
    .from("sc_rental_records")
    .select("id, month, income_amount, tenant_id")
    .eq("id", input.rentalId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (findErr || !room) return { success: false, error: "ไม่พบรายการค่าเช่าห้อง" };

  const settlement = settleWht({
    baseAmount: Number(room.income_amount),
    whtRate: input.whtRate,
    category: "rental_income",
  });

  const taxId = digits(input.tenantTaxId || "");
  const { error } = await supabase
    .from("sc_rental_records")
    .update({
      tenant_name: input.tenantName.trim() || null,
      tenant_tax_id: taxId.length === 13 ? taxId : null,
      wht_rate: settlement.whtRate,
      wht_withheld: settlement.whtAmount,
    })
    .eq("id", room.id)
    .eq("tenant_id", tenantId);
  if (error) return { success: false, error: error.message };

  if (settlement.whtAmount > 0 && taxId.length === 13) {
    const kind = classifyPayeeKindFromTaxId(taxId);
    const payee = await upsertWhtPayee({
      kind,
      name: input.tenantName.trim() || "ผู้เช่า",
      taxId,
    });
    if (payee.success) {
      await supabase
        .from("sc_wht_certificates")
        .delete()
        .eq("rental_record_id", room.id)
        .eq("tenant_id", tenantId);
      const [mm, yyyy] = String(room.month).split("/");
      const paymentDate = yyyy && mm ? `${yyyy}-${mm}-01` : new Date().toISOString().slice(0, 10);
      const income = incomeTypeForCategory("rental_income");
      const periodYm = periodYmFromIsoDate(paymentDate);
      const { count } = await supabase
        .from("sc_wht_certificates")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("payment_date", `${periodYm}-01`)
        .lte("payment_date", `${periodYm}-31`);
      await supabase.from("sc_wht_certificates").insert({
        tenant_id: tenantId,
        payee_id: payee.id,
        direction: "receivable",
        form_type: pndFormForPayee(kind),
        income_type_code: income.code,
        income_type_label: income.label,
        certificate_number: certificateNumber(periodYm, (count ?? 0) + 1),
        payment_date: paymentDate,
        base_amount: settlement.baseAmount,
        vat_amount: 0,
        gross_amount: settlement.grossAmount,
        wht_rate: settlement.whtRate,
        tax_amount: settlement.whtAmount,
        net_payment: settlement.netPayment,
        rental_record_id: room.id,
        created_by: profile.id,
      });
    }
  }

  await logAudit({
    action: "UPDATE",
    entity: "expense",
    entity_id: String(room.id),
    actor_id: profile.id,
    actor_name: profile.display_name,
    detail: {
      kind: "rental_wht_receivable",
      withheld: settlement.whtAmount,
      cash_in: settlement.netPayment,
      income: settlement.grossAmount,
    },
  });
  revalidatePath("/expenses");
  revalidatePath("/tax-filing");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteCertificatesForOpex(legacyOpexId: number, tenantId: string): Promise<void> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "expenses");
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("sc_wht_certificates")
    .delete()
    .eq("legacy_opex_id", legacyOpexId)
    .eq("tenant_id", tenantId);
  if (error) {
    console.error("[wht] ลบหนังสือรับรองไม่สำเร็จ:", error.message);
  }
}
