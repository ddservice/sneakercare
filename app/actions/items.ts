"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireAdmin } from "@/lib/auth";
import type { ItemType } from "@/lib/supabase/database.types";

export type ItemActionState = { error?: string; success?: boolean } | undefined;

function parseItemForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    item_type: String(formData.get("item_type") ?? "") as ItemType,
    category: String(formData.get("category") ?? "").trim(),
    base_unit: String(formData.get("base_unit") ?? "").trim(),
    purchase_unit: String(formData.get("purchase_unit") ?? "").trim(),
    purchase_unit_qty: Number(formData.get("purchase_unit_qty")),
    default_min_stock_level: Number(formData.get("default_min_stock_level") ?? 0),
    sku: String(formData.get("sku") ?? "").trim() || null,
  };
}

// เพิ่มสินค้าใหม่เข้าแคตตาล็อกกลาง — Admin เท่านั้น (บังคับซ้ำที่ RLS: p_items_write_admin_only)
// ดู docs/architecture.md §3.1 ทำไม catalog กลางแก้ได้เฉพาะ Admin (กระทบทุกสาขา)
export async function createItem(_prev: ItemActionState, formData: FormData): Promise<ItemActionState> {
  const profile = await requireProfile();
  requireAdmin(profile);

  const fields = parseItemForm(formData);
  if (!fields.name || !fields.item_type || !fields.category || !fields.base_unit || !fields.purchase_unit) {
    return { error: "กรุณากรอกข้อมูลให้ครบทุกช่องที่จำเป็น" };
  }
  if (!fields.purchase_unit_qty || fields.purchase_unit_qty <= 0) {
    return { error: "จำนวนหน่วยฐานต่อหน่วยซื้อต้องมากกว่า 0" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("items").insert(fields);

  if (error) {
    return { error: `บันทึกไม่สำเร็จ: ${error.message}` };
  }

  revalidatePath("/admin/items");
  revalidatePath("/stock-in");
  revalidatePath("/stock-out");
  revalidatePath("/adjustments");
  return { success: true };
}

export async function updateItem(
  _prev: ItemActionState,
  formData: FormData
): Promise<ItemActionState> {
  const profile = await requireProfile();
  requireAdmin(profile);

  const id = String(formData.get("id") ?? "");
  const fields = parseItemForm(formData);
  if (!id) return { error: "ไม่พบสินค้า" };
  if (!fields.name || !fields.item_type || !fields.category || !fields.base_unit || !fields.purchase_unit) {
    return { error: "กรุณากรอกข้อมูลให้ครบทุกช่องที่จำเป็น" };
  }
  if (!fields.purchase_unit_qty || fields.purchase_unit_qty <= 0) {
    return { error: "จำนวนหน่วยฐานต่อหน่วยซื้อต้องมากกว่า 0" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("items").update(fields).eq("id", id);

  if (error) {
    return { error: `บันทึกไม่สำเร็จ: ${error.message}` };
  }

  revalidatePath("/admin/items");
  revalidatePath("/stock-in");
  revalidatePath("/stock-out");
  revalidatePath("/adjustments");
  return { success: true };
}

// ปิด/เปิดใช้งานสินค้า — ใช้แทนการลบจริง (soft delete) เพื่อรักษาความสัมพันธ์กับ stock_transactions เดิม
export async function toggleItemActive(id: string, nextActive: boolean) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = await createClient();
  const { error } = await supabase.from("items").update({ is_active: nextActive }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/items");
  revalidatePath("/stock-in");
  revalidatePath("/stock-out");
  revalidatePath("/adjustments");
}
