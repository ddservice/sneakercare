import { requireProfile, requireModuleView } from "@/lib/auth";
import { withId, text } from "@/lib/db-rows";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { tenantFilter } from "@/lib/tenant";
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

  const branchId = await getSelectedBranchId(profile);

  // 🔴 [แก้บั๊กจริง 2026-09-17] เดิมถ้าไม่ได้เลือกสาขา (เกิดได้กับ admin/super_admin ที่ยังไม่ได้
  // เลือกจาก dropdown) จะ fallback ไปหยิบสาขาแรกที่เจอแบบไม่กรอง tenant เลย (`limit(1).single()`
  // อาจได้สาขาของ tenant อื่น) หรือ hardcode UUID ของสาขา tenant #1 ตรงๆ ⇒ รับของเข้าคลังไปลง
  // ผิดสาขา/ผิด tenant แบบเงียบๆ โดยผู้ใช้ไม่รู้ตัว — เปลี่ยนเป็นบล็อกแล้วขอให้เลือกสาขาก่อนเสมอ
  // (ตรงกับกฎข้อ 12 ใน CLAUDE.md อยู่แล้วว่า "การเบิก-รับ-ปรับ-ของเสียต้องเลือกสาขาให้ชัดก่อน"
  // และเป็นรูปแบบเดียวกับที่ /stock-out ทำอยู่แล้วถูกต้อง)
  if (!branchId) {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>รับของเข้าคลัง</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          เลือกสาขาจากแถบด้านบนเพื่อทำรายการรับของเข้าคลัง
        </CardContent>
      </Card>
    );
  }

  // ⚠️ เดิม `items` query ก็ไม่กรอง tenant เลยเช่นกัน — super_admin จะเห็นตัวเลือกสินค้าของทุก
  // tenant ปนกันตอนกรอกฟอร์มรับของเข้า (ดูเหตุผลเดียวกับ /inventory)
  const tenantId = await tenantFilter(profile);
  let itemsQuery = supabase
    .from("items")
    .select("id, name, purchase_unit")
    .eq("is_active", true)
    .order("name");
  if (tenantId) itemsQuery = itemsQuery.eq("tenant_id", tenantId);
  const { data: items } = await itemsQuery;

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
            <StockInForm items={withId(items).map((i) => ({ id: i.id, name: text(i.name), purchase_unit: text(i.purchase_unit) }))} branchId={branchId!} />
          ) : (
            <p className="text-sm text-slate-500">บัญชีนี้ดูหน้านี้ได้ แต่ไม่มีสิทธิ์บันทึกรับของเข้า</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
