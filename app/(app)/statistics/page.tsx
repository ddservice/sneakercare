import { requireProfile } from "@/lib/auth";
import { getSelectedBranchId } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  PieChart,
  BarChart2,
  Footprints,
  Sparkles,
  Receipt,
  CheckCircle2,
  Award,
} from "lucide-react";

export default async function StatisticsPage() {
  const profile = await requireProfile();
  const selectedBranchId = await getSelectedBranchId(profile);
  const supabase = await createClient();

  // Query service orders
  let ordersQuery = supabase.from("service_orders").select("*");
  if (selectedBranchId) ordersQuery = ordersQuery.eq("branch_id", selectedBranchId);
  const { data: orders } = await ordersQuery;

  // Calculate statistics
  const totalOrders = orders?.length ?? 0;
  const totalRevenue = orders?.reduce((acc, o) => acc + Number(o.net_amount ?? 0), 0) ?? 0;
  const completedOrders = orders?.filter((o) => o.status === "delivered" || o.status === "ready")?.length ?? 0;
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Brand breakdown
  const brandCounts: Record<string, number> = {};
  const sizeCounts: Record<string, number> = { S: 0, M: 0, L: 0, XL: 0 };

  orders?.forEach((o) => {
    const b = o.shoe_brand || "อื่นๆ";
    brandCounts[b] = (brandCounts[b] || 0) + 1;
    if (o.shoe_size && sizeCounts[o.shoe_size] !== undefined) {
      sizeCounts[o.shoe_size] += 1;
    }
  });

  const sortedBrands = Object.entries(brandCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="space-y-8">
      {/* ── Header Banner ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 p-6 text-white shadow-md">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-200 ring-1 ring-teal-400/30">
            <TrendingUp className="h-3.5 w-3.5" />
            Analytics & Insights
          </div>
          <h2 className="text-2xl font-bold tracking-tight">สถิติ & รายงานประสิทธิภาพร้าน</h2>
          <p className="text-sm text-teal-100/80">
            วิเคราะห์แนวโน้มยอดขาย งานบริการยอดนิยม พฤติกรรมลูกค้า และแบรนด์รองเท้าที่ส่งซักมากที่สุด
          </p>
        </div>
      </div>

      {/* ── KPI Grid ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">จำนวนรองเท้าที่รับทั้งหมด</span>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{totalOrders} คู่</div>
            </div>
            <div className="rounded-xl bg-teal-50 p-3 text-teal-600 dark:bg-teal-950 dark:text-teal-400">
              <Footprints className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">ยอดขายบริการสะสม</span>
              <div className="text-2xl font-bold text-teal-700 dark:text-teal-400">
                {totalRevenue.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
              </div>
            </div>
            <div className="rounded-xl bg-teal-50 p-3 text-teal-600 dark:bg-teal-950 dark:text-teal-400">
              <Receipt className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">ยอดเฉลี่ยต่อบิล (Avg Ticket)</span>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {avgTicket.toLocaleString("th-TH", { minimumFractionDigits: 0 })} ฿
              </div>
            </div>
            <div className="rounded-xl bg-teal-50 p-3 text-teal-600 dark:bg-teal-950 dark:text-teal-400">
              <Award className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">ส่งมอบสำเร็จแล้ว</span>
              <div className="text-2xl font-bold text-emerald-600">
                {completedOrders} คู่
              </div>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950">
              <CheckCircle2 className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Brand Breakdown & Size Distribution ── */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Top Shoe Brands */}
        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-teal-600" />
              5 อันดับแบรนด์รองเท้าที่ลูกค้านำมาซักมากที่สุด
            </CardTitle>
            <CardDescription>วิเคราะห์จากประวัติการรับงานในระบบ</CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {sortedBrands.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">ยังไม่มีข้อมูลรองเท้า</div>
            ) : (
              sortedBrands.map(([brand, count], idx) => {
                const pct = totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0;
                return (
                  <div key={brand} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-800 dark:text-slate-200">
                        {idx + 1}. {brand}
                      </span>
                      <span className="text-teal-700 dark:text-teal-400">
                        {count} คู่ ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-teal-600 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Size Distribution */}
        <Card className="border-slate-200 shadow-xs dark:border-slate-800">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <PieChart className="h-4 w-4 text-teal-600" />
              สัดส่วนขนาดรองเท้า (Size Breakdown)
            </CardTitle>
            <CardDescription>การกระจายตัวของขนาดรองเท้าที่รับบริการ</CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "S (35-37)", key: "S", desc: "ผู้หญิง/เท้าเล็ก" },
                { label: "M (38-41)", key: "M", desc: "ขนาดมาตรฐาน" },
                { label: "L (42-44)", key: "L", desc: "ผู้ชายมาตรฐาน" },
                { label: "XL (45+)", key: "XL", desc: "ขนาดใหญ่พิเศษ" },
              ].map((s) => {
                const count = sizeCounts[s.key] || 0;
                const pct = totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0;
                return (
                  <div key={s.key} className="rounded-xl border border-slate-200 p-4 text-center dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300">{s.label}</div>
                    <div className="text-2xl font-black text-teal-700 dark:text-teal-400 my-1">{count}</div>
                    <div className="text-[11px] text-slate-500">{pct}% ของทั้งหมด</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
