import { requireProfile, requireModuleView } from "@/lib/auth";
import { withId, text, num } from "@/lib/db-rows";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { canWrite } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdjustmentForm } from "./adjustment-form";
import { PendingAdjustmentsList } from "./pending-list";

export default async function AdjustmentsPage() {
  const profile = await requireProfile();
  requireModuleView(profile, "adjustments");
  const canEdit = canWrite(profile.role, "adjustments");
  const branchId = await getSelectedBranchId(profile);
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("items")
    .select("id, name, base_unit")
    .eq("is_active", true)
    .order("name");

    // view alias คืนทุกคอลัมน์เป็น nullable — เติมค่าสำรองแทนการ cast ทับ (ดู lib/db-rows.ts)
  const itemOptions = withId(items).map((i) => ({ id: i.id, name: text(i.name), base_unit: text(i.base_unit) }));

  let pendingRows: Parameters<typeof PendingAdjustmentsList>[0]["rows"] = [];
  if (profile.role === "admin") {
    let pendingQuery = supabase
      .from("v_stock_transactions")
      .select("id, quantity_delta, reason, created_at, txn_type, item_name, branch_name, performed_by_name")
      .eq("status", "pending_approval")
      .order("created_at", { ascending: true });
    if (branchId) pendingQuery = pendingQuery.eq("branch_id", branchId);
    const { data: pending } = await pendingQuery;

    // view คืนทุกคอลัมน์เป็น nullable — จัดการ null ตรงนี้แทนการ cast ทับ (ดู lib/db-rows.ts)
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
    <div className="flex flex-col gap-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>ปรับปรุงสต๊อกจากตรวจนับ</CardTitle>
        </CardHeader>
        <CardContent>
          {canEdit && branchId ? (
            <AdjustmentForm items={itemOptions} branchId={branchId} requiresApproval={profile.role !== "admin"} />
          ) : canEdit ? (
            <p className="text-muted-foreground">เลือกสาขาจากแถบด้านบนเพื่อทำรายการปรับปรุงสต๊อก</p>
          ) : (
            <p className="text-muted-foreground">บัญชีนี้ดูหน้านี้ได้ แต่ไม่มีสิทธิ์กรอกปรับปรุงสต๊อก</p>
          )}
        </CardContent>
      </Card>

      {profile.role === "admin" && (
        <Card>
          <CardHeader>
            <CardTitle>รายการรออนุมัติ</CardTitle>
          </CardHeader>
          <CardContent>
            <PendingAdjustmentsList rows={pendingRows} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
