"use server";

// ✅ [multi-tenant 2026-09-17] ext_staged_expenses มี tenant_id แล้ว (migration 0036) —
// ทุก query ในไฟล์นี้กรอง/ระบุ tenant_id ตามด้วย tenantFilter()/requireTenantId()
import { revalidatePath } from "next/cache";
import { requireProfile, requireModuleView, requireModuleWrite } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyBankSlip, type SlipVerificationResult } from "@/lib/smartacc/slip-verifier";
import { requireTenantId, tenantFilter } from "@/lib/tenant";
import { planInAppReceiptOcr } from "@/lib/receipt-staging";

export async function verifyBankSlipAction(
  qrPayload: string,
  targetDocumentId?: string
): Promise<SlipVerificationResult> {
  const profile = await requireProfile();
  requireModuleView(profile, "expenses");
  return verifyBankSlip(qrPayload, targetDocumentId);
}

export type StagedExpenseResult = {
  id: string;
  vendorName: string;
  taxId: string;
  date: string;
  subtotal: number;
  vatAmount: number;
  whtAmount: number;
  totalAmount: number;
  suggestedAccountCode: string;
  approvalStatus: string;
};

/**
 * รับรูปใบเสร็จ — OCR ในแอปยังไม่เปิด ห้ามเดายอดแล้วลงคิว
 */
export async function parseAndStageReceiptOcr(
  _imageBase64OrUrl: string
): Promise<{ success: false; error: string }> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "expenses");
  await requireTenantId(profile);
  const planned = planInAppReceiptOcr();
  return { success: false, error: planned.error };
}

export async function approveStagedExpense(expenseId: string, accountCode?: string) {
  const profile = await requireProfile();
  requireModuleWrite(profile, "expenses");
  const supabase = createAdminClient();
  const tenantId = await requireTenantId(profile);

  const { error } = await supabase
    .schema("extension_layer")
    .from("ext_staged_expenses")
    .update({
      approval_status: "APPROVED",
      suggested_account_code: accountCode || undefined,
    })
    .eq("id", expenseId)
    .eq("tenant_id", tenantId);

  if (error) throw new Error(`อนุมัติไม่สำเร็จ: ${error.message}`);

  revalidatePath("/expenses-ocr");
  return { success: true };
}

export async function fetchStagedExpenses() {
  const profile = await requireProfile();
  requireModuleView(profile, "expenses");
  const supabase = createAdminClient();

  let query = supabase
    .schema("extension_layer")
    .from("ext_staged_expenses")
    .select("*, ext_chart_of_accounts(account_name_th)");
  const stagedTenantId = await tenantFilter(profile);
  if (stagedTenantId) query = query.eq("tenant_id", stagedTenantId);

  const { data } = await query.order("created_at", { ascending: false });

  return data ?? [];
}
