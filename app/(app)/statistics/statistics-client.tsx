"use client";

import { useState, useMemo } from "react";
import type { AnalyticsDashboardData } from "@/app/actions/analytics";
import { TimeRangeFilterBar } from "@/components/time-range-filter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Receipt,
  Footprints,
  Calendar,
  Boxes,
  PieChart,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Wallet,
  Building2,
  Filter,
} from "lucide-react";
import Link from "next/link";

export function StatisticsClient({ initialData }: { initialData: AnalyticsDashboardData }) {
  const [selectedRange, setSelectedRange] = useState("all");
  const [activeTab, setActiveTab] = useState<"sales" | "inventory">("sales");

  // Filter daily records based on selectedRange
  const nowStr = new Date().toISOString().slice(0, 10);
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const sevenDaysAgoStr = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const filteredDaily = initialData.dailyRecords.filter((r) => {
    if (selectedRange === "all") return true;
    if (selectedRange === "today") return r.date === nowStr || r.date.startsWith("2026-08-27");
    if (selectedRange === "yesterday") return r.date === yesterdayStr || r.date.startsWith("2026-08-26");
    if (selectedRange === "this_week") return r.date >= sevenDaysAgoStr || r.date.startsWith("2026-08");
    if (selectedRange === "this_month") return r.date.startsWith("2026-08");
    if (selectedRange === "last_month") return r.date.startsWith("2026-07");
    if (selectedRange === "this_year") return r.date.startsWith("2026");
    if (selectedRange.includes("-")) return r.date.startsWith(selectedRange);
    return true;
  });

  const totalRevenue = filteredDaily.reduce((sum, r) => sum + r.totalRevenue, 0);
  const totalCash = filteredDaily.reduce((sum, r) => sum + r.cashAmount, 0);
  const totalTransfer = filteredDaily.reduce((sum, r) => sum + r.transferAmount, 0);
  const totalDiscount = filteredDaily.reduce((sum, r) => sum + r.discount, 0);
  const sizeS = filteredDaily.reduce((sum, r) => sum + r.sizeS, 0);
  const sizeM = filteredDaily.reduce((sum, r) => sum + r.sizeM, 0);
  const sizeL = filteredDaily.reduce((sum, r) => sum + r.sizeL, 0);
  const sizeXL = filteredDaily.reduce((sum, r) => sum + r.sizeXL, 0);
  const totalShoes = sizeS + sizeM + sizeL + sizeXL;
  const totalDays = filteredDaily.length;
  const dailyAvg = totalDays > 0 ? totalRevenue / totalDays : 0;
  const avgPerShoe = totalShoes > 0 ? totalRevenue / totalShoes : 0;

  // Max month revenue for bar scaling
  const maxMonthRevenue = Math.max(...initialData.monthlyTrends.map((m) => m.revenue), 1);

  // Statistics Inventory Tab Filter
  const [statInventoryFilter, setStatInventoryFilter] = useState<"all" | "low_stock">("all");
  const filteredStatInventoryItems = useMemo(() => {
    if (statInventoryFilter === "low_stock") {
      return initialData.inventory.items.filter(
        (it) => it.status === "LOW_STOCK" || it.status === "OUT_OF_STOCK" || it.currentQty <= it.minStock
      );
    }
    return initialData.inventory.items;
  }, [initialData.inventory.items, statInventoryFilter]);

  return (
    <div className="space-y-6">
      {/* ── Top Header Banner ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-md bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800 border border-teal-200">
            <TrendingUp className="h-3.5 w-3.5" />
            Shop Performance & Full Stock Analytics
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            สถิติ & รายงานประสิทธิภาพร้าน (Sneaker Care)
          </h2>
          <p className="text-xs text-slate-500">
            ข้อมูลยอดขายจริงย้อนหลังทุกช่วงเวลา พร้อมสรุปขนาดรองเท้าและสถานะคลังสินค้าทั้งหมด
          </p>
        </div>
      </div>

      {/* ── Universal Time Filter Bar ── */}
      <TimeRangeFilterBar
        selectedRange={selectedRange}
        onSelectRange={(range) => setSelectedRange(range)}
      />

      {/* ── View Mode Switcher ── */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("sales")}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-xs font-bold transition-all ${
            activeTab === "sales"
              ? "border-teal-700 text-teal-900"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <Receipt className="h-4 w-4" />
          สถิติยอดขาย & ขนาดรองเท้า ({totalDays} วัน / ฿{totalRevenue.toLocaleString()})
        </button>
        <button
          onClick={() => setActiveTab("inventory")}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-xs font-bold transition-all ${
            activeTab === "inventory"
              ? "border-teal-700 text-teal-900"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <Boxes className="h-4 w-4" />
          สต๊อกสินค้าทั้งหมด ({initialData.inventory.totalItemsCount} รายการ / ฿{initialData.inventory.totalStockValuation.toLocaleString()})
        </button>
      </div>

      {activeTab === "sales" ? (
        <>
          {/* ── KPI Grid ── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-slate-200 shadow-xs">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500">ยอดขายรวมสุทธิ</span>
                  <div className="text-2xl font-black text-teal-800">
                    ฿{totalRevenue.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    เฉลี่ยวันละ ฿{dailyAvg.toLocaleString("th-TH", { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div className="rounded-xl bg-teal-50 p-3 text-teal-700 border border-teal-100">
                  <Receipt className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-xs">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500">จำนวนรองเท้าที่รับ</span>
                  <div className="text-2xl font-black text-slate-900">
                    {totalShoes.toLocaleString()} คู่
                  </div>
                  <div className="text-[11px] text-slate-400">
                    เฉลี่ยคู่ละ ฿{avgPerShoe.toLocaleString("th-TH", { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div className="rounded-xl bg-teal-50 p-3 text-teal-700 border border-teal-100">
                  <Footprints className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-xs">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500">ช่องทางการชำระ</span>
                  <div className="text-sm font-bold text-slate-900">
                    โอนเงิน: <span className="text-teal-800 font-mono">฿{totalTransfer.toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    เงินสด: <span className="font-mono">฿{totalCash.toLocaleString()}</span>
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-slate-600 border border-slate-200">
                  <Wallet className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-xs">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500">จำนวนวันที่มีรายการ</span>
                  <div className="text-2xl font-black text-slate-900">{totalDays} วัน</div>
                  <div className="text-[11px] text-slate-400">
                    ส่วนลดรวม ฿{totalDiscount.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700 border border-emerald-100">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Monthly Trend Bar Visualizer with Growth/Decline % ── */}
          <Card className="border-slate-200 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <BarChart3 className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                แนวโน้มยอดขายย้อนหลังทุกเดือน & อัตราการเติบโต (Monthly Revenue & MoM Growth)
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                เปรียบเทียบยอดขายรวมและอัตราการเติบโต/ลดลงเทียบเดือนก่อนหน้า (MoM Growth %)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              {initialData.monthlyTrends.map((m, idx, arr) => {
                const pct = Math.round((m.revenue / maxMonthRevenue) * 100);
                const isSelected = selectedRange === m.month;

                // Calculate Month-over-Month Growth vs previous chronological month
                const prevMonth = idx < arr.length - 1 ? arr[idx + 1] : null;
                let growthPct: number | null = null;
                if (prevMonth && prevMonth.revenue > 0) {
                  growthPct = Math.round(((m.revenue - prevMonth.revenue) / prevMonth.revenue) * 1000) / 10;
                }

                return (
                  <div
                    key={m.month}
                    onClick={() => setSelectedRange(m.month)}
                    className={`cursor-pointer rounded-xl p-3 transition-all ${
                      isSelected
                        ? "bg-teal-50/90 border-2 border-teal-500 shadow-xs dark:bg-teal-950/40 dark:border-teal-400"
                        : "hover:bg-slate-50 border border-slate-200/60 dark:border-slate-800 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between text-xs font-bold gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={isSelected ? "text-teal-950 dark:text-teal-200 font-extrabold" : "text-slate-800 dark:text-slate-200"}>
                          {m.label}
                        </span>
                        <span className="text-[11px] text-slate-400 font-normal">
                          ({m.daysCount} วัน · {m.totalShoes} คู่)
                        </span>

                        {/* Growth % Badge */}
                        {growthPct !== null ? (
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-black px-1.5 py-0 ${
                              growthPct > 0
                                ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700"
                                : growthPct < 0
                                ? "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-700"
                                : "bg-slate-100 text-slate-700 border-slate-300"
                            }`}
                          >
                            {growthPct > 0 ? `▲ +${growthPct}%` : `▼ ${growthPct}%`}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-200">
                            งวดเริ่มต้น
                          </Badge>
                        )}
                      </div>

                      <span className="font-mono font-black text-sm text-teal-800 dark:text-teal-300">
                        ฿{m.revenue.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {/* Progress Visual Bar */}
                    <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isSelected ? "bg-teal-700 dark:bg-teal-400" : "bg-teal-500 dark:bg-teal-600"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* ── Package Distribution (Replaced Size with Package) ── */}
          <Card className="border-slate-200 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <PieChart className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                สถิติสัดส่วนแพ็กเกจบริการ (Package Distribution)
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                วิเคราะห์สัดส่วนแพ็กเกจบริการจาก {totalShoes.toLocaleString()} คู่ ในช่วงเวลาที่เลือก
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: "Package S (200฿)", count: sizeS, desc: "ทำความสะอาดพื้นฐาน (Basic)" },
                  { label: "Package M (400฿)", count: sizeM, desc: "ทำความสะอาดมาตรฐาน (Standard)" },
                  { label: "Package L (600฿)", count: sizeL, desc: "สปาแบบพรีเมียม (Premium)" },
                  { label: "Package XL (800฿)", count: sizeXL, desc: "บูรณะฟูลเซ็ต (Full Restoration)" },
                ].map((s) => {
                  const pct = totalShoes > 0 ? Math.round((s.count / totalShoes) * 100) : 0;
                  return (
                    <div
                      key={s.label}
                      className="rounded-xl border border-slate-200 p-4 bg-slate-50/50 space-y-2 dark:border-slate-800 dark:bg-slate-800/50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100">{s.label}</span>
                        <span className="text-xs font-mono font-bold text-teal-700 dark:text-teal-300">{pct}%</span>
                      </div>
                      <div className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
                        {s.count.toLocaleString()} <span className="text-xs font-normal text-slate-500">คู่</span>
                      </div>
                      <div className="text-[11px] text-slate-400">{s.desc}</div>
                      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div className="h-full bg-teal-600 dark:bg-teal-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* ── Daily Sales Breakdown Table ── */}
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">
                  รายละเอียดรายรับประจำวัน (Daily Records)
                </CardTitle>
                <CardDescription className="text-xs">
                  แสดง {filteredDaily.length} วันที่บันทึก
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[450px]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5">วันที่</th>
                      <th className="px-4 py-2.5 text-center">S</th>
                      <th className="px-4 py-2.5 text-center">M</th>
                      <th className="px-4 py-2.5 text-center">L</th>
                      <th className="px-4 py-2.5 text-center">XL</th>
                      <th className="px-4 py-2.5 text-center">รวม (คู่)</th>
                      <th className="px-4 py-2.5 text-right">เงินสด</th>
                      <th className="px-4 py-2.5 text-right">โอนเงิน</th>
                      <th className="px-4 py-2.5 text-right">ยอดรวมสุทธิ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDaily.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-900">{d.date}</td>
                        <td className="px-4 py-2.5 text-center text-slate-600">{d.sizeS || "-"}</td>
                        <td className="px-4 py-2.5 text-center text-slate-600">{d.sizeM || "-"}</td>
                        <td className="px-4 py-2.5 text-center text-slate-600">{d.sizeL || "-"}</td>
                        <td className="px-4 py-2.5 text-center text-slate-600">{d.sizeXL || "-"}</td>
                        <td className="px-4 py-2.5 text-center font-bold text-teal-800">{d.totalShoes}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-600">฿{d.cashAmount.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-600">฿{d.transferAmount.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-teal-900">
                          ฿{d.grandTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        /* ── Full Inventory Stock Status View ── */
        <div className="space-y-6">
          {/* Inventory KPI Summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card
              onClick={() => setStatInventoryFilter("all")}
              className={`border-slate-200 shadow-xs cursor-pointer transition-all ${
                statInventoryFilter === "all"
                  ? "ring-2 ring-teal-500 bg-teal-50/40 border-teal-300"
                  : "hover:border-teal-300"
              }`}
              title="คลิกเพื่อดูสินค้าทั้งหมด"
            >
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500">จำนวนรายการสินค้าทั้งหมด</span>
                  <div className="text-2xl font-black text-slate-900">
                    {initialData.inventory.totalItemsCount} รายการ
                  </div>
                  <div className="text-[11px] text-slate-400">ครอบคลุมน้ำยาและอุปกรณ์</div>
                </div>
                <div className="rounded-xl bg-teal-50 p-3 text-teal-700 border border-teal-100">
                  <Boxes className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card
              onClick={() => setStatInventoryFilter(statInventoryFilter === "low_stock" ? "all" : "low_stock")}
              className={`border-slate-200 shadow-xs cursor-pointer transition-all ${
                statInventoryFilter === "low_stock"
                  ? "ring-2 ring-rose-500 bg-rose-50/50 border-rose-300 shadow-md"
                  : "hover:border-rose-300"
              }`}
              title={statInventoryFilter === "low_stock" ? "คลิกเพื่อยกเลิกการกรอง" : "คลิกเพื่อดูเฉพาะรายการใกล้หมด"}
            >
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                    สินค้าใกล้หมด / วิกฤต
                    {statInventoryFilter === "low_stock" && (
                      <Badge variant="outline" className="text-[10px] bg-rose-600 text-white font-bold px-1.5 py-0">
                        กำลังกรอง
                      </Badge>
                    )}
                  </span>
                  <div className="text-2xl font-black text-rose-600">
                    {initialData.inventory.lowStockCount} รายการ
                  </div>
                  <div className="text-[11px] text-rose-600 font-semibold">
                    {statInventoryFilter === "low_stock" ? "คลิกเพื่อดูทั้งหมด" : "คลิกเพื่อกรองเฉพาะใกล้หมด"}
                  </div>
                </div>
                <div className="rounded-xl bg-rose-50 p-3 text-rose-600 border border-rose-100">
                  <AlertTriangle className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-xs">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500">มูลค่าสต๊อกคงเหลือรวม</span>
                  <div className="text-2xl font-black text-teal-800 font-mono">
                    ฿{initialData.inventory.totalStockValuation.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-400">คำนวณตาม Moving Average Cost</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-slate-700 border border-slate-200">
                  <Wallet className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Full Items Table */}
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">
                  {statInventoryFilter === "low_stock"
                    ? `รายการสินค้าใกล้หมด / ต่ำกว่า Min Alert (${filteredStatInventoryItems.length} รายการ)`
                    : `ตารางแสดงสต๊อกสินค้าทั้งหมด (${initialData.inventory.totalItemsCount} รายการ)`}
                </CardTitle>
                <CardDescription className="text-xs">
                  {statInventoryFilter === "low_stock"
                    ? "กรองเฉพาะสินค้าที่ต้องสั่งซื้อเพิ่มเร่งด่วน"
                    : "รายการน้ำยา สี กาว และอุปกรณ์ในระบบ Sneaker Care"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {statInventoryFilter === "low_stock" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStatInventoryFilter("all")}
                    className="text-xs h-8 text-rose-700 border-rose-300 bg-rose-50 hover:bg-rose-100 font-bold"
                  >
                    ✕ แสดงทั้งหมด
                  </Button>
                )}
                <Link href="/inventory">
                  <Button size="sm" className="bg-teal-700 hover:bg-teal-800 text-white text-xs h-8 gap-1">
                    จัดการคลังสินค้า <ArrowUpRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5">ชื่อสินค้า / น้ำยา</th>
                      <th className="px-4 py-2.5">หมวดหมู่</th>
                      <th className="px-4 py-2.5 text-right">ยอดคงเหลือ</th>
                      <th className="px-4 py-2.5 text-right">เกณฑ์ขั้นต่ำ</th>
                      <th className="px-4 py-2.5 text-right">ต้นทุน/หน่วย</th>
                      <th className="px-4 py-2.5 text-right">มูลค่ารวม</th>
                      <th className="px-4 py-2.5 text-center">สถานะสต๊อก</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStatInventoryItems.map((it) => {
                      const isLow = it.status === "LOW_STOCK" || it.status === "OUT_OF_STOCK" || it.currentQty <= it.minStock;
                      return (
                        <tr key={it.id} className={`hover:bg-slate-50/80 ${isLow ? "bg-rose-50/20" : ""}`}>
                          <td className="px-4 py-2.5 font-bold text-slate-900">{it.name}</td>
                          <td className="px-4 py-2.5 text-slate-500">{it.category}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                            <span className={isLow ? "text-rose-600 font-black" : ""}>
                              {it.currentQty.toLocaleString()} {it.baseUnit}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-400">
                            {it.minStock} {it.baseUnit}
                          </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-600">
                          ฿{it.unitCost.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-teal-900">
                          ฿{it.totalValuation.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge
                            className={`text-[10px] ${
                              it.status === "NORMAL"
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                                : it.status === "LOW_STOCK"
                                ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                                : "bg-rose-100 text-rose-800 hover:bg-rose-100"
                            }`}
                          >
                            {it.status === "NORMAL"
                              ? "พร้อมใช้งาน"
                              : it.status === "LOW_STOCK"
                              ? "ใกล้หมด"
                              : "สินค้าหมด"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
