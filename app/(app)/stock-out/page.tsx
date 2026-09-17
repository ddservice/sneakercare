import { requireProfile, requireModuleView } from "@/lib/auth";
import { withId, text, num } from "@/lib/db-rows";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { tenantFilter } from "@/lib/tenant";
import { canRecordWaste, canWrite } from "@/lib/permissions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NeedBranchEmpty } from "@/components/need-branch-empty";
import { InventoryFormPanel, InventoryShell } from "@/components/inventory-shell";
import { StockOutForm } from "./stock-out-form";
import { WasteForm } from "./waste-form";

export default async function StockOutPage() {
  const profile = await requireProfile();
  requireModuleView(profile, "stock-out");
  const canEdit = canWrite(profile.role, "stock-out");
  const showWaste = canRecordWaste(profile.role);
  const supabase = await createClient();
  const branchId = await getSelectedBranchId(profile);

  if (!branchId) {
    return (
      <InventoryShell title="เบิกใช้งาน" description="ตัดสต๊อกเมื่อเบิกใช้หน้าร้าน หรือตัดของเสีย" role={profile.role}>
        <NeedBranchEmpty
          title="เลือกสาขาก่อนเบิกหรือตัดของเสีย"
          description="ต้องระบุสาขาให้ชัดก่อนบันทึก เพื่อไม่ให้ตัดสต๊อกผิดร้าน"
        />
      </InventoryShell>
    );
  }

  const tenantId = await tenantFilter(profile);
  let itemsQuery = supabase.from("items").select("id, name, base_unit").eq("is_active", true).order("name");
  if (tenantId) itemsQuery = itemsQuery.eq("tenant_id", tenantId);

  const [{ data: items }, { data: stockRows }] = await Promise.all([
    itemsQuery,
    supabase.from("v_item_stock").select("item_id, current_qty").eq("branch_id", branchId),
  ]);

  const stockByItem = new Map((stockRows ?? []).map((row) => [row.item_id, row.current_qty]));
  const options = withId(items).map((item) => ({
    id: item.id,
    name: text(item.name),
    base_unit: text(item.base_unit),
    current_qty: num(stockByItem.get(item.id)),
  }));

  return (
    <InventoryShell title="เบิกใช้งาน" description="ตัดสต๊อกเมื่อเบิกใช้หน้าร้าน หรือตัดของเสีย" role={profile.role}>
      <InventoryFormPanel>
        {!canEdit ? (
          <p className="text-sm text-slate-500">บัญชีนี้ดูหน้านี้ได้ แต่ไม่มีสิทธิ์บันทึกการเบิกใช้งาน</p>
        ) : showWaste ? (
          <Tabs defaultValue="out" className="gap-5">
            <TabsList className="h-10 w-full rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              <TabsTrigger value="out" className="rounded-lg text-sm">
                เบิกใช้งาน
              </TabsTrigger>
              <TabsTrigger value="waste" className="rounded-lg text-sm">
                ของเสีย
              </TabsTrigger>
            </TabsList>
            <TabsContent value="out">
              <StockOutForm items={options} branchId={branchId} />
            </TabsContent>
            <TabsContent value="waste">
              <WasteForm items={options} branchId={branchId} />
            </TabsContent>
          </Tabs>
        ) : (
          <StockOutForm items={options} branchId={branchId} />
        )}
      </InventoryFormPanel>
    </InventoryShell>
  );
}
