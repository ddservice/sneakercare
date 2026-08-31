import { requireProfile, requireModuleView } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { canWrite } from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StockInForm } from "./stock-in-form";
import { ArrowDownToLine, Boxes } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function StockInPage() {
  const profile = await requireProfile();
  requireModuleView(profile, "stock-in");
  const canEdit = canWrite(profile.role, "stock-in");
  const supabase = await createClient();

  let branchId = await getSelectedBranchId(profile);
  if (!branchId) {
    const { data: mainBranch } = await supabase.from("branches").select("id").limit(1).single();
    branchId = mainBranch?.id ?? profile.branch_id ?? "cb8dcf5d-7e5e-4671-be42-aca79469a19b";
  }

  const { data: items } = await supabase
    .from("items")
    .select("id, name, purchase_unit")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5 text-teal-700" />
            รับของเข้าคลัง (Stock In)
          </h2>
          <p className="text-xs text-slate-500">
            บันทึกการสั่งซื้อน้ำยา อุปกรณ์ และเพิ่มสินค้าใหม่เข้าสู่ระบบ
          </p>
        </div>
        <Link href="/inventory">
          <Button variant="outline" size="sm" className="text-xs gap-1.5">
            <Boxes className="h-3.5 w-3.5" /> ดูสต๊อกทั้งหมด
          </Button>
        </Link>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-3">
          <CardTitle className="text-sm font-bold text-slate-800">
            ฟอร์มบันทึกรับของเข้า & เพิ่มสินค้าใหม่
          </CardTitle>
          <CardDescription className="text-xs">
            เลือกสินค้าที่มีในระบบหรือกดเพิ่มรายการสินค้าใหม่ได้ทันที
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {canEdit ? (
            <StockInForm items={items ?? []} branchId={branchId!} />
          ) : (
            <p className="text-sm text-slate-500">บัญชีนี้ดูหน้านี้ได้ แต่ไม่มีสิทธิ์บันทึกรับของเข้า</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
