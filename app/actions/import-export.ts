"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { getSelectedBranchId } from "@/lib/branch";
import { parseSalesRow, parseStockRow, parseExpensesRow } from "@/lib/schemas/import-schemas";

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
  const supabase = createAdminClient();

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
        grand_total: validated.gross_amount || validated.total_revenue,
        discount: validated.discount,
        transfer_amount: validated.transfer_amount,
        cash_amount: validated.cash_amount,
        amount_paid: actualPaid,
        payment_status: status,
        recorded_by: profile.display_name || "Import Tool",
        last_updated: new Date().toISOString(),
      };

      // Check if row exists on same date
      const { data: existing } = await (supabase.from("sc_sales" as any) as any)
        .select("id")
        .eq("date", validated.date)
        .maybeSingle();

      if (existing) {
        await (supabase.from("sc_sales" as any) as any)
          .update(payload)
          .eq("id", existing.id);
      } else {
        await (supabase.from("sc_sales" as any) as any).insert(payload);
      }
      imported++;
    } catch (err: any) {
      failed++;
      errors.push(`แถวที่ ${i + 1}: ${err.message}`);
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
  const profile = await requireProfile();
  const branchId = await getSelectedBranchId(profile);
  const supabase = createAdminClient();

  if (!rows || rows.length === 0) {
    return { success: false, total: 0, imported: 0, failed: 0, errors: ["ไม่พบข้อมูลสำหรับนำเข้า"] };
  }

  if (rows.length > 500) {
    return { success: false, total: rows.length, imported: 0, failed: rows.length, errors: ["จำนวนแถวเกิน 500 รายการต่อครั้ง"] };
  }

  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    // ── Zod validation ──
    const { data: validated, error: validationError } = parseStockRow(r);
    if (validationError || !validated) {
      failed++;
      errors.push(`แถวที่ ${i + 1}: ${validationError ?? "ข้อมูลไม่ถูกต้อง"}`);
      continue;
    }

    try {
      // Check if item exists
      const { data: existingItem } = await (supabase.from("items" as any) as any)
        .select("id")
        .eq("name", validated.name)
        .maybeSingle();

      let itemId = existingItem?.id;

      if (!itemId) {
        const { data: newItem, error: createError } = await (supabase.from("items" as any) as any)
          .insert({
            name: validated.name,
            category: validated.category,
            base_unit: validated.unit,
            purchase_unit: validated.unit,
            default_min_stock_level: validated.min_stock,
            item_type: "inventory",
            is_active: true,
          })
          .select()
          .single();

        if (createError || !newItem) {
          failed++;
          errors.push(`แถวที่ ${i + 1} (${validated.name}): ${createError?.message}`);
          continue;
        }
        itemId = newItem.id;
      }

      // Upsert item_stock
      let qStock = (supabase.from("item_stock" as any) as any)
        .select("id")
        .eq("item_id", itemId);
      if (branchId) qStock = qStock.eq("branch_id", branchId);
      const { data: existingStock } = await qStock.maybeSingle();

      if (existingStock) {
        await (supabase.from("item_stock" as any) as any)
          .update({
            current_qty: validated.qty,
            avg_unit_cost: validated.unit_cost,
            min_stock_level: validated.min_stock,
            last_counted_at: new Date().toISOString(),
          })
          .eq("id", existingStock.id);
      } else {
        await (supabase.from("item_stock" as any) as any).insert({
          item_id: itemId,
          branch_id: branchId || null,
          current_qty: validated.qty,
          avg_unit_cost: validated.unit_cost,
          min_stock_level: validated.min_stock,
        });
      }

      imported++;
    } catch (err: any) {
      failed++;
      errors.push(`แถวที่ ${i + 1}: ${err.message}`);
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
 * Bulk Import Expenses from parsed Excel / CSV rows
 * Row schema validated via Zod before DB write
 */
export async function bulkImportExpenses(rows: Record<string, unknown>[]): Promise<BulkImportResult> {
  const profile = await requireProfile();
  const supabase = createAdminClient();

  if (!rows || rows.length === 0) {
    return { success: false, total: 0, imported: 0, failed: 0, errors: ["ไม่พบข้อมูลสำหรับนำเข้า"] };
  }

  if (rows.length > 500) {
    return { success: false, total: rows.length, imported: 0, failed: rows.length, errors: ["จำนวนแถวเกิน 500 รายการต่อครั้ง"] };
  }

  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    // ── Zod validation ──
    const { data: validated, error: validationError } = parseExpensesRow(r);
    if (validationError || !validated) {
      failed++;
      errors.push(`แถวที่ ${i + 1}: ${validationError ?? "ข้อมูลไม่ถูกต้อง"}`);
      continue;
    }

    try {
      await (supabase.from("sc_expenses" as any) as any).insert({
        date: validated.date,
        category: validated.category,
        item_name: validated.name,
        total_amount: validated.amount,
        pay_method: validated.pay_method,
        recorded_by: profile.display_name || "Import Tool",
        created_at: new Date().toISOString(),
      });

      imported++;
    } catch (err: any) {
      failed++;
      errors.push(`แถวที่ ${i + 1}: ${err.message}`);
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
