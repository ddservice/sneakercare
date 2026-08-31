"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { getSelectedBranchId } from "@/lib/branch";

export type BulkImportResult = {
  success: boolean;
  total: number;
  imported: number;
  failed: number;
  errors: string[];
};

/**
 * Bulk Import Sales Data from parsed Excel / CSV rows
 */
export async function bulkImportSales(rows: any[]): Promise<BulkImportResult> {
  const profile = await requireProfile();
  const supabase = createAdminClient();

  if (!rows || rows.length === 0) {
    return { success: false, total: 0, imported: 0, failed: 0, errors: ["ไม่พบข้อมูลสำหรับนำเข้า"] };
  }

  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const dateStr = String(r["วันที่"] || r["date"] || r[0] || "").trim();
      if (!dateStr) {
        failed++;
        continue;
      }

      // Convert DD/MM/YYYY or YYYY-MM-DD
      let isoDate = dateStr;
      if (dateStr.includes("/")) {
        const parts = dateStr.split("/");
        if (parts.length === 3) {
          const [d, m, y] = parts;
          const yearNum = parseInt(y);
          const finalYear = yearNum > 2500 ? yearNum - 543 : yearNum;
          isoDate = `${finalYear}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        }
      }

      const sizeS = Number(r["Package S"] || r["Package S (200฿)"] || r["Size S"] || r["size_s"] || r[3] || 0);
      const sizeM = Number(r["Package M"] || r["Package M (400฿)"] || r["Size M"] || r["size_m"] || r[4] || 0);
      const sizeL = Number(r["Package L"] || r["Package L (600฿)"] || r["Size L"] || r["size_l"] || r[5] || 0);
      const sizeXL = Number(r["Package XL"] || r["Package XL (800฿)"] || r["Size XL"] || r["size_xl"] || r[6] || 0);

      const totalRevenue = Number(r["ยอดสุทธิ"] || r["ยอดรวม"] || r["total_revenue"] || r[7] || 0);
      const transferAmount = Number(r["ยอดเงินโอน"] || r["transfer_amount"] || r[8] || 0);
      const cashAmount = Number(r["ยอดเงินสด"] || r["cash_amount"] || r[9] || 0);
      const discount = Number(r["ส่วนลด"] || r["discount"] || r[11] || 0);
      const grossAmount = Number(r["ยอดก่อนลด"] || r["gross_amount"] || r[12] || totalRevenue);

      const actualPaid = transferAmount + cashAmount;
      const status = actualPaid >= totalRevenue && totalRevenue > 0 ? "ชำระครบ" : "ค้างชำระ";

      const payload = {
        date: isoDate,
        size_s: sizeS,
        size_m: sizeM,
        size_l: sizeL,
        size_xl: sizeXL,
        total_revenue: totalRevenue,
        grand_total: grossAmount,
        discount: discount,
        transfer_amount: transferAmount,
        cash_amount: cashAmount,
        amount_paid: actualPaid,
        payment_status: status,
        recorded_by: profile.display_name || "Import Tool",
        last_updated: new Date().toISOString(),
      };

      // Check if row exists on same date
      const { data: existing } = await (supabase.from("sc_sales" as any) as any)
        .select("id")
        .eq("date", isoDate)
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

  revalidatePath("/pos/daily-entry");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/statistics");

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
 */
export async function bulkImportStock(rows: any[]): Promise<BulkImportResult> {
  const profile = await requireProfile();
  const branchId = await getSelectedBranchId(profile);
  const supabase = createAdminClient();

  if (!rows || rows.length === 0) {
    return { success: false, total: 0, imported: 0, failed: 0, errors: ["ไม่พบข้อมูลสำหรับนำเข้า"] };
  }

  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const name = String(r["รายการวัสดุ"] || r["รายการสินค้า"] || r["name"] || r[0] || "").trim();
      if (!name) {
        failed++;
        continue;
      }

      const category = String(r["หมวดหมู่"] || r["category"] || r[1] || "ทั่วไป").trim();
      const unit = String(r["หน่วย"] || r["หน่วยนับ"] || r["unit"] || r[2] || "ชิ้น").trim();
      const qty = Number(r["คงเหลือ"] || r["จำนวน"] || r["qty"] || r[3] || 0);
      const unitCost = Number(r["ราคาต้นทุน"] || r["ราคาล่าสุด"] || r["cost"] || r[4] || 0);
      const minStock = Number(r["จุดสั่งซื้อขั้นต่ำ"] || r["min_alert"] || r[5] || 1);

      // Check if item exists
      const { data: existingItem } = await (supabase.from("items" as any) as any)
        .select("id")
        .eq("name", name)
        .maybeSingle();

      let itemId = existingItem?.id;

      if (!itemId) {
        // Create item
        const { data: newItem, error: createError } = await (supabase.from("items" as any) as any)
          .insert({
            name,
            category,
            base_unit: unit,
            purchase_unit: unit,
            default_min_stock_level: minStock,
            item_type: "inventory",
            is_active: true,
          })
          .select()
          .single();

        if (createError || !newItem) {
          failed++;
          errors.push(`แถวที่ ${i + 1} (${name}): ${createError?.message}`);
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
            current_qty: qty,
            avg_unit_cost: unitCost,
            min_stock_level: minStock,
            last_counted_at: new Date().toISOString(),
          })
          .eq("id", existingStock.id);
      } else {
        await (supabase.from("item_stock" as any) as any).insert({
          item_id: itemId,
          branch_id: branchId || null,
          current_qty: qty,
          avg_unit_cost: unitCost,
          min_stock_level: minStock,
        });
      }

      imported++;
    } catch (err: any) {
      failed++;
      errors.push(`แถวที่ ${i + 1}: ${err.message}`);
    }
  }

  revalidatePath("/inventory");
  revalidatePath("/history");
  revalidatePath("/dashboard");

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
 */
export async function bulkImportExpenses(rows: any[]): Promise<BulkImportResult> {
  const profile = await requireProfile();
  const supabase = createAdminClient();

  if (!rows || rows.length === 0) {
    return { success: false, total: 0, imported: 0, failed: 0, errors: ["ไม่พบข้อมูลสำหรับนำเข้า"] };
  }

  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const dateStr = String(r["วันที่"] || r["date"] || r[0] || "").trim();
      const name = String(r["รายการ"] || r["ชื่อรายการ"] || r["item_name"] || r[2] || "").trim();
      const amount = Number(r["จำนวนเงิน"] || r["ยอดรวม"] || r["amount"] || r[3] || 0);

      if (!dateStr || !name || amount <= 0) {
        failed++;
        continue;
      }

      const category = String(r["หมวดหมู่"] || r["category"] || r[1] || "ทั่วไป").trim();
      const payMethod = String(r["ช่องทางชำระ"] || r["pay_method"] || r[4] || "เงินสด").trim();

      await (supabase.from("sc_expenses" as any) as any).insert({
        date: dateStr,
        category,
        item_name: name,
        total_amount: amount,
        pay_method: payMethod,
        recorded_by: profile.display_name || "Import Tool",
        created_at: new Date().toISOString(),
      });

      imported++;
    } catch (err: any) {
      failed++;
      errors.push(`แถวที่ ${i + 1}: ${err.message}`);
    }
  }

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  revalidatePath("/reports");

  return {
    success: imported > 0,
    total: rows.length,
    imported,
    failed,
    errors,
  };
}
