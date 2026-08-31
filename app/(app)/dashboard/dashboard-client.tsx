"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  Footprints,
  Boxes,
  Wallet,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Receipt,
  ArrowUpFromLine,
  ArrowDownToLine,
  Plus,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Building,
  Check,
} from "lucide-react";
import Link from "next/link";

type DashboardPeriod = "all" | "day" | "week" | "month" | "custom";

export function DashboardClient({
  salesRows,
  opexRows,
  paymentsRows,
  orders,
  stockItems,
  lowStock,
}: {
  salesRows: any[];
  opexRows: any[];
  paymentsRows: any[];
  orders: any[];
  stockItems: any[];
  lowStock: any[];
}) {
  // Period state
  const [period, setPeriod] = useState<DashboardPeriod>("month");
  const [filterDate, setFilterDate] = useState("2026-08-31");
  const [customStartDate, setCustomStartDate] = useState("2026-08-01");
  const [customEndDate, setCustomEndDate] = useState("2026-08-31");

  // Map AR Payments by sale_date
  const paymentsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    (paymentsRows || []).forEach((p) => {
      if (p.sale_date) {
        map[p.sale_date] = (map[p.sale_date] || 0) + Number(p.amount || 0);
      }
    });
    return map;
  }, [paymentsRows]);

  // Shift period navigator
  function shiftPeriod(delta: number) {
    const cur = new Date(filterDate);
    if (period === "day") {
      cur.setDate(cur.getDate() + delta);
      setFilterDate(cur.toISOString().slice(0, 10));
    } else if (period === "week") {
      cur.setDate(cur.getDate() + delta * 7);
      setFilterDate(cur.toISOString().slice(0, 10));
    } else if (period === "month") {
      cur.setMonth(cur.getMonth() + delta);
      setFilterDate(cur.toISOString().slice(0, 10));
    }
  }

  // Filter Sales & Expenses based on selected period
  const { filteredSales, totalExpensesForPeriod } = useMemo(() => {
    const baseDate = new Date(filterDate);
    const dayOfWeek = baseDate.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const monStr = monday.toISOString().slice(0, 10);
    const sunStr = sunday.toISOString().slice(0, 10);

    const [y, m] = filterDate.slice(0, 7).split("-");
    const monthPrefixISO = filterDate.slice(0, 7); // "2026-08"
    const monthPrefixLegacy = `${m}/${y}`; // "08/2026"

    // 1. Filter Sales
    const fSales = (salesRows || []).filter((s) => {
      if (period === "day") return s.date === filterDate;
      if (period === "week") return s.date >= monStr && s.date <= sunStr;
      if (period === "month") return s.date?.startsWith(monthPrefixISO);
      if (period === "custom") return s.date >= customStartDate && s.date <= customEndDate;
      return true; // all
    });

    // 2. Filter & Aggregate OPEX
    // Valid categories for real expenses (excluding internal helpers & rental meter readings)
    const validExpenseCategories = new Set([
      "ค่าดำเนินการ",
      "ค่าแรงพนักงาน",
      "ภาษี",
      "ค่าเช่าร้าน",
      "ค่าการตลาด",
      "ทั่วไป",
      "misc",
      "รายจ่าย",
    ]);

    let expSum = 0;
    (opexRows || []).forEach((o) => {
      const amt = Number(o.amount || 0);
      if (amt <= 0 || amt > 10000000) return; // filter anomalies

      const cat = o.category || "";
      if (!validExpenseCategories.has(cat)) return;

      const oMonth = String(o.month || "").trim();

      if (period === "month") {
        if (oMonth === monthPrefixLegacy || oMonth === monthPrefixISO) {
          expSum += amt;
        }
      } else if (period === "day" || period === "week") {
        // Apportion monthly opex for day/week view
        if (oMonth === monthPrefixLegacy || oMonth === monthPrefixISO) {
          const daysInMonth = 31;
          const factor = period === "day" ? 1 / daysInMonth : 7 / daysInMonth;
          expSum += amt * factor;
        }
      } else if (period === "custom") {
        const startM = customStartDate.slice(0, 7);
        const endM = customEndDate.slice(0, 7);
        const [sy, sm] = startM.split("-");
        const [ey, em] = endM.split("-");
        const sLegacy = `${sm}/${sy}`;
        const eLegacy = `${em}/${ey}`;
        if (oMonth >= sLegacy && oMonth <= eLegacy) {
          expSum += amt;
        }
      } else {
        // all time
        expSum += amt;
      }
    });

    return { filteredSales: fSales, totalExpensesForPeriod: Math.round(expSum * 100) / 100 };
  }, [salesRows, opexRows, period, filterDate, customStartDate, customEndDate]);

  // Financial KPI Calculations
  const totalNetRevenue = filteredSales.reduce(
    (acc, s) => acc + Number(s.total_revenue || (Number(s.grand_total || 0) - Number(s.discount || 0))),
    0
  );
  const totalTransfer = filteredSales.reduce((acc, s) => acc + Number(s.transfer_amount || 0), 0);
  const totalCash = filteredSales.reduce((acc, s) => acc + Number(s.cash_amount || 0), 0);

  // Exact Outstanding AR factoring in sc_payments
  const totalOutstanding = filteredSales.reduce((acc, s) => {
    const net = Number(s.total_revenue || (Number(s.grand_total || 0) - Number(s.discount || 0)));
    const extraPaid = paymentsByDate[s.date] || 0;
    const totalPaidForBill = Number(s.transfer_amount || 0) + Number(s.cash_amount || 0) + extraPaid;
    return acc + Math.max(0, net - totalPaidForBill);
  }, 0);

  // Total Shoes Count
  const sizeSCount = filteredSales.reduce((acc, s) => acc + Number(s.size_s || 0), 0);
  const sizeMCount = filteredSales.reduce((acc, s) => acc + Number(s.size_m || 0), 0);
  const sizeLCount = filteredSales.reduce((acc, s) => acc + Number(s.size_l || 0), 0);
  const sizeXLCount = filteredSales.reduce((acc, s) => acc + Number(s.size_xl || 0), 0);
  const totalShoes = sizeSCount + sizeMCount + sizeLCount + sizeXLCount;

  // NET PROFIT & MARGIN
  const netProfit = totalNetRevenue - totalExpensesForPeriod;
  const profitMarginPct = totalNetRevenue > 0 ? (netProfit / totalNetRevenue) * 100 : 0;
  const isProfitable = netProfit >= 0;

  // Period label
  const periodLabel = useMemo(() => {
    if (period === "all") return "ภาพรวมสะสมทั้งหมด (All Time)";
    if (period === "day") return `รายวัน: ${filterDate}`;
    if (period === "week") {
      const baseDate = new Date(filterDate);
      const diffToMonday = (baseDate.getDay() + 6) % 7;
      const mon = new Date(baseDate);
      mon.setDate(baseDate.getDate() - diffToMonday);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return `รายสัปดาห์: ${mon.toISOString().slice(0, 10)} ถึง ${sun.toISOString().slice(0, 10)}`;
    }
    if (period === "month") {
      const [y, m] = filterDate.slice(0, 7).split("-");
      const monthNames = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
      ];
      return `รายเดือน: ${monthNames[parseInt(m) - 1]} ${parseInt(y) + 543} (${filterDate.slice(0, 7)})`;
    }
    if (period === "custom") return `ช่วงวันที่: ${customStartDate} ถึง ${customEndDate}`;
    return "";
  }, [period, filterDate, customStartDate, customEndDate]);

  const lowStockCount = (lowStock || []).length;
  const totalItemsCount = (stockItems || []).length;

  return (
    <div className="space-y-8">
      {/* ── Header Banner ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 p-6 text-white shadow-md">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-200 ring-1 ring-teal-400/30">
            <Sparkles className="h-3.5 w-3.5" />
            SneakerCare Smart Analytics Dashboard
          </div>
          <h2 className="text-2xl font-bold tracking-tight">ภาพรวมผลประกอบการ & กำไรสุทธิ</h2>
          <p className="text-xs sm:text-sm text-teal-100/80">
            สรุปรายรับจากการบริการ ค่าใช้จ่าย กำไรสุทธิ สถิติจำนวนคู่ และยอดค้างชำระ (ดูย้อนหลังได้ทุกช่วงเวลา)
          </p>
        </div>

        {/* Fast Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/pos/daily-entry">
            <Button className="bg-teal-400 font-black hover:bg-teal-300 text-slate-950 gap-2 shadow-xs text-xs h-9">
              <Plus className="h-4 w-4" /> บันทึกยอดขายรายวัน
            </Button>
          </Link>
          <Link href="/expenses">
            <Button variant="outline" className="bg-white/10 text-white hover:bg-white/20 border-white/20 text-xs gap-1.5 h-9">
              <Wallet className="h-4 w-4" /> จัดการค่าใช้จ่าย & เงินเดือน
            </Button>
          </Link>
          <Link href="/inventory">
            <Button variant="outline" className="bg-white/10 text-white hover:bg-white/20 border-white/20 text-xs gap-1.5 h-9">
              <Boxes className="h-4 w-4" /> คลังสินค้า
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Period Selector Toolbar ── */}
      <Card className="border-teal-200 bg-teal-50/40 shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-teal-950 flex items-center gap-1 mr-1">
                <CalendarRange className="h-3.5 w-3.5 text-teal-700" /> เลือกช่วงเวลาย้อนหลัง:
              </span>
              <Button
                type="button"
                size="sm"
                variant={period === "day" ? "default" : "outline"}
                onClick={() => setPeriod("day")}
                className={`h-8 text-xs font-bold ${
                  period === "day" ? "bg-teal-700 text-white" : "bg-white text-slate-700"
                }`}
              >
                🗓️ รายวัน
              </Button>
              <Button
                type="button"
                size="sm"
                variant={period === "week" ? "default" : "outline"}
                onClick={() => setPeriod("week")}
                className={`h-8 text-xs font-bold ${
                  period === "week" ? "bg-teal-700 text-white" : "bg-white text-slate-700"
                }`}
              >
                📅 รายสัปดาห์
              </Button>
              <Button
                type="button"
                size="sm"
                variant={period === "month" ? "default" : "outline"}
                onClick={() => setPeriod("month")}
                className={`h-8 text-xs font-bold ${
                  period === "month" ? "bg-teal-700 text-white" : "bg-white text-slate-700"
                }`}
              >
                📆 รายเดือน
              </Button>
              <Button
                type="button"
                size="sm"
                variant={period === "all" ? "default" : "outline"}
                onClick={() => setPeriod("all")}
                className={`h-8 text-xs font-bold ${
                  period === "all" ? "bg-teal-700 text-white" : "bg-white text-slate-700"
                }`}
              >
                🌐 ภาพรวมทั้งหมด
              </Button>
              <Button
                type="button"
                size="sm"
                variant={period === "custom" ? "default" : "outline"}
                onClick={() => setPeriod("custom")}
                className={`h-8 text-xs font-bold ${
                  period === "custom" ? "bg-teal-700 text-white" : "bg-white text-slate-700"
                }`}
              >
                🔍 กำหนดช่วงวันเอง
              </Button>
            </div>

            {/* Date Navigator for Day / Week / Month */}
            {period !== "all" && period !== "custom" && (
              <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-teal-200 shadow-2xs">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => shiftPeriod(-1)}
                  className="h-7 w-7 p-0 text-teal-800 hover:bg-teal-50"
                  title="ช่วงก่อนหน้า"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Input
                  type={period === "month" ? "month" : "date"}
                  value={period === "month" ? filterDate.slice(0, 7) : filterDate}
                  onChange={(e) => {
                    if (period === "month") {
                      setFilterDate(e.target.value + "-01");
                    } else {
                      setFilterDate(e.target.value);
                    }
                  }}
                  className="h-7 text-xs font-medium border-0 focus-visible:ring-0 w-36 text-center"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => shiftPeriod(1)}
                  className="h-7 w-7 p-0 text-teal-800 hover:bg-teal-50"
                  title="ช่วงถัดไป"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFilterDate("2026-08-31")}
                  className="h-7 text-[11px] px-2 text-teal-900 border-teal-200 hover:bg-teal-50"
                >
                  งวดปัจจุบัน
                </Button>
              </div>
            )}

            {/* Custom Date Range Picker */}
            {period === "custom" && (
              <div className="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-teal-200 shadow-2xs text-xs">
                <span className="text-slate-500 font-semibold">ตั้งแต่:</span>
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="h-7 text-xs w-32"
                />
                <span className="text-slate-500 font-semibold">ถึง:</span>
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="h-7 text-xs w-32"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-teal-950 font-bold border-t border-teal-200/60 pt-2">
            <span>📊 กำลังแสดงผลช่วงเวลา: <span className="text-teal-800 font-extrabold">{periodLabel}</span></span>
            <span className="text-slate-500">บันทึกยอดขาย {filteredSales.length} วัน</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Low Stock Alert Banner (if any) ── */}
      {lowStockCount > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-rose-900 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-rose-100 p-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold text-sm">ตรวจพบสินค้าและน้ำยาใกล้หมด {lowStockCount} รายการ!</div>
              <div className="text-xs text-rose-700">
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

      {/* ── Core KPI Grid (6 Metric Cards Including Net Profit) ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* 1. Net Revenue */}
        <Card className="border-teal-200 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">รายรับสุทธิจากการบริการ (Net Sales)</span>
              <div className="text-2xl font-black text-teal-800 font-mono">
                ฿{totalNetRevenue.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                <span className="text-blue-700 font-bold">โอน ฿{totalTransfer.toLocaleString()}</span>
                <span>•</span>
                <span className="text-emerald-700 font-bold">สด ฿{totalCash.toLocaleString()}</span>
              </div>
            </div>
            <div className="rounded-xl bg-teal-50 p-3 text-teal-700">
              <Receipt className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* 2. Total Combined Expenses */}
        <Card className="border-amber-200 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">ต้นทุน & ค่าใช้จ่ายรวม (Expenses & OPEX)</span>
              <div className="text-2xl font-black text-amber-900 font-mono">
                ฿{totalExpensesForPeriod.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-amber-700">
                ค่าดำเนินการ + เงินเดือนพนักงาน + ภาษี + ค่าเช่า
              </div>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 text-amber-700">
              <Wallet className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* 3. NET PROFIT (กำไรสุทธิ) - Prominently Displayed */}
        <Card className={`border-2 shadow-sm ${isProfitable ? "border-emerald-500 bg-emerald-50/20" : "border-rose-400 bg-rose-50/20"}`}>
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-700">กำไรสุทธิ (Net Profit)</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-black ${
                    isProfitable
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : "bg-rose-100 text-rose-800 border-rose-300"
                  }`}
                >
                  {isProfitable ? "กำไร" : "ขาดทุน"} {profitMarginPct.toFixed(1)}%
                </Badge>
              </div>
              <div className={`text-2xl font-black font-mono ${isProfitable ? "text-emerald-700" : "text-rose-600"}`}>
                ฿{netProfit.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                (ยอดขายสุทธิ − ค่าใช้จ่ายและเงินเดือนรวม)
              </div>
            </div>
            <div className={`rounded-xl p-3 ${isProfitable ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"}`}>
              {isProfitable ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />}
            </div>
          </CardContent>
        </Card>

        {/* 4. Total Shoes Volume */}
        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">จำนวนรองเท้าที่รับบริการ</span>
              <div className="text-2xl font-black text-slate-900 font-mono">
                {totalShoes.toLocaleString()} คู่
              </div>
              <div className="text-[11px] text-slate-500">
                S: {sizeSCount} | M: {sizeMCount} | L: {sizeLCount} | XL: {sizeXLCount}
              </div>
            </div>
            <div className="rounded-xl bg-teal-50 p-3 text-teal-700">
              <Footprints className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* 5. Total Stock Items */}
        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">สต๊อกน้ำยา & อุปกรณ์กลาง</span>
              <div className="text-2xl font-bold text-slate-900 font-mono">
                {totalItemsCount} รายการ
              </div>
              <div className="text-[11px] text-slate-400">
                {lowStockCount > 0 ? (
                  <span className="text-rose-600 font-bold">ใกล้หมด {lowStockCount} รายการ</span>
                ) : (
                  <span className="text-emerald-600 font-bold">สต๊อกเพียงพอทุกรายการ</span>
                )}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-slate-700">
              <Boxes className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* 6. Outstanding Receivables (Factoring in AR Payments) */}
        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">ยอดค้างชำระ (Outstanding AR)</span>
              <div className="text-2xl font-bold font-mono">
                {totalOutstanding > 0 ? (
                  <span className="text-rose-600 font-black">฿{totalOutstanding.toLocaleString()}</span>
                ) : (
                  <span className="text-emerald-600 font-black">฿0.00 (ชำระครบ)</span>
                )}
              </div>
              <div className="text-[11px] text-slate-400">
                {totalOutstanding > 0 ? "ยอดคงเหลือหลังหักรับชำระเพิ่มแล้ว" : "ไม่มียอดค้างชำระในช่วงนี้"}
              </div>
            </div>
            <div className="rounded-xl bg-rose-50 p-3 text-rose-600">
              <Clock className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Recent Daily Sales Table for the Selected Period ── */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-teal-700" />
              บันทึกยอดขายล่าสุด ({filteredSales.length} วัน)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              ข้อมูลยอดขาย ค่าบริการเสริม และช่องทางการรับเงินของช่วงเวลานี้
            </CardDescription>
          </div>
          <Link href="/pos/daily-entry">
            <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8">
              ดูและบันทึกเพิ่มเติม <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[380px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-700 font-bold border-b border-slate-200 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left">วันที่</th>
                  <th className="px-3 py-2.5 text-center">จำนวนคู่</th>
                  <th className="px-3 py-2.5 text-right">เงินโอน</th>
                  <th className="px-3 py-2.5 text-right">เงินสด</th>
                  <th className="px-3 py-2.5 text-right">ยอดสุทธิ</th>
                  <th className="px-3 py-2.5 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredSales.slice(0, 15).map((sale) => {
                  const pairs =
                    Number(sale.size_s || 0) +
                    Number(sale.size_m || 0) +
                    Number(sale.size_l || 0) +
                    Number(sale.size_xl || 0);

                  const net = Number(
                    sale.total_revenue || (Number(sale.grand_total || 0) - Number(sale.discount || 0))
                  );
                  const extraPaid = paymentsByDate[sale.date] || 0;
                  const totalPaid = Number(sale.transfer_amount || 0) + Number(sale.cash_amount || 0) + extraPaid;
                  const isPaid = totalPaid >= net;

                  return (
                    <tr key={sale.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-2.5 font-bold text-slate-900">{sale.date}</td>
                      <td className="px-3 py-2.5 text-center font-mono font-bold text-teal-800">
                        {pairs} คู่
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-blue-700 font-semibold">
                        ฿{Number(sale.transfer_amount || 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-700 font-semibold">
                        ฿{Number(sale.cash_amount || 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-black text-slate-900">
                        ฿{net.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {isPaid ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]">
                            ✓ ชำระครบ
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-rose-100 text-rose-800 border-rose-300 text-[10px] font-bold">
                            ⏳ ค้างชำระ (฿{(net - totalPaid).toLocaleString()})
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredSales.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      ไม่พบข้อมูลยอดขายในช่วงเวลานี้
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
