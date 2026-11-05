"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireModuleView, requireModuleWrite } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenantId, tenantFilter } from "@/lib/tenant";
import { createHash } from "node:crypto";
import { financeRpc } from "@/lib/finance-rpc";
import { assertPeriodOpen } from "@/lib/period-close-store";
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
  // This function is a public Server Action: never trust tenant/actor arguments.
  const tenantId = await requireTenantId(profile);
  if (input.tenantId !== tenantId) return { success: false, error: "ไม่มีสิทธิ์ทำรายการของกิจการนี้" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate) || !Number.isFinite(Date.parse(input.paymentDate)) || new Date(input.paymentDate).toISOString().slice(0, 10) !== input.paymentDate) {
    return { success: false, error: "วันที่จ่ายไม่ถูกต้อง" };
  }
  const closedError = await assertPeriodOpen(tenantId, input.paymentDate);
  if (closedError) return { success: false, error: closedError };

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
  if (input.legacyOpexId !== undefined) {
    if (!Number.isSafeInteger(input.legacyOpexId) || input.legacyOpexId <= 0) return { success: false, error: "รหัสค่าใช้จ่ายไม่ถูกต้อง" };
    const { data: expense, error: expenseError } = await supabase.from("sc_opex")
      .select("id,amount").eq("id", input.legacyOpexId).eq("tenant_id", tenantId).maybeSingle();
    if (expenseError || !expense || Math.abs(Number(expense.amount) - settlement.grossAmount) > 0.001) {
      return { success: false, error: "ไม่พบค่าใช้จ่ายที่มียอดตรงกันของกิจการนี้" };
    }
  }
  const { data: payee, error: payeeErr } = await supabase
    .from("sc_wht_payees")
    .select("id, kind, name")
    .eq("id", input.payeeId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (payeeErr || !payee) return { success: false, error: "ไม่พบผู้รับเงินของกิจการนี้" };

  const kind: WhtPayeeKind = payee.kind === "juristic" ? "juristic" : "person";
  const formType = pndFormForPayee(kind);
  const income = incomeTypeForCategory(input.category);
  const periodYm = periodYmFromIsoDate(input.paymentDate);
  const from = `${periodYm}-01`;
  const nextMonth = new Date(Date.UTC(Number(periodYm.slice(0, 4)), Number(periodYm.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const { count } = await supabase
    .from("sc_wht_certificates")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("payment_date", from)
    .lt("payment_date", nextMonth);
  const certNo = certificateNumber(periodYm, (count ?? 0) + 1);

  const { data: insertedCertificate, error } = await supabase.from("sc_wht_certificates").insert({
    tenant_id: tenantId,
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
    created_by: profile.id,
  }).select("certificate_number").single();
  if (error) return { success: false, error: error.message };
  if (!insertedCertificate?.certificate_number) return { success: false, error: "ไม่พบเลขหนังสือรับรองที่บันทึก" };
  return { success: true, certificateNumber: insertedCertificate.certificate_number };
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
  const name = String(input.tenantName ?? "").trim();
  const taxId = digits(input.tenantTaxId || "");
  if (!Number.isSafeInteger(input.rentalId) || input.rentalId <= 0 || !name || name.length > 300 || ![0,1,2,3,5].includes(input.whtRate) || (input.whtRate > 0 && taxId.length !== 13)) {
    return { success: false, error: "ข้อมูลหัก ณ ที่จ่ายค่าเช่าไม่ถูกต้อง" };
  }
  const payload = { id: input.rentalId, name, tax_id: taxId, kind: classifyPayeeKindFromTaxId(taxId), wht_rate: input.whtRate };
  const requestId = `rental-wht:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
  try {
    await financeRpc("rrs_record_rental_wht", { p_actor: profile.id, p_tenant: tenantId, p_request: requestId, p_data: payload });
    revalidatePath("/expenses");
    revalidatePath("/tax-filing");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) { return { success: false, error: errorMessage(error, "บันทึกข้อมูลหัก ณ ที่จ่ายไม่สำเร็จ") }; }
}

/** Retained for server callers; issued tax evidence cannot be silently deleted. */
export async function deleteCertificatesForOpex(legacyOpexId: number, tenantId: string): Promise<void> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "expenses");
  const currentTenant = await requireTenantId(profile);
  if (tenantId !== currentTenant) throw new Error("ไม่มีสิทธิ์ทำรายการของกิจการนี้");
  if (!Number.isSafeInteger(legacyOpexId) || legacyOpexId <= 0) throw new Error("รหัสค่าใช้จ่ายไม่ถูกต้อง");
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("sc_wht_certificates").select("id")
    .eq("legacy_opex_id", legacyOpexId).eq("tenant_id", currentTenant).limit(1);
  if (error) throw new Error("ตรวจสอบหนังสือรับรองไม่สำเร็จ จึงยังลบค่าใช้จ่ายไม่ได้");
  if (data?.length) throw new Error("รายการนี้ออกหนังสือรับรอง 50 ทวิแล้ว กรุณาให้ผู้ทำบัญชีตรวจแก้เอกสารก่อน ห้ามลบหลักฐานเดิม");
}
