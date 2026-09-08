import { requireProfile, requireModuleView } from "@/lib/auth";
import { withId, text, num } from "@/lib/db-rows";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { canSeeCost, canWrite } from "@/lib/permissions";
import { InventoryClient, type InventoryRow } from "./inventory-client";

export const dynamic = "force-dynamic";

export default async function InventoryHubPage() {
  const profile = await requireProfile();
  requireModuleView(profile, "inventory");
  const selectedBranchId = await getSelectedBranchId(profile);
  const supabase = await createClient();
  const isCostVisible = canSeeCost(profile.role);
  const canEdit = canWrite(profile.role, "inventory");

  // ── ตัวกรองสาขา (กฎข้อ 12) ────────────────────────────────────────────────
  // staff/co-admin ถูก view `v_item_stock` กรองสาขาให้ในตัวอยู่แล้ว (inv_fn_current_branch())
  // แต่ **admin ฟังก์ชันนั้นคืน null = เห็นทุกสาขา** ⇒ ถ้า admin เลือกสาขาไว้ในคุกกี้
  // `sc_active_branch` แล้วหน้านี้ไม่กรองตาม จะได้ยอดรวมข้ามสาขาเงียบๆ และถ้ามีมากกว่าหนึ่งสาขา
  // จะมีหลายแถวต่อสินค้าหนึ่งชิ้น แล้ว Map ด้านล่างจะเก็บแค่แถวสุดท้าย = ตัวเลขมั่วโดยไม่มีใครรู้
  // ตอนนี้มีสาขาเดียวจึงยังไม่เห็นอาการ — เติมไว้ก่อนเพื่อไม่ให้ระเบิดวันเปิดสาขาที่สอง
  //
  // ⚠️ (แก้ 2026-09-07) เดิมหน้านี้ join `item_stock` เข้ามาตรงๆ ซึ่งผิดกฎข้อ 5 ใน CLAUDE.md
  // ("Staff ต้องไม่เห็นข้อมูลต้นทุน — ห้าม SELECT จากตาราง item_stock ตรงๆ") และหลังจาก
  // migration 0016/0021 บังคับ RLS จริงจัง พนักงานจะอ่าน item_stock ไม่ได้เลย = เห็นจำนวนเป็น 0 ทุกช่อง
  //
  // เปลี่ยนเป็น: อ่านจำนวนจาก staff-safe view (`v_item_stock` ไม่มีคอลัมน์ต้นทุน และกรองสาขา
  // ให้ในตัว) ส่วนต้นทุนดึงแยกเฉพาะคนที่มีสิทธิ์เห็นจริงเท่านั้น — พนักงานจะไม่มีทางได้ข้อมูล
  // ต้นทุนติดมากับ payload ตั้งแต่ฝั่งเซิร์ฟเวอร์ ไม่ใช่แค่ซ่อนตอนแสดงผล
  let stockQuery = supabase.from("v_item_stock").select("item_id, current_qty, min_stock_level, alert_muted");
  if (selectedBranchId) stockQuery = stockQuery.eq("branch_id", selectedBranchId);

  let costQuery = supabase.from("item_stock").select("item_id, avg_unit_cost");
  if (selectedBranchId) costQuery = costQuery.eq("branch_id", selectedBranchId);

  const [{ data: rawItems }, { data: stockRows }, { data: costRows }] = await Promise.all([
    supabase.from("items").select("*").order("name"),
    stockQuery,
    isCostVisible
      ? costQuery
      : Promise.resolve({ data: [] as { item_id: string | null; avg_unit_cost: number | null }[] }),
  ]);

  const stockByItem = new Map((stockRows ?? []).map((r) => [r.item_id, r]));
  const costByItem = new Map((costRows ?? []).map((r) => [r.item_id, Number(r.avg_unit_cost ?? 0)]));

  // `items` เป็น view alias จึงคืนทุกคอลัมน์เป็น nullable — ตัดแถวที่ไม่มี id ทิ้ง
  // (ใช้เป็น key ของตารางไม่ได้อยู่แล้ว) แล้วเติมค่าสำรองให้คอลัมน์ที่เหลือ
  const stockItems: InventoryRow[] = withId(rawItems).map((item) => {
    const stockRow = stockByItem.get(item.id);
    const currentQty = num(stockRow?.current_qty);
    const minStock = num(stockRow?.min_stock_level ?? item.default_min_stock_level ?? 1);
    const unitCost = costByItem.get(item.id) ?? 0;
    return {
      id: item.id,
      item_id: item.id,
      name: text(item.name),
      item_type: item.item_type || "inventory",
      category: text(item.category, "ทั่วไป"),
      base_unit: text(item.base_unit, "ชิ้น"),
      purchase_unit: text(item.purchase_unit || item.base_unit, "ชิ้น"),
      current_qty: currentQty,
      min_stock_level: minStock,
      avg_unit_cost: unitCost,
      total_value: currentQty * unitCost,
      is_low_stock: currentQty <= minStock,
      is_active: item.is_active ?? true,
      alert_muted: stockRow?.alert_muted ?? false,
    };
  });

  return (
    <InventoryClient
      initialItems={stockItems}
      isCostVisible={isCostVisible}
      canEdit={canEdit}
    />
  );
}
