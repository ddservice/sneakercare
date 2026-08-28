import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getSelectedBranchId } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";
import { canSeeCost } from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  Scale,
  History,
  FileSpreadsheet,
  PackagePlus,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
} from "lucide-react";

export default async function InventoryHubPage() {
  const profile = await requireProfile();
  const selectedBranchId = await getSelectedBranchId(profile);
  const supabase = await createClient();
  const isCostVisible = canSeeCost(profile.role);

  // 1. Fetch low stock items
  let lowStockQuery = supabase.from("v_low_stock").select("*");
  if (selectedBranchId) lowStockQuery = lowStockQuery.eq("branch_id", selectedBranchId);
  const { data: lowStockItems } = await lowStockQuery;

  // 2. Fetch inventory values (for Admin/Co-Admin)
  let totalValuation = 0;
  if (isCostVisible) {
    let valueQuery = supabase.from("v_inventory_value").select("*");
    if (selectedBranchId) valueQuery = valueQuery.eq("branch_id", selectedBranchId);
    const { data: valData } = await valueQuery;
    if (valData) {
      totalValuation = valData.reduce((acc, row) => acc + Number(row.total_value ?? 0), 0);
    }
  }

  // 3. Fetch current stock items list
  let itemsQuery = supabase.from("v_staff_stock").select("*").order("name");
  if (selectedBranchId) itemsQuery = itemsQuery.eq("branch_id", selectedBranchId);
  const { data: stockItems } = await itemsQuery;

  const lowStockCount = lowStockItems?.length ?? 0;
  const totalItemsCount = stockItems?.length ?? 0;

  return (
    <div className="space-y-8">
      {/* ── Header Banner ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 p-6 text-white shadow-md">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-200 ring-1 ring-teal-400/30">
            <Boxes className="h-3.5 w-3.5" />
            Inventory & Consumables Hub
          </div>
          <h2 className="text-2xl font-bold tracking-tight">ระบบบริหารจัดการคลังสินค้า & สิ้นเปลือง</h2>
          <p className="text-sm text-teal-100/80">
            ควบคุมยอดคงเหลือน้ำยาซักรองเท้า อุปกรณ์ซ่อมแซม ตัดสต๊อกตามปริมาณจริง และตรวจสอบต้นทุน COGS
          </p>
        </div>

        {/* Action button */}
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/stock-out">
            <Button className="bg-teal-600 font-bold hover:bg-teal-500 text-white gap-2 shadow-xs">
              <ArrowUpFromLine className="h-4 w-4" /> เบิกใช้งาน / ตัดสต๊อก
            </Button>
          </Link>
          {profile.role !== "staff" && (
            <Link href="/stock-in">
              <Button variant="outline" className="bg-white/10 text-white hover:bg-white/20 border-white/20 gap-2">
                <ArrowDownToLine className="h-4 w-4" /> รับของเข้า
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">จำนวนรายการสินค้าทั้งหมด</span>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{totalItemsCount} รายการ</div>
            </div>
            <div className="rounded-xl bg-teal-50 p-3 text-teal-600 dark:bg-teal-950 dark:text-teal-400">
              <Boxes className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">สินค้าจุดสั่งซื้อด่วน (สต๊อกต่ำ)</span>
              <div className={`text-2xl font-bold ${lowStockCount > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {lowStockCount} รายการ
              </div>
            </div>
            <div className={`rounded-xl p-3 ${lowStockCount > 0 ? "bg-rose-50 text-rose-600 dark:bg-rose-950" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950"}`}>
              {lowStockCount > 0 ? <AlertTriangle className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
            </div>
          </CardContent>
        </Card>

        {isCostVisible ? (
          <Card className="border-slate-200 shadow-xs dark:border-slate-800 sm:col-span-2 lg:col-span-1">
            <CardContent className="p-5 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">มูลค่าคลังสินค้าคงเหลือ (ต้นทุน)</span>
                <div className="text-2xl font-bold text-teal-700 dark:text-teal-400">
                  {totalValuation.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
                </div>
              </div>
              <div className="rounded-xl bg-teal-50 p-3 text-teal-600 dark:bg-teal-950 dark:text-teal-400">
                <TrendingDown className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* ── Quick Action Navigation Grid ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-200">
          เมนูการจัดการคลังสินค้า (Quick Actions)
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/stock-out" className="group">
            <Card className="border-slate-200 p-4 transition-all hover:border-teal-400 hover:shadow-sm dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-teal-50 p-2.5 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-all dark:bg-teal-950 dark:text-teal-400">
                  <ArrowUpFromLine className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-teal-600">
                    เบิกใช้งาน (Stock Out)
                  </div>
                  <div className="text-xs text-slate-500">ตัดสต๊อกน้ำยาเป็น ml หรืออุปกรณ์ต่อออเดอร์</div>
                </div>
              </div>
            </Card>
          </Link>

          {profile.role !== "staff" && (
            <Link href="/stock-in" className="group">
              <Card className="border-slate-200 p-4 transition-all hover:border-teal-400 hover:shadow-sm dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-teal-50 p-2.5 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-all dark:bg-teal-950 dark:text-teal-400">
                    <ArrowDownToLine className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-teal-600">
                      รับของเข้า (Stock In)
                    </div>
                    <div className="text-xs text-slate-500">บันทึกของเข้า คำนวณต้นทุนถัวเฉลี่ยเคลื่อนที่</div>
                  </div>
                </div>
              </Card>
            </Link>
          )}

          {profile.role !== "staff" && (
            <Link href="/adjustments" className="group">
              <Card className="border-slate-200 p-4 transition-all hover:border-teal-400 hover:shadow-sm dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-teal-50 p-2.5 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-all dark:bg-teal-950 dark:text-teal-400">
                    <Scale className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-teal-600">
                      ปรับปรุงสต๊อก (Adjustments)
                    </div>
                    <div className="text-xs text-slate-500">ปรับยอดตามผลการตรวจนับจริงหน้าร้าน</div>
                  </div>
                </div>
              </Card>
            </Link>
          )}

          <Link href="/history" className="group">
            <Card className="border-slate-200 p-4 transition-all hover:border-teal-400 hover:shadow-sm dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-teal-50 p-2.5 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-all dark:bg-teal-950 dark:text-teal-400">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-teal-600">
                    ประวัติเบิก-รับ (History)
                  </div>
                  <div className="text-xs text-slate-500">บันทึก Ledger ย้อนหลังที่แก้ไข/ลบไม่ได้</div>
                </div>
              </div>
            </Card>
          </Link>

          {profile.role !== "staff" && (
            <Link href="/reports" className="group">
              <Card className="border-slate-200 p-4 transition-all hover:border-teal-400 hover:shadow-sm dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-teal-50 p-2.5 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-all dark:bg-teal-950 dark:text-teal-400">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-teal-600">
                      รายงาน & Export CSV
                    </div>
                    <div className="text-xs text-slate-500">สรุปต้นทุน COGS รายเดือนและส่งออกไฟล์ Excel</div>
                  </div>
                </div>
              </Card>
            </Link>
          )}

          {profile.role === "admin" && (
            <Link href="/admin/items" className="group">
              <Card className="border-slate-200 p-4 transition-all hover:border-teal-400 hover:shadow-sm dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-teal-50 p-2.5 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-all dark:bg-teal-950 dark:text-teal-400">
                    <PackagePlus className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-teal-600">
                      แคตตาล็อกสินค้า (Items Master)
                    </div>
                    <div className="text-xs text-slate-500">จัดการรายชื่อสินค้ากลาง หน่วยนับ และจุดสั่งซื้อ</div>
                  </div>
                </div>
              </Card>
            </Link>
          )}
        </div>
      </div>

      {/* ── Current Stock Balance Table ── */}
      <Card className="border-slate-200 shadow-xs dark:border-slate-800">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-800 dark:text-slate-200">
                ยอดคงเหลือสินค้าและวัสดุสิ้นเปลืองปัจจุบัน
              </CardTitle>
              <CardDescription>แสดงรายการทั้งหมด {stockItems?.length ?? 0} รายการ</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                <tr>
                  <th className="px-4 py-3">ชื่อสินค้า / วัสดุ</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3">หมวดหมู่</th>
                  <th className="px-4 py-3 text-right">คงเหลือ</th>
                  <th className="px-4 py-3 text-right">จุดสั่งซื้อขั้นต่ำ</th>
                  <th className="px-4 py-3 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {stockItems && stockItems.length > 0 ? (
                  stockItems.map((item) => {
                    const isLow = Number(item.current_qty) <= Number(item.min_stock_level);
                    return (
                      <tr key={item.item_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                          {item.name}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {item.item_type === "consumable" ? "สิ้นเปลือง (น้ำยา)" : "คงคลัง (ชิ้น)"}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{item.category}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {Number(item.current_qty).toLocaleString()} {item.base_unit}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-500">
                          {Number(item.min_stock_level).toLocaleString()} {item.base_unit}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isLow ? (
                            <Badge variant="destructive" className="text-[10px] gap-1">
                              <AlertTriangle className="h-3 w-3" /> สต๊อกต่ำ
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1">
                              <CheckCircle2 className="h-3 w-3" /> พร้อมใช้
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-sm text-slate-400">
                      ไม่มีรายการสินค้าในสาขานี้
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
