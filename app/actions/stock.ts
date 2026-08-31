"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireModuleWrite, type Profile } from "@/lib/auth";
import { assertWritableBranch } from "@/lib/branch";
import { canRecordWaste, canWrite } from "@/lib/permissions";

export type StockActionState = { error?: string; success?: boolean } | undefined;

function revalidateStock(paths: string[]) {
  revalidatePath("/dashboard");
  revalidatePath("/history");
  for (const path of paths) revalidatePath(path);
}

// รวมจุดตรวจ "ทำรายการของสาขาไหน มีสิทธิ์ไหม" ที่ทุก action ด้านล่างต้องเช็คเหมือนกันทุกครั้ง
// (branch_id จากฟอร์ม/ของ Admin ก็ได้ ไม่งั้น fallback เป็นสาขาประจำของผู้ใช้) ไว้ที่เดียว กันหลุดจุดใดจุดหนึ่ง
function resolveBranch(profile: Profile, formData: FormData): { branchId: string } | { error: string } {
  const branchId = String(formData.get("branch_id") ?? profile.branch_id ?? "");
  const branchError = assertWritableBranch(profile, branchId);
  return branchError ? { error: branchError } : { branchId };
}

export async function createStockOut(_prev: StockActionState, formData: FormData): Promise<StockActionState> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "stock-out");
  const supabase = await createClient();

  const itemId = String(formData.get("item_id") ?? "");
  const qty = Number(formData.get("qty"));
  const referenceNote = String(formData.get("reference_note") ?? "").trim();

  if (!itemId || !qty || qty <= 0) {
    return { error: "กรุณาเลือกสินค้าและกรอกจำนวนให้ถูกต้อง" };
  }
  const branch = resolveBranch(profile, formData);
  if ("error" in branch) return branch;
  const { branchId } = branch;

  const { error } = await supabase.from("stock_transactions").insert({
    item_id: itemId,
    branch_id: branchId,
    txn_type: "stock_out",
    quantity_delta: -Math.abs(qty),
    reference_type: "service_order",
    reference_note: referenceNote || null,
    performed_by: profile.id,
  });

  if (error) {
    return { error: `บันทึกไม่สำเร็จ: ${error.message}` };
  }

  revalidateStock(["/stock-out"]);
  return { success: true };
}

export async function createStockIn(_prev: StockActionState, formData: FormData): Promise<StockActionState> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "stock-in");
  const supabase = await createClient();

  const isNewItem = formData.get("is_new_item") === "true";
  let itemId = String(formData.get("item_id") ?? "");
  const purchaseQty = Number(formData.get("purchase_qty"));
  const totalCost = Number(formData.get("total_cost"));
  const referenceNote = String(formData.get("reference_note") ?? "").trim();

  if (!Number.isFinite(purchaseQty) || purchaseQty <= 0 || !Number.isFinite(totalCost) || totalCost < 0) {
    return { error: "กรุณากรอกจำนวนที่ซื้อและยอดที่จ่ายให้ถูกต้อง" };
  }

  const branch = resolveBranch(profile, formData);
  if ("error" in branch) return branch;
  const { branchId } = branch;

  let purchaseUnitQty = 1;

  if (isNewItem) {
    const newItemName = String(formData.get("new_item_name") ?? "").trim();
    const newItemCategory = String(formData.get("new_item_category") ?? "อุปกรณ์ทำความสะอาด").trim();
    const newItemUnit = String(formData.get("new_item_unit") ?? "ชิ้น").trim();
    const newMinStock = Number(formData.get("new_min_stock") ?? 1);

    if (!newItemName) {
      return { error: "กรุณาระบุชื่อสินค้าใหม่" };
    }

    const { data: createdItem, error: createErr } = await supabase
      .from("items")
      .insert({
        name: newItemName,
        category: newItemCategory,
        base_unit: newItemUnit,
        purchase_unit: newItemUnit,
        purchase_unit_qty: 1,
        default_min_stock_level: newMinStock,
        item_type: "inventory",
        is_active: true,
      })
      .select("id, purchase_unit_qty")
      .single();

    if (createErr || !createdItem) {
      return { error: `สร้างสินค้าใหม่ไม่สำเร็จ: ${createErr?.message}` };
    }

    itemId = createdItem.id;
    purchaseUnitQty = createdItem.purchase_unit_qty || 1;
  } else {
    if (!itemId) {
      return { error: "กรุณาเลือกสินค้าที่ต้องการรับเข้า" };
    }

    const { data: item, error: itemError } = await supabase
      .from("items")
      .select("purchase_unit_qty")
      .eq("id", itemId)
      .single();

    if (itemError || !item) {
      return { error: "ไม่พบสินค้านี้ในระบบ" };
    }
    purchaseUnitQty = item.purchase_unit_qty || 1;
  }

  const baseQty = purchaseQty * purchaseUnitQty;
  const unitCost = totalCost / baseQty;

  const { error } = await supabase.from("stock_transactions").insert({
    item_id: itemId,
    branch_id: branchId,
    txn_type: "stock_in",
    quantity_delta: baseQty,
    unit_cost_snapshot: unitCost,
    reference_type: "purchase",
    reference_note: referenceNote || null,
    performed_by: profile.id,
  });

  if (error) {
    return { error: `บันทึกไม่สำเร็จ: ${error.message}` };
  }

  revalidateStock(["/stock-in", "/inventory"]);
  return { success: true };
}

