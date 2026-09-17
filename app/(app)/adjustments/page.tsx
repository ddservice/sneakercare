import { requireProfile, requireModuleView } from "@/lib/auth";
import { withId, text, num } from "@/lib/db-rows";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { tenantFilter } from "@/lib/tenant";
import { canWrite } from "@/lib/permissions";
import { NeedBranchEmpty } from "@/components/need-branch-empty";
import { InventoryFormPanel, InventoryShell } from "@/components/inventory-shell";
import { AdjustmentForm } from "./adjustment-form";
import { PendingAdjustmentsList } from "./pending-list";

export default async function AdjustmentsPage() {
  const profile = await requireProfile();
  requireModuleView(profile, "adjustments");
  const canEdit = canWrite(profile.role, "adjustments");
  const branchId = await getSelectedBranchId(profile);
  const supabase = await createClient();
  const tenantId = await tenantFilter(profile);
  let itemsQuery = supabase
    .from("items")
    .select("id, name, base_unit")
    .eq("is_active", true)
    .order("name");
  if (tenantId) itemsQuery = itemsQuery.eq("tenant_id", tenantId);
  const { data: items } = await itemsQuery;

  const itemOptions = withId(items).map((i) => ({ id: i.id, name: text(i.name), base_unit: text(i.base_unit) }));

  const isApprover = profile.role === "admin" || profile.role === "super_admin";
  let pendingRows: Parameters<typeof PendingAdjustmentsList>[0]["rows"] = [];
  if (isApprover) {
    let pendingQuery = supabase
      .from("v_stock_transactions")
      .select("id, quantity_delta, reason, created_at, txn_type, item_name, branch_name, performed_by_name")
      .eq("status", "pending_approval")
      .order("created_at", { ascending: true });
    if (branchId) pendingQuery = pendingQuery.eq("branch_id", branchId);
    const { data: pending } = await pendingQuery;

    pendingRows = withId(pending).map((row) => ({
      id: row.id,
      item_name: text(row.item_name, "(ไม่ทราบชื่อสินค้า)"),
      branch_name: text(row.branch_name, "(ไม่ทราบสาขา)"),
      txn_type: text(row.txn_type),
      quantity_delta: num(row.quantity_delta),
      reason: text(row.reason),
      performed_by_name: text(row.performed_by_name, "(ไม่ทราบผู้ทำรายการ)"),
      created_at: text(row.created_at),
    }));
  }

  return (
    <InventoryShell title="ตรวจนับสต๊อก" description="ปรับยอดให้ตรงกับการนับจริง — Co-Admin ต้องรอ Admin อนุมัติ" role={profile.role}>
      <div className="space-y-6">
        {canEdit && branchId ? (
          <InventoryFormPanel>
            <AdjustmentForm items={itemOptions} branchId={branchId} requiresApproval={!isApprover} />
          </InventoryFormPanel>
        ) : canEdit ? (
          <NeedBranchEmpty
            title="เลือกสาขาก่อนปรับปรุงสต๊อก"
            description="ต้องระบุสาขาให้ชัดก่อนบันทึกผลตรวจนับ เพื่อไม่ให้ยอดคงเหลือถูกปรับผิดร้าน"
          />
        ) : (
          <InventoryFormPanel>
            <p className="text-sm text-slate-500">บัญชีนี้ดูหน้านี้ได้ แต่ไม่มีสิทธิ์กรอกปรับปรุงสต๊อก</p>
          </InventoryFormPanel>
        )}

        {isApprover && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">รายการรออนุมัติ</h2>
              <p className="mt-0.5 text-xs text-slate-500">อนุมัติแล้วถึงจะมีผลกับยอดคงเหลือ</p>
            </div>
            <div className="p-4">
              <PendingAdjustmentsList rows={pendingRows} />
            </div>
          </div>
        )}
      </div>
    </InventoryShell>
  );
}
