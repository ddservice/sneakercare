import { requireProfile, requireModuleView } from "@/lib/auth";
import { withId, text } from "@/lib/db-rows";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { tenantFilter } from "@/lib/tenant";
import { canWrite } from "@/lib/permissions";
import { NeedBranchEmpty } from "@/components/need-branch-empty";
import { InventoryFormPanel, InventoryShell } from "@/components/inventory-shell";
import { StockInForm } from "./stock-in-form";

export default async function StockInPage() {
  const profile = await requireProfile();
  requireModuleView(profile, "stock-in");
  const canEdit = canWrite(profile.role, "stock-in");
  const supabase = await createClient();

  const branchId = await getSelectedBranchId(profile);

  // 🔴 [แก้บั๊กจริง 2026-09-17] เดิมถ้าไม่ได้เลือกสาขา จะ fallback ไปสาขาแรกแบบไม่กรอง tenant
  // หรือ hardcode UUID ของ tenant #1 — เปลี่ยนเป็นบล็อกแล้วขอให้เลือกสาขาก่อนเสมอ
  if (!branchId) {
    return (
      <InventoryShell title="รับของเข้า" description="บันทึกของที่ซื้อมาเข้าคลังของสาขาที่เลือก" role={profile.role}>
        <NeedBranchEmpty
          title="เลือกสาขาก่อนรับของเข้าคลัง"
          description="ต้องระบุสาขาให้ชัดก่อนบันทึก เพื่อไม่ให้ของไปลงผิดร้านหรือผิดนิติบุคคล"
        />
      </InventoryShell>
    );
  }

  const tenantId = await tenantFilter(profile);
  let itemsQuery = supabase
    .from("items")
    .select("id, name, purchase_unit")
    .eq("is_active", true)
    .order("name");
  if (tenantId) itemsQuery = itemsQuery.eq("tenant_id", tenantId);
  const { data: items } = await itemsQuery;

  return (
    <InventoryShell title="รับของเข้า" description="บันทึกของที่ซื้อมาเข้าคลังของสาขาที่เลือก" role={profile.role}>
      <InventoryFormPanel>
        {canEdit ? (
          <StockInForm
            items={withId(items).map((i) => ({
              id: i.id,
              name: text(i.name),
              purchase_unit: text(i.purchase_unit),
            }))}
            branchId={branchId}
          />
        ) : (
          <p className="text-sm text-slate-500">บัญชีนี้ดูหน้านี้ได้ แต่ไม่มีสิทธิ์บันทึกรับของเข้า</p>
        )}
      </InventoryFormPanel>
    </InventoryShell>
  );
}
