"use client";

import { useState } from "react";
import type { AnalyticsDashboardData } from "@/app/actions/analytics";
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
  const [selectedMonth, setSelectedMonth] = useState(initialData.selectedMonth);
  const [activeTab, setActiveTab] = useState<"sales" | "inventory">("sales");

  // Re-filter data when month changes
  const filteredDaily =
    selectedMonth === "all"
      ? initialData.dailyRecords
      : initialData.dailyRecords.filter((r) => r.date.startsWith(selectedMonth));

  const totalRevenue = filteredDaily.reduce((sum, r) => sum + r.grandTotal, 0);
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

  return (
    <div className="space-y-6">
      {/* ── Top Header Banner & Month Filter ── */}
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

        {/* Month Selector Dropdown */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-teal-300 bg-teal-50/70 px-3 py-1.5 shadow-xs">
            <Calendar className="h-4 w-4 text-teal-700" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-bold text-teal-950 focus:outline-hidden cursor-pointer"
            >
              {initialData.monthsList.map((m) => (
                <option key={m.value} value={m.value} className="text-slate-900 bg-white">
                  {m.label} {m.totalRevenue > 0 ? `(฿${m.totalRevenue.toLocaleString()})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

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

          {/* ── Monthly Trend Bar Visualizer ── */}
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900">
                <BarChart3 className="h-4 w-4 text-teal-700" />
                แนวโน้มยอดขายย้อนหลังทุกเดือน (Monthly Revenue Breakdown)
              </CardTitle>
              <CardDescription className="text-xs">
                เปรียบเทียบยอดขายรวมในแต่ละเดือนตั้งแต่ พฤศจิกายน 2025 ถึงปัจจุบัน
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              {initialData.monthlyTrends.map((m) => {
                const pct = Math.round((m.revenue / maxMonthRevenue) * 100);
                const isSelected = selectedMonth === m.month;
                return (
                  <div
                    key={m.month}
                    onClick={() => setSelectedMonth(m.month)}
                    className={`cursor-pointer rounded-lg p-2.5 transition-all ${
                      isSelected
                        ? "bg-teal-50/80 border border-teal-300"
                        : "hover:bg-slate-50 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                      <span className={isSelected ? "text-teal-900" : "text-slate-800"}>
                        {m.label} ({m.daysCount} วัน / {m.totalShoes} คู่)
                      </span>
                      <span className="font-mono text-teal-800">
                        ฿{m.revenue.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isSelected ? "bg-teal-700" : "bg-teal-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* ── Shoe Size Breakdown ── */}
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900">
                <PieChart className="h-4 w-4 text-teal-700" />
                สถิติสัดส่วนขนาดรองเท้าที่รับบริการ (Size Distribution)
              </CardTitle>
              <CardDescription className="text-xs">
                คำนวณจาก {totalShoes.toLocaleString()} คู่ ในช่วงเวลาที่เลือก
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: "Size S (35-37)", count: sizeS, desc: "เท้าเล็ก / ผู้หญิง" },
                  { label: "Size M (38-41)", count: sizeM, desc: "มาตรฐานทั่วไป" },
                  { label: "Size L (42-44)", count: sizeL, desc: "มาตรฐานผู้ชาย" },
                  { label: "Size XL (45+)", count: sizeXL, desc: "ขนาดใหญ่พิเศษ" },
                ].map((s) => {
                  const pct = totalShoes > 0 ? Math.round((s.count / totalShoes) * 100) : 0;
                  return (
                    <div
                      key={s.label}
                      className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-center"
                    >
                      <div className="text-xs font-bold text-slate-700">{s.label}</div>
                      <div className="text-2xl font-black text-teal-800 my-1 font-mono">{s.count} คู่</div>
                      <div className="text-[11px] font-semibold text-teal-700">{pct}%</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{s.desc}</div>
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
            <Card className="border-slate-200 shadow-xs">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500">จำนวนสินค้าทั้งหมด</span>
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

            <Card className="border-slate-200 shadow-xs">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500">สินค้าใกล้หมด / วิกฤต</span>
                  <div className="text-2xl font-black text-rose-600">
                    {initialData.inventory.lowStockCount} รายการ
                  </div>
                  <div className="text-[11px] text-rose-600 font-semibold">ต่ำกว่าจุดสั่งซื้อขั้นต่ำ</div>
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

          {/* Full 46 Items Table */}
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">
                  ตารางแสดงสต๊อกสินค้าทั้งหมด ({initialData.inventory.totalItemsCount} รายการ)
                </CardTitle>
                <CardDescription className="text-xs">
                  รายการน้ำยา สี กาว และอุปกรณ์ในระบบ Sneaker Care
                </CardDescription>
              </div>
              <Link href="/inventory">
                <Button size="sm" className="bg-teal-700 hover:bg-teal-800 text-white text-xs h-8 gap-1">
                  จัดการคลังสินค้า <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
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
                    {initialData.inventory.items.map((it) => (
                      <tr key={it.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-2.5 font-bold text-slate-900">{it.name}</td>
                        <td className="px-4 py-2.5 text-slate-500">{it.category}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                          {it.currentQty.toLocaleString()} {it.baseUnit}
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
                    ))}
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
