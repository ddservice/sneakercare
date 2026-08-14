import { requireProfile, requireModuleView } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { canRecordWaste, canWrite } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>เบิกใช้งาน</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          เลือกสาขาจากแถบด้านบนเพื่อทำรายการเบิกหรือตัดของเสีย
        </CardContent>
      </Card>
    );
  }

  const [{ data: items }, { data: stockRows }] = await Promise.all([
    supabase.from("items").select("id, name, base_unit").eq("is_active", true).order("name"),
    supabase.from("v_item_stock").select("item_id, current_qty").eq("branch_id", branchId),
  ]);

  const stockByItem = new Map((stockRows ?? []).map((row) => [row.item_id, row.current_qty]));
  const options = (items ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    base_unit: item.base_unit,
    current_qty: stockByItem.get(item.id) ?? 0,
  }));

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>เบิกใช้งาน</CardTitle>
      </CardHeader>
      <CardContent>
        {!canEdit ? (
          <p className="text-muted-foreground">บัญชีนี้ดูหน้านี้ได้ แต่ไม่มีสิทธิ์บันทึกการเบิกใช้งาน</p>
        ) : showWaste ? (
          <Tabs defaultValue="out">
            <TabsList>
              <TabsTrigger value="out">เบิกใช้งาน</TabsTrigger>
              <TabsTrigger value="waste">ของเสีย</TabsTrigger>
            </TabsList>
            <TabsContent value="out" className="pt-4">
              <StockOutForm items={options} branchId={branchId} />
            </TabsContent>
            <TabsContent value="waste" className="pt-4">
              <WasteForm items={options} branchId={branchId} />
            </TabsContent>
          </Tabs>
        ) : (
          <StockOutForm items={options} branchId={branchId} />
        )}
      </CardContent>
    </Card>
  );
}
