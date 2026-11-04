"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireModuleWrite, type Profile } from "@/lib/auth";
import { assertWritableBranch } from "@/lib/branch";
import { canRecordWaste, canWrite } from "@/lib/permissions";
import { validatePurchase, type PurchaseData } from "@/lib/purchase-receipts";
import { purchaseRpcError } from "@/lib/purchase-rpc-error";
import { stockWriteError } from "@/lib/stock-errors";

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
    return { error: stockWriteError(error.message) };
  }

  revalidateStock(["/stock-out"]);
  return { success: true };
}

export async function createStockIn(_prev: StockActionState, formData: FormData): Promise<StockActionState> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "stock-in");
  const branch = resolveBranch(profile, formData);
  if ("error" in branch) return branch;
  const isNew = formData.get("is_new_item") === "true";
  const field = (key: string) => String(formData.get(key) ?? "").trim();
  const numeric = (key: string) => field(key) === "" ? NaN : Number(field(key));
  const data: PurchaseData = {
    item_id: isNew ? "" : field("item_id"),
    new_item_name: isNew ? field("new_item_name") : "",
    new_item_category: isNew ? field("new_item_category") : "",
    new_item_unit: isNew ? field("new_item_unit") : "",
    new_min_stock: isNew ? numeric("new_min_stock") : 0,
    supplier_name: field("supplier_name"), purchase_date: field("purchase_date"),
    purchase_unit: field("purchase_unit"), purchase_qty: numeric("purchase_qty"),
    units_per_pack: numeric("units_per_pack"), goods_amount: numeric("goods_amount"),
    shipping_amount: numeric("shipping_amount"), discount_amount: numeric("discount_amount"),
    reference_note: field("reference_note"),
  };
  if (!isNew && !data.item_id) return { error: "สินค้า: เลือกสินค้าที่รับเข้า" };
  const error = validatePurchase(data);
  if (error) return { error };
  const requestId = field("request_id");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return { error: "ไม่พบคีย์รายการ กรุณาโหลดหน้าใหม่" };
  }
  const supabase = await createClient();
  const result = await supabase.rpc("inv_fn_receive_purchase", {
    p_branch_id: branch.branchId, p_request_id: requestId, p_data: data,
  });
  if (result.error) return { error: purchaseRpcError(result.error) };
  revalidateStock(["/stock-in", "/stock-in/prices", "/inventory"]);
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
    // ✅ [2026-09-17] super_admin เท่ากับ admin สำหรับการอนุมัติ adjustment เอง — เดิมเช็คแค่
    // "admin" ทำให้ super_admin ถูกปฏิบัติเหมือน co-admin/staff (ต้องรออนุมัติ) ทั้งที่ควรอนุมัติ
    // ได้เองเหมือน admin (ดู CLAUDE.md หัวข้อ super_admin — จุดที่ยังไม่ได้แก้)
    status: profile.role === "admin" || profile.role === "super_admin" ? "approved" : "pending_approval",
    quantity_delta: direction === "increase" ? Math.abs(qty) : -Math.abs(qty),
    reason,
    performed_by: profile.id,
  });

  if (error) {
    return { error: stockWriteError(error.message) };
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
    return { error: stockWriteError(error.message) };
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
  const { error } = await callDbFunction(supabase, "inv_fn_set_min_stock_level", "fn_set_min_stock_level", {
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

/**
 * เรียก RPC ที่บนฐานข้อมูล production มีชื่อขึ้นต้นด้วย `inv_` แต่บนฐานข้อมูลที่สร้างจาก
 * supabase/migrations/ ล้วนๆ (local dev / CI / pgTAP) ใช้ชื่อไร้ prefix
 *
 * ⚠️ (แก้บั๊ก 2026-09-06) โค้ดเดิมเรียกชื่อไร้ prefix อย่างเดียว ซึ่ง **ไม่มีอยู่จริงบน production**
 * ทำให้ 2 ฟีเจอร์นี้พังเงียบมาตลอดโดยไม่มีใครรู้ (error ถูกคืนเป็นข้อความให้ผู้ใช้เห็นว่า
 * "บันทึกไม่สำเร็จ" เฉยๆ ไม่ได้บอกว่าเพราะฟังก์ชันไม่มี):
 *   • ตั้งจุดสั่งซื้อขั้นต่ำ (fn_set_min_stock_level → inv_fn_set_min_stock_level)
 *   • อนุมัติรายการปรับปรุงสต๊อกของ Co-Admin (fn_approve_adjustment → inv_fn_approve_adjustment)
 *     ซึ่งเป็นกฎธุรกิจข้อ 3 ใน CLAUDE.md โดยตรง
 * เพิ่งเจอตอน generate types จากฐานข้อมูลจริง — ก่อนหน้านี้โค้ดใช้ `as any` ทับไว้ทั้งโปรเจกต์
 * TypeScript จึงไม่มีทางเตือนได้เลย
 */
async function callDbFunction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invName: string,
  legacyName: string,
  params: Record<string, unknown>
): Promise<{ error: { message: string } | null }> {
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    p: Record<string, unknown>
  ) => Promise<{ error: { message: string } | null }>;

  const first = await rpc(invName, params);
  if (!first.error) return first;
  if (/schema cache|does not exist|Could not find the function/i.test(first.error.message)) {
    return rpc(legacyName, params);
  }
  return first;
}

export async function approveAdjustment(txnId: string, approve: boolean) {
  // ด่านจริงของกฎข้อ 3 อยู่ที่ฐานข้อมูล — `inv_fn_approve_adjustment()` เช็ค
  // `inv_fn_current_role() in ('admin','co-admin')` และเช็คสาขาของ co-admin ให้อยู่แล้ว
  // (ยืนยันจาก prosrc บน production 2026-09-09) การ์ดตรงนี้จึงเป็นด่านที่สอง ไม่ใช่ด่านเดียว
  // แต่จำเป็นเพราะ (1) กันไว้เผื่อวันหน้ามีคนเปลี่ยนมาใช้ service_role ที่ข้าม RLS
  // (2) ผู้ใช้ได้ข้อความไทยที่อ่านรู้เรื่อง แทน exception ดิบจาก Postgres
  const profile = await requireProfile();
  requireModuleWrite(profile, "adjustments");
  const supabase = await createClient();
  const { error } = await callDbFunction(supabase, "inv_fn_approve_adjustment", "fn_approve_adjustment", {
    p_txn_id: txnId,
    p_approve: approve,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/adjustments");
  revalidatePath("/dashboard");
  revalidatePath("/history");
}
