"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { getSelectedBranchId } from "@/lib/branch";
import { logAudit } from "@/lib/audit";

export type InventoryItemInput = {
  id?: string;
  name: string;
  category?: string;
  item_type?: string;
  base_unit: string;
  purchase_unit?: string;
  current_qty: number;
  avg_unit_cost: number;
  min_stock_level: number;
};

/**
 * เปิด/ปิดการแจ้งเตือนสต๊อกต่ำเฉพาะรายการนี้ (item_stock.alert_muted)
 *
 * ทำไมต้องมี: บาง item (เช่น กาวยาง, อะซิโตน) จงใจสั่งซื้อทีละน้อยจนติดขั้นต่ำอยู่บ่อยๆ
 * โดยตั้งใจ (ไม่ใช่ของหมดจริง) หรือเป็นของใช้ภายในร้านที่ไม่ต้องเติมสต๊อกตามรอบ — ถ้าไม่มีทาง
 * ปิดแจ้งเตือนต่อรายการ พนักงานจะโดนเตือนซ้ำทุกวันจนเมินการแจ้งเตือนจริงๆ ไปด้วย
 *
 * Edge Function inv-low-stock-alert (ที่รันจริงบน production) เช็คคอลัมน์นี้อยู่แล้ว
 * ฟังก์ชันนี้แค่เปิดทางให้ผู้ใช้ตั้งค่าจาก UI เท่านั้น ไม่ต้องแก้อะไรฝั่ง cron/Edge Function
 */