export async function createAdjustment(_prev: StockActionState, formData: FormData): Promise<StockActionState> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "adjustments");
  const supabase = await createClient();

  const itemId = String(formData.get("item_id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const qty = Number(formData.get("qty"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!itemId || !qty || qty <= 0 || !reason) {
    return { error: "กรุณากรอกข้อมูลให้ครบ โดยเฉพาะเหตุผลในการปรับปรุงสต๊อก" };
  }
  if (direction !== "increase" && direction !== "decrease") {
    return { error: "กรุณาเลือกทิศทางการปรับปรุง" };
  }
  const branch = resolveBranch(profile, formData);
  if ("error" in branch) return branch;
  const { branchId } = branch;

  const { error } = await supabase.from("stock_transactions").insert({
    item_id: itemId,
    branch_id: branchId,
    txn_type: direction === "increase" ? "adjustment_increase" : "adjustment_decrease",
    status: profile.role === "admin" ? "approved" : "pending_approval",
    quantity_delta: direction === "increase" ? Math.abs(qty) : -Math.abs(qty),
    reason,
    performed_by: profile.id,
  });

  if (error) {
    return { error: `บันทึกไม่สำเร็จ: ${error.message}` };
  }

  revalidateStock(["/adjustments"]);
  return { success: true };
}

export async function createWaste(_prev: StockActionState, formData: FormData): Promise<StockActionState> {
  const profile = await requireProfile();
  if (!canRecordWaste(profile.role)) {
    return { error: "ไม่มีสิทธิ์บันทึกของเสีย" };
  }
  const supabase = await createClient();

  const itemId = String(formData.get("item_id") ?? "");
  const qty = Number(formData.get("qty"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!itemId || !qty || qty <= 0 || !reason) {
    return { error: "กรุณาเลือกสินค้า กรอกจำนวน และเหตุผล" };
  }
  const branch = resolveBranch(profile, formData);
  if ("error" in branch) return branch;
  const { branchId } = branch;

  const { error } = await supabase.from("stock_transactions").insert({
    item_id: itemId,
    branch_id: branchId,
    txn_type: "waste",
    quantity_delta: -Math.abs(qty),
    reason,
    reference_type: "manual",
    performed_by: profile.id,
  });

  if (error) {
    return { error: `บันทึกไม่สำเร็จ: ${error.message}` };
  }

  revalidateStock(["/stock-out"]);
  return { success: true };
}

export async function setMinStockLevel(_prev: StockActionState, formData: FormData): Promise<StockActionState> {
  const profile = await requireProfile();
  if (!canWrite(profile.role, "dashboard")) {
    return { error: "ไม่มีสิทธิ์แก้จุดสั่งซื้อขั้นต่ำ" };
  }

  const itemId = String(formData.get("item_id") ?? "");
  const min = Number(formData.get("min_stock_level"));

  if (!itemId || Number.isNaN(min) || min < 0) {
    return { error: "กรุณากรอกจุดสั่งซื้อขั้นต่ำให้ถูกต้อง" };
  }
  const branch = resolveBranch(profile, formData);
  if ("error" in branch) return branch;
  const { branchId } = branch;

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_set_min_stock_level", {
    p_item_id: itemId,
    p_branch_id: branchId,
    p_new_min: min,
  });

  if (error) {
    return { error: `บันทึกไม่สำเร็จ: ${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export async function approveAdjustment(txnId: string, approve: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_approve_adjustment", { p_txn_id: txnId, p_approve: approve });
  if (error) throw new Error(error.message);
  revalidatePath("/adjustments");
  revalidatePath("/dashboard");
  revalidatePath("/history");
}
