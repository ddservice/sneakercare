import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { canSeeCost as roleCanSeeCost, canWrite } from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Footprints,
  Boxes,
  Wallet,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Receipt,
  ArrowUpFromLine,
  ArrowDownToLine,
  Plus,
} from "lucide-react";

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const canSeeCost = roleCanSeeCost(profile.role);
  const branchId = await getSelectedBranchId(profile);

  // 1. Fetch Orders
  let ordersQuery = supabase.from("service_orders").select("*").order("received_at", { ascending: false });
  if (branchId) ordersQuery = ordersQuery.eq("branch_id", branchId);
  const { data: orders } = await ordersQuery;

  // 2. Fetch Expenses
  let expensesQuery = supabase.from("expenses").select("*");
  if (branchId) expensesQuery = expensesQuery.eq("branch_id", branchId);
  const { data: expenses } = await expensesQuery;

  // 3. Fetch Stock & Low stock
  let lowStockQuery = supabase.from("v_low_stock").select("*");
  if (branchId) lowStockQuery = lowStockQuery.eq("branch_id", branchId);
  const { data: lowStock } = await lowStockQuery;

  // Calculations
  const totalRevenue = orders?.reduce((sum, o) => sum + Number(o.net_amount ?? 0), 0) ?? 0;
  const totalOpex = expenses?.reduce((sum, e) => sum + Number(e.amount ?? 0), 0) ?? 0;
  const netProfit = totalRevenue - totalOpex;
  const totalShoes = orders?.length ?? 0;
  const pendingJobs = orders?.filter((o) => o.status === "received" || o.status === "in_progress")?.length ?? 0;
  const lowStockCount = lowStock?.length ?? 0;

  const recentOrders = orders?.slice(0, 5) ?? [];

  return (
    <div className="space-y-8">
      {/* ── Brand Banner & Welcome ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-teal-700 via-teal-800 to-slate-900 p-6 text-white shadow-md">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-200 ring-1 ring-teal-400/30">
            <Sparkles className="h-3.5 w-3.5" />
            Smart Dashboard Overview
          </div>
          <h2 className="text-2xl font-bold tracking-tight">ภาพรวมระบบร้าน Sneaker Care</h2>
          <p className="text-sm text-teal-100/80">
            สรุปภาพรวมรายรับ ค่าใช้จ่าย กำไรสุทธิ สถานะงานรับบริการรองเท้า และสต๊อกสินค้า
          </p>
        </div>

        {/* Fast Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link href="/pos">
            <Button className="bg-teal-500 font-bold hover:bg-teal-400 text-slate-950 gap-2 shadow-xs">
              <Plus className="h-4 w-4" /> รับงานรองเท้า (POS)
            </Button>
          </Link>
          <Link href="/stock-out">
            <Button variant="outline" className="bg-white/10 text-white hover:bg-white/20 border-white/20 gap-2">
              <ArrowUpFromLine className="h-4 w-4" /> เบิกน้ำยาตัดสต๊อก
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Low Stock Alert Banner (if any) ── */}
      {lowStockCount > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-rose-100 p-2 text-rose-600 dark:bg-rose-900/60 dark:text-rose-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold text-sm">ตรวจพบสินค้าและน้ำยาใกล้หมด {lowStockCount} รายการ!</div>
              <div className="text-xs text-rose-700 dark:text-rose-300">
                กรุณาตรวจสอบและสั่งซื้อเพื่อป้องกันของหมดระหว่างให้บริการ
              </div>
            </div>
          </div>
          <Link href="/inventory">
            <Button size="sm" variant="outline" className="border-rose-300 bg-white text-rose-800 hover:bg-rose-100 text-xs">
              ดูรายการสินค้า
            </Button>
          </Link>
        </div>
      )}

      {/* ── KPI Grid 3×2 (Matching Legacy with Modern Aesthetic) ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* 1. Revenue */}
        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">รายรับจากงานบริการ</span>
              <div className="text-2xl font-black text-teal-700 dark:text-teal-400">
                {totalRevenue.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
              </div>
              <div className="text-[11px] text-slate-400">รวมงานซัก/ซ่อมทั้งหมด</div>
            </div>
            <div className="rounded-xl bg-teal-50 p-3 text-teal-600 dark:bg-teal-950 dark:text-teal-400">
              <Receipt className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* 2. Expenses */}
        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">ค่าใช้จ่ายร้าน (Opex)</span>
              <div className="text-2xl font-black text-rose-600">
                {totalOpex.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
              </div>
              <div className="text-[11px] text-slate-400">ค่าเช่า ค่าน้ำไฟ และวัสดุ</div>
            </div>
            <div className="rounded-xl bg-rose-50 p-3 text-rose-600 dark:bg-rose-950">
              <Wallet className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* 3. Net Profit */}
        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">กำไรสุทธิ (Net Profit)</span>
              <div className={`text-2xl font-black ${netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {netProfit.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
              </div>
              <div className="text-[11px] text-emerald-600 font-semibold">รายรับ − ค่าใช้จ่าย</div>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950">
              <TrendingUp className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* 4. Total Shoes */}
        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">จำนวนรองเท้าที่รับ</span>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{totalShoes} คู่</div>
              <div className="text-[11px] text-slate-400">รายการงานทั้งหมด</div>
            </div>
            <div className="rounded-xl bg-teal-50 p-3 text-teal-600 dark:bg-teal-950 dark:text-teal-400">
              <Footprints className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* 5. Pending Jobs */}
        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">งานที่กำลังทำ (ค้างส่ง)</span>
              <div className="text-2xl font-bold text-amber-600">{pendingJobs} คู่</div>
              <div className="text-[11px] text-amber-700 dark:text-amber-400">อยู่ระหว่างซัก/รอรับ</div>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 text-amber-600 dark:bg-amber-950">
              <Clock className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* 6. Inventory Items */}
        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">สถานะคลังสินค้า</span>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {lowStockCount > 0 ? (
                  <span className="text-rose-600">{lowStockCount} รายการเตือน</span>
                ) : (
                  <span className="text-emerald-600">พร้อมใช้งานปกติ</span>
                )}
              </div>
              <div className="text-[11px] text-slate-400">ตรวจสอบจุดสั่งซื้อขั้นต่ำ</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <Boxes className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Main Navigation Shortcut Cards ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-200">
          ทางลัดเมนูหลัก (Smart Navigation)
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/pos" className="group">
            <Card className="border-slate-200 p-4 transition-all hover:border-teal-400 hover:shadow-xs dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-teal-50 p-2.5 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-all dark:bg-teal-950 dark:text-teal-400">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-teal-600">
                      งานบริการ / ยอดขาย
                    </div>
                    <div className="text-xs text-slate-500">รับงานซักรองเท้า & POS</div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:translate-x-1 group-hover:text-teal-600 transition-all" />
              </div>
            </Card>
          </Link>

          <Link href="/inventory" className="group">
            <Card className="border-slate-200 p-4 transition-all hover:border-teal-400 hover:shadow-xs dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-teal-50 p-2.5 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-all dark:bg-teal-950 dark:text-teal-400">
                    <Boxes className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-teal-600">
                      คลังสินค้า & สิ้นเปลือง
                    </div>
                    <div className="text-xs text-slate-500">เบิก-รับน้ำยา & เช็คสต๊อก</div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:translate-x-1 group-hover:text-teal-600 transition-all" />
              </div>
            </Card>
          </Link>

          <Link href="/expenses" className="group">
            <Card className="border-slate-200 p-4 transition-all hover:border-teal-400 hover:shadow-xs dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-teal-50 p-2.5 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-all dark:bg-teal-950 dark:text-teal-400">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-teal-600">
                      ค่าใช้จ่าย & พนักงาน
                    </div>
                    <div className="text-xs text-slate-500">Opex & คิดเงินเดือน/SSO</div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:translate-x-1 group-hover:text-teal-600 transition-all" />
              </div>
            </Card>
          </Link>

          <Link href="/statistics" className="group">
            <Card className="border-slate-200 p-4 transition-all hover:border-teal-400 hover:shadow-xs dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-teal-50 p-2.5 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-all dark:bg-teal-950 dark:text-teal-400">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-teal-600">
                      สถิติ & ประสิทธิภาพ
                    </div>
                    <div className="text-xs text-slate-500">วิเคราะห์ยอดขาย & แบรนด์</div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:translate-x-1 group-hover:text-teal-600 transition-all" />
              </div>
            </Card>
          </Link>
        </div>
      </div>

      {/* ── Recent Orders Table ── */}
      <Card className="border-slate-200 shadow-xs dark:border-slate-800">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold">รายการรับงานล่าสุด (Recent Jobs)</CardTitle>
            <CardDescription>แสดง 5 รายการล่าสุดในระบบ</CardDescription>
          </div>
          <Link href="/pos">
            <Button size="sm" variant="ghost" className="text-xs text-teal-700 hover:text-teal-800 gap-1">
              ดูทั้งหมดใน POS <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                <tr>
                  <th className="px-4 py-3">เลขที่บิล</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3">รองเท้า</th>
                  <th className="px-4 py-3">วันที่รับงาน</th>
                  <th className="px-4 py-3 text-right">ยอดสุทธิ</th>
                  <th className="px-4 py-3 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-sm text-slate-400">
                      ยังไม่มีรายการรับงานในระบบ
                    </td>
                  </tr>
                ) : (
                  recentOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                      <td className="px-4 py-3 font-mono font-bold text-xs text-teal-700 dark:text-teal-400">
                        {order.order_no}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                        {order.customer_name}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                        {order.shoe_brand} {order.shoe_model} ({order.shoe_size})
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(order.received_at).toLocaleDateString("th-TH")}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {Number(order.net_amount).toLocaleString()} ฿
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] ${
                            order.status === "received"
                              ? "bg-blue-100 text-blue-800"
                              : order.status === "in_progress"
                              ? "bg-amber-100 text-amber-800"
                              : order.status === "ready"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {order.status === "received"
                            ? "รับงาน"
                            : order.status === "in_progress"
                            ? "กำลังทำ"
                            : order.status === "ready"
                            ? "พร้อมรับ"
                            : "ส่งมอบแล้ว"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
