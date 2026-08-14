import { requireProfile, requireModuleView } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { canWrite } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StockInForm } from "./stock-in-form";

export default async function StockInPage() {
  const profile = await requireProfile();
  requireModuleView(profile, "stock-in");
  const canEdit = canWrite(profile.role, "stock-in");
  const branchId = await getSelectedBranchId(profile);

  if (!branchId) {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>รับของเข้า</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          เลือกสาขาจากแถบด้านบนเพื่อทำรายการรับของเข้า
        </CardContent>
      </Card>
    );
  }

  const supabase = await createClient();
  const { data: items } = await supabase
    .from("items")
    .select("id, name, purchase_unit")
    .eq("is_active", true)
    .order("name");

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>รับของเข้า</CardTitle>
      </CardHeader>
      <CardContent>
        {canEdit ? (
          <StockInForm items={items ?? []} branchId={branchId} />
        ) : (
          <p className="text-muted-foreground">บัญชีนี้ดูหน้านี้ได้ แต่ไม่มีสิทธิ์บันทึกรับของเข้า</p>
        )}
      </CardContent>
    </Card>
  );
}
