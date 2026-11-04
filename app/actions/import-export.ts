"use server";

import { createHash } from "node:crypto";
import { saveDailySale } from "@/app/actions/daily-sales";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile, requireModuleView, requireAdmin } from "@/lib/auth";
import { parseSalesRow } from "@/lib/schemas/import-schemas";
import { requireTenantId } from "@/lib/tenant";
import { assertPeriodOpen } from "@/lib/period-close-store";

export type BulkImportResult = {
  success: boolean;
  total: number;
  imported: number;
  failed: number;
  errors: string[];
};

/**
 * Bulk Import Sales Data from parsed Excel / CSV rows
 * Row schema validated via Zod before DB write
 */
export async function bulkImportSales(rows: Record<string, unknown>[]): Promise<BulkImportResult> {
  const profile = await requireProfile();
  requireModuleView(profile, "reports");
  requireAdmin(profile);
  const supabase = createAdminClient();
  const tenantId = await requireTenantId(profile);

  if (!rows || rows.length === 0) {
    return { success: false, total: 0, imported: 0, failed: 0, errors: ["ไม่พบข้อมูลสำหรับนำเข้า"] };
  }

  // Guard: max 1000 rows per import
  if (rows.length > 1000) {
    return { success: false, total: rows.length, imported: 0, failed: rows.length, errors: ["จำนวนแถวเกิน 1,000 รายการต่อครั้ง"] };
  }

  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    // ── Zod validation ──
    const { data: validated, error: validationError } = parseSalesRow(r);
    if (validationError || !validated) {
      failed++;
      errors.push(`แถวที่ ${i + 1}: ${validationError ?? "ข้อมูลไม่ถูกต้อง"}`);
      continue;
    }

    const closedSale = await assertPeriodOpen(tenantId, validated.date);
    if (closedSale) {
      failed++;
      errors.push(`แถวที่ ${i + 1}: ${closedSale}`);
      continue;
    }

    try {
      const actualPaid = validated.transfer_amount + validated.cash_amount;
      const status =
        actualPaid >= validated.total_revenue && validated.total_revenue > 0
          ? "ชำระครบ"
          : "ค้างชำระ";

      const payload = {
        date: validated.date,
        size_s: validated.size_s,
        size_m: validated.size_m,
        size_l: validated.size_l,
        size_xl: validated.size_xl,
        total_revenue: validated.total_revenue,
        gross_amount: validated.gross_amount || validated.total_revenue + validated.discount,
        grand_total: validated.total_revenue,
        discount: validated.discount,
        transfer_amount: validated.transfer_amount,
        cash_amount: validated.cash_amount,
        amount_paid: actualPaid,
        payment_status: status,
        recorded_by: profile.display_name || "Import Tool",
        tenant_id: tenantId,
      };

      const { data: existing, error: lookupError } = await supabase.from("sc_sales").select("id").eq("date", validated.date).eq("tenant_id", tenantId).limit(1);
      if (lookupError) throw new Error("อ่านยอดขายเดิมไม่ได้");
      if (existing?.length) throw new Error("วันนี้มีรายการขายแล้ว กรุณาตรวจและแก้จากหน้ายอดขาย ไม่เขียนทับผ่านไฟล์นำเข้า");
      const hash = createHash("sha256").update(tenantId + JSON.stringify(payload)).digest("hex").slice(0,32);
      const requestId = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
      const result = await saveDailySale({ ...payload, clientRequestId: requestId });
      if (!result.success) throw new Error(result.error || "นำเข้าไม่สำเร็จ");
      imported++;
    } catch (err) {
      failed++;
      errors.push(`แถวที่ ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  revalidatePath("/", "layout");

  return {
    success: imported > 0,
    total: rows.length,
    imported,
    failed,
    errors,
  };
}

/**
 * Bulk Import Inventory Stock from parsed Excel / CSV rows
 * Row schema validated via Zod before DB write
 */
export async function bulkImportStock(rows: Record<string, unknown>[]): Promise<BulkImportResult> {
  const profile = await requireProfile(); requireModuleView(profile, "reports"); requireAdmin(profile);
  return { success: false, total: rows.length, imported: 0, failed: rows.length, errors: ["นำเข้าทับยอดคลังไม่ได้ กรุณาใช้รับซื้อเข้าคลัง หรือปรับยอดตรวจนับพร้อมเหตุผล เพื่อเก็บประวัติและต้นทุนครบถ้วน"] };
}

export async function bulkImportExpenses(rows: Record<string, unknown>[]): Promise<BulkImportResult> {
  const profile = await requireProfile(); requireModuleView(profile, "reports"); requireAdmin(profile);
  return { success: false, total: rows.length, imported: 0, failed: rows.length, errors: ["กรุณาบันทึกจากหน้าค่าใช้จ่าย เพื่อให้ยอดและเอกสารหัก ณ ที่จ่ายเข้าระบบหลัก การนำเข้ารายจ่ายเก่าที่ไม่เชื่อมยอดถูกปิดแล้ว"] };
}