export async function toggleItemAlertMute(itemId: string, muted: boolean) {
  const profile = await requireProfile();
  const branchId = await getSelectedBranchId(profile);
  const supabase = createAdminClient();

  let q = (supabase.from("item_stock" as any) as any)
    .update({ alert_muted: muted })
    .eq("item_id", itemId);
  if (branchId) q = q.eq("branch_id", branchId);

  const { error } = await q;
  if (error) {
    return { success: false, error: "ไม่สามารถเปลี่ยนสถานะการแจ้งเตือนได้: " + error.message };
  }

  await logAudit({
    action: "UPDATE",
    entity: "inventory_item",
    entity_id: itemId,
    actor_id: profile.id,
    actor_name: profile.display_name,
    detail: { alert_muted: muted },
  });

  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Update existing inventory item and its stock level
 */
export async function updateInventoryItem(data: InventoryItemInput) {
  const profile = await requireProfile();
  const branchId = await getSelectedBranchId(profile);
  const supabase = createAdminClient();

  if (!data.id) {
    return { success: false, error: "ไม่พบรหัสสินค้าที่ต้องการแก้ไข" };
  }

  // 1. Update items table
  const { error: itemError } = await (supabase.from("items" as any) as any)
    .update({
      name: data.name.trim(),
      category: data.category?.trim() || "ทั่วไป",
      base_unit: data.base_unit.trim() || "ชิ้น",
      purchase_unit: data.purchase_unit?.trim() || data.base_unit.trim() || "ชิ้น",
      default_min_stock_level: Number(data.min_stock_level || 0),
    })
    .eq("id", data.id);

  if (itemError) {
    return { success: false, error: "ไม่สามารถอัปเดตข้อมูลสินค้าได้: " + itemError.message };
  }

  // 2. Fetch old stock to calculate delta for audit
  let qStock = (supabase.from("item_stock" as any) as any)
    .select("*")
    .eq("item_id", data.id);
  if (branchId) qStock = qStock.eq("branch_id", branchId);
  const { data: existingStock } = await qStock.maybeSingle();

  const oldQty = Number(existingStock?.current_qty ?? 0);
  const newQty = Number(data.current_qty ?? 0);
  const newCost = Number(data.avg_unit_cost ?? 0);
  const newMin = Number(data.min_stock_level ?? 1);

  if (existingStock) {
    // Update existing stock row
    await (supabase.from("item_stock" as any) as any)
      .update({
        current_qty: newQty,
        avg_unit_cost: newCost,
        min_stock_level: newMin,
        last_counted_at: new Date().toISOString(),
      })
      .eq("id", existingStock.id);
  } else {
    // Insert new stock row
    await (supabase.from("item_stock" as any) as any).insert({
      item_id: data.id,
      branch_id: branchId || null,
      current_qty: newQty,
      avg_unit_cost: newCost,
      min_stock_level: newMin,
      last_counted_at: new Date().toISOString(),
    });
  }

  // 3. Record Audit Transaction if quantity changed
  if (oldQty !== newQty) {
    const delta = newQty - oldQty;
    await (supabase.from("stock_transactions" as any) as any).insert({
      item_id: data.id,
      branch_id: branchId || null,
      txn_type: "count_adjustment",
      quantity_delta: delta,
      unit_cost: newCost,
      total_cost: Math.abs(delta) * newCost,
      reason: `แก้ไขสต๊อกโดยตรงผ่านหน้าคลังสินค้า (${oldQty} -> ${newQty} ${data.base_unit})`,
      reference_note: `แก้ไขโดย: ${profile.display_name || profile.username}`,
      status: "approved",
      performed_by: profile.id,
    });
  }

  revalidatePath("/inventory");
  revalidatePath("/history");
  revalidatePath("/dashboard");
  revalidatePath("/reports");

  return { success: true };
}

/**
 * Create new inventory item
 */
export async function createInventoryItem(data: InventoryItemInput) {
  const profile = await requireProfile();
  const branchId = await getSelectedBranchId(profile);
  const supabase = createAdminClient();

  // 1. Insert item
  const { data: newItem, error: itemError } = await (supabase.from("items" as any) as any)
    .insert({
      name: data.name.trim(),
      category: data.category?.trim() || "ทั่วไป",
      item_type: data.item_type || "inventory",
      base_unit: data.base_unit.trim() || "ชิ้น",
      purchase_unit: data.purchase_unit?.trim() || data.base_unit.trim() || "ชิ้น",
      default_min_stock_level: Number(data.min_stock_level || 1),
      is_active: true,
    })
    .select()
    .single();

  if (itemError || !newItem) {
    return { success: false, error: "ไม่สามารถสร้างรายการสินค้าได้: " + (itemError?.message || "") };
  }

  // 2. Insert item_stock
  const initialQty = Number(data.current_qty || 0);
  const unitCost = Number(data.avg_unit_cost || 0);

  await (supabase.from("item_stock" as any) as any).insert({
    item_id: newItem.id,
    branch_id: branchId || null,
    current_qty: initialQty,
    avg_unit_cost: unitCost,
    min_stock_level: Number(data.min_stock_level || 1),
  });

  // 3. Record Initial Stock In transaction if initial qty > 0
  if (initialQty > 0) {
    await (supabase.from("stock_transactions" as any) as any).insert({
      item_id: newItem.id,
      branch_id: branchId || null,
      txn_type: "opening_balance",
      quantity_delta: initialQty,
      unit_cost: unitCost,
      total_cost: initialQty * unitCost,
      reason: "ยอดยกมาเริ่มต้นตอนสร้างรายการสินค้า",
      reference_note: `สร้างโดย: ${profile.display_name || profile.username}`,
      status: "approved",
      performed_by: profile.id,
    });
  }

  revalidatePath("/inventory");
  revalidatePath("/history");
  revalidatePath("/dashboard");
  revalidatePath("/reports");

  return { success: true, item: newItem };
}

/**
 * Delete or deactivate inventory item
 */
export async function deleteInventoryItem(itemId: string) {
  await requireProfile();
  const supabase = createAdminClient();

  // Try delete if no foreign key constraints, else deactivate
  const { error } = await (supabase.from("items" as any) as any)
    .delete()
    .eq("id", itemId);

  if (error) {
    // If foreign key constraint exists, deactivate it
    await (supabase.from("items" as any) as any)
      .update({ is_active: false })
      .eq("id", itemId);
  }

  revalidatePath("/inventory");
  revalidatePath("/history");
  revalidatePath("/dashboard");
  revalidatePath("/reports");

  return { success: true };
}
