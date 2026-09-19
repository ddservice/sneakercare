"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Footprints,
  Boxes,
  Wallet,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  ArrowRight,
  Receipt,
  Plus,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { type ExpenseEntryLike } from "@/lib/expense-totals";
import {
  DEFAULT_REVENUE_BASIS,
  planDashboardBooks,
  type DashboardPeriod,
  type RevenueBasis,
} from "@/lib/dashboard-books";
import type { Tables } from "@/lib/supabase/database.types";

export type DashboardSaleRow = Tables<"sc_sales">;
export type DashboardOpexRow = Tables<"sc_opex">;
export type DashboardPaymentRow = Tables<"sc_payments">;

export function DashboardClient({
  salesRows,
  opexRows,
  paymentsRows,
  catalogCount,
  lowStockCount,
  expenseEntries = [],
  lookbackStart,
}: {
  salesRows: DashboardSaleRow[];
  opexRows: DashboardOpexRow[];
  paymentsRows: DashboardPaymentRow[];
  catalogCount: number;
  lowStockCount: number;
  /**
   * แถวจาก `sc_expense_entries` — ฝั่ง OPEX ของยอดค่าใช้จ่ายมาจากตารางนี้แล้ว
   * (ขั้นที่ 4 ของ docs/sc-opex-refactor-plan.md) ส่วนเงินเดือน/ห้องเช่ายังมาจาก `sc_opex`
   * ถ้าไม่ส่งมา จะตกกลับไปคำนวณจาก `sc_opex` ทั้งก้อนเหมือนเดิม
   */
  expenseEntries?: ExpenseEntryLike[];
  /** วันแรกของช่วงที่เซิร์ฟเวอร์ดึงมา — ปุ่ม «ทั้งหมด» ไม่ใช่ทั้งประวัติ */
  lookbackStart?: string;
}) {
  // Period state
  //
  // ⚠️ (แก้ 2026-09-02) เดิม filterDate/customStartDate/customEndDate hardcode เป็นวันที่ตายตัว
  // ในเดือนสิงหาคม — บั๊กคลาสเดียวกับที่เจอในหน้า /expenses และ /statistics (ดู CLAUDE.md) หน้า
  // แดชบอร์ดเป็นหน้าแรกที่พนักงานเห็นทุกครั้งที่ล็อกอิน ถ้าค้างที่เดือนสิงหาคมตลอดกาลจะเห็นตัวเลข
  // ผิดทันทีโดยไม่รู้ตัว ต้องกดเปลี่ยนวันที่เองทุกครั้งถึงจะเห็นข้อมูลจริง แก้ให้เริ่มที่วันนี้/เดือนนี้เสมอ
  // (คำนวณจากเวลาเครื่องผู้ใช้ — คอมโพเนนต์นี้เป็น client component รันในเบราว์เซอร์จริง)
  const toTodayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const toFirstOfMonthLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  };

  const [period, setPeriod] = useState<DashboardPeriod>("month");

  // ── เกณฑ์รายรับ ───────────────────────────────────────────────────────────
  // "cash" = เงินเข้าจริงในช่วงเวลานี้ · "accrual" = ยอดตามบิลที่ออกในช่วงเวลานี้
  //
  // ⚠️ ค่าเริ่มต้นต้องเป็น "cash" เสมอ — เจ้าของกระทบยอดกับ Excel ด้วยเกณฑ์เงินเข้าจริง
  // (ส.ค. 2569 = ฿24,524.79) **ห้ามเปลี่ยนค่าเริ่มต้นโดยไม่ถามเจ้าของ** (ดู CLAUDE.md)
  // ตัวเลือกนี้เพิ่มมาเพื่อให้เทียบกับ Excel เดือนอื่นที่คิดตามบิลได้โดยไม่ต้องแก้โค้ด
  const [revenueBasis, setRevenueBasis] = useState<RevenueBasis>(DEFAULT_REVENUE_BASIS);
  const [filterDate, setFilterDate] = useState(toTodayLocal);
  const [customStartDate, setCustomStartDate] = useState(toFirstOfMonthLocal);
  const [customEndDate, setCustomEndDate] = useState(toTodayLocal);



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

  const books = useMemo(
    () =>
      planDashboardBooks({
        sales: salesRows,
        opex: opexRows,
        payments: paymentsRows,
        expenseEntries,
        period,
        filterDate,
        customStartDate,
        customEndDate,
        revenueBasis,
      }),
    [salesRows, opexRows, paymentsRows, expenseEntries, period, filterDate, customStartDate, customEndDate, revenueBasis]
  );

  const filteredSales = books.filteredSales as DashboardSaleRow[];
  const {
    totalExpensesForPeriod,
    partnerShareForPeriod,
    cashRevenueForPeriod,
    rentalIncomeForPeriod,
    outstandingForPeriod,
    paidBySaleDate,
    billRevenueForPeriod,
    posTicketPaid,
    dailyEntryPaid,
    posTicketCount,
    serviceRevenueForPeriod,
    totalIncomeForPeriod,
    netProfit,
  } = books;

  const totalTransfer = filteredSales.reduce((acc, s) => acc + Number(s.transfer_amount || 0), 0);
  const totalCash = filteredSales.reduce((acc, s) => acc + Number(s.cash_amount || 0), 0);
  const totalOutstanding = outstandingForPeriod;
  const sizeSCount = filteredSales.reduce((acc, s) => acc + Number(s.size_s || 0), 0);
  const sizeMCount = filteredSales.reduce((acc, s) => acc + Number(s.size_m || 0), 0);
  const sizeLCount = filteredSales.reduce((acc, s) => acc + Number(s.size_l || 0), 0);
  const sizeXLCount = filteredSales.reduce((acc, s) => acc + Number(s.size_xl || 0), 0);
  const totalShoes = sizeSCount + sizeMCount + sizeLCount + sizeXLCount;
  const totalNetRevenue = billRevenueForPeriod;
  const profitMarginPct = totalIncomeForPeriod > 0 ? (netProfit / totalIncomeForPeriod) * 100 : 0;
  const isProfitable = netProfit >= 0;

  // ── ส่วนแบ่งกำไรหุ้นส่วน ──────────────────────────────────────────────────
  //
  // ส่วนแบ่งหุ้นส่วนคิดเป็น % ของ "กำไรสุทธิก่อนแบ่ง" แต่ถูกบันทึกกลับเข้ามาเป็นค่าใช้จ่าย
  // ⇒ ตัวเลข netProfit ข้างบนคือยอด*หลัง*แบ่งไปแล้ว เอาไปคูณ % ซ้ำไม่ได้ (งูกินหาง)
  // จึงต้องโชว์ฐานก่อนแบ่งกำกับไว้ด้วย ให้ตรงกับ Excel ที่เจ้าของกระทบยอด (แสดงสองบรรทัดเสมอ)
  const netProfitBeforePartnerShare = netProfit + partnerShareForPeriod;
  const hasPartnerShare = partnerShareForPeriod > 0;

  // Period label
  const periodLabel = useMemo(() => {
    if (period === "all") {
      return lookbackStart
        ? `สะสมย้อนหลังตั้งแต่ ${lookbackStart} (ไม่ดึงทั้งประวัติ)`
        : "ภาพรวมสะสมทั้งหมด (All Time)";
    }
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
  }, [period, filterDate, customStartDate, customEndDate, lookbackStart]);

  const periodBtn = (active: boolean) =>
    `h-8 text-xs font-medium ${
      active
        ? "bg-slate-900 text-white hover:bg-slate-800"
        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
    }`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="ภาพรวม"
        description="รายรับจากการบริการ ค่าใช้จ่าย กำไรสุทธิ จำนวนคู่ และยอดค้างชำระ"
        actions={
          <>
            <Link href="/pos/daily-entry">
              <Button size="lg" className="gap-2 text-xs">
                <Plus className="h-4 w-4" /> บันทึกยอดขายรายวัน
              </Button>
            </Link>
            <Link href="/expenses">
              <Button variant="outline" size="lg" className="gap-1.5 text-xs">
                <Wallet className="h-4 w-4" /> ค่าใช้จ่าย
              </Button>
            </Link>
            <Link href="/inventory">
              <Button variant="outline" size="lg" className="gap-1.5 text-xs">
                <Boxes className="h-4 w-4" /> คลังสินค้า
              </Button>
            </Link>
          </>
        }
      />

      {/* ── Period Selector Toolbar ── */}
      <Card className="border-slate-200 bg-slate-50/50 shadow-xs dark:border-slate-700 dark:bg-slate-800/50">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-col gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="mr-1 flex items-center gap-1 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">
                <CalendarRange className="h-3.5 w-3.5 text-slate-500" /> ช่วงเวลา
              </span>
              {(
                [
                  ["day", "รายวัน"],
                  ["week", "สัปดาห์"],
                  ["month", "เดือน"],
                  ["all", "ย้อนหลัง"],
                  ["custom", "กำหนดเอง"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={period === value ? "default" : "outline"}
                  onClick={() => setPeriod(value)}
                  className={periodBtn(period === value)}
                >
                  {label}
                </Button>
              ))}
            </div>

            {/* เกณฑ์รายรับ: เงินเข้าจริง = ค่าเริ่มต้นที่กระทบยอด Excel — ห้ามสลับโดยไม่ถาม */}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold leading-4 text-slate-500">เกณฑ์รายรับ</span>
              {([
                ["cash", "เงินเข้าจริง"],
                ["accrual", "ตามบิล"],
              ] as const).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={revenueBasis === value ? "default" : "outline"}
                  onClick={() => setRevenueBasis(value)}
                  className={`h-7 text-[11px] font-medium ${
                    revenueBasis === value
                      ? "bg-slate-800 text-white hover:bg-slate-700"
                      : "bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {label}
                </Button>
              ))}
              {revenueBasis === "accrual" && (
                <span className="text-[11px] font-medium leading-4 text-amber-700">
                  รวมบิลที่ลูกค้ายังไม่จ่าย — ไม่ตรงกับเงินในบัญชี
                </span>
              )}
            </div>

            {/* Date Navigator for Day / Week / Month */}
            {period !== "all" && period !== "custom" && (
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => shiftPeriod(-1)}
                  className="h-7 w-7 p-0 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
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
                  className="h-7 w-7 p-0 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                  title="ช่วงถัดไป"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFilterDate(toTodayLocal())}
                  className="h-7 text-[11px] px-2 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  งวดปัจจุบัน
                </Button>
              </div>
            )}

            {/* Custom Date Range Picker */}
            {period === "custom" && (
              <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm text-xs">
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

          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-medium border-t border-slate-200 dark:border-slate-700 pt-2">
            <span>กำลังแสดง: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{periodLabel}</span></span>
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
        <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">
                รายรับจากการบริการ{" "}
                <span className="text-slate-400">
                  ({revenueBasis === "cash" ? "เงินเข้าจริงในช่วงนี้" : "ตามบิลที่ออกในช่วงนี้"})
                </span>
              </span>
              <div className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                ฿{serviceRevenueForPeriod.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              {/* แสดงยอดตามบิลกำกับไว้ด้วยเมื่อไม่เท่ากัน เพื่อให้เห็นว่าส่วนต่างคือหนี้ที่ยังไม่เข้า */}
              {/* แสดงเฉพาะตอนที่ยอดตามบิล > เงินเข้าจริง (= ยังมีหนี้ค้าง) — ถ้าติดลบแปลว่า
                  เดือนนี้ได้รับเงินของบิลเดือนก่อน ซึ่งเห็นได้จากตัวเลขเงินเข้าอยู่แล้ว ไม่ต้องบอกซ้ำ */}
              {totalNetRevenue - cashRevenueForPeriod > 0.005 && (
                <div className="text-[11px] text-slate-500">
                  {revenueBasis === "cash" ? "ยอดตามบิล " : "เงินเข้าจริง "}
                  ฿{(revenueBasis === "cash" ? totalNetRevenue : cashRevenueForPeriod).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  <span className="text-amber-700 font-semibold">
                    {" "}(ยังไม่เข้า ฿{(totalNetRevenue - cashRevenueForPeriod).toLocaleString("th-TH", { minimumFractionDigits: 2 })})
                  </span>
                </div>
              )}
              {rentalIncomeForPeriod > 0 && (
                <div className="text-[11px] text-emerald-700 font-semibold">
                  + ค่าเช่าห้อง ฿{rentalIncomeForPeriod.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </div>
              )}
              {(posTicketPaid > 0 || dailyEntryPaid > 0) && (
                <div className="text-[11px] text-slate-500">
                  {posTicketPaid > 0 && (
                    <span>
                      จากใบรับงานที่ชำระแล้ว ฿{posTicketPaid.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      {posTicketCount > 0 ? ` (${posTicketCount} ใบ)` : ""}
                    </span>
                  )}
                  {posTicketPaid > 0 && dailyEntryPaid > 0 && <span> · </span>}
                  {dailyEntryPaid > 0 && (
                    <span>
                      จากยอดขายรายวัน ฿{dailyEntryPaid.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </span>
                  )}
                  {posTicketPaid > 0 && (
                    <span className="block text-amber-700">ห้ามกรอกใบรับงานที่ชำระแล้วซ้ำที่ยอดขายรายวัน</span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                <span className="text-blue-700 font-bold">โอน ฿{totalTransfer.toLocaleString()}</span>
                <span>•</span>
                <span className="text-emerald-700 font-bold">สด ฿{totalCash.toLocaleString()}</span>
              </div>
            </div>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700">
              <Receipt className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* 2. Total Combined Expenses */}
        <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium text-slate-500">
                ต้นทุนและค่าใช้จ่ายรวม
              </span>
              <div className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                ฿{totalExpensesForPeriod.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-amber-700">
                ค่าดำเนินการ + เงินเดือนพนักงาน + ภาษี + ค่าเช่า
              </div>
              {hasPartnerShare && (
                <div className="text-[11px] text-indigo-700">
                  รวมส่วนแบ่งหุ้นส่วน ฿
                  {partnerShareForPeriod.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ไว้แล้ว
                </div>
              )}
            </div>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-3 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700">
              <Wallet className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* 3. NET PROFIT (กำไรสุทธิ) - Prominently Displayed */}
        <Card className={`border-2 shadow-sm ${isProfitable ? "border-emerald-500 bg-emerald-50/20" : "border-rose-400 bg-rose-50/20"}`}>
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-700">
                  {hasPartnerShare ? "กำไรสุทธิ (หลังหักส่วนแบ่งหุ้นส่วน)" : "กำไรสุทธิ"}
                </span>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-medium ${
                    isProfitable
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : "bg-rose-100 text-rose-800 border-rose-300"
                  }`}
                >
                  {isProfitable ? "กำไร" : "ขาดทุน"} {profitMarginPct.toFixed(1)}%
                </Badge>
              </div>
              <div className={`text-2xl font-semibold tabular-nums ${isProfitable ? "text-emerald-700" : "text-rose-600"}`}>
                ฿{netProfit.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              {hasPartnerShare ? (
                <div className="text-[11px] text-slate-600 font-medium leading-relaxed">
                  <div>
                    ก่อนแบ่ง{" "}
                    <span className="font-mono font-bold text-slate-800">
                      ฿{netProfitBeforePartnerShare.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="text-indigo-700">
                    − ส่วนแบ่งหุ้นส่วน ฿
                    {partnerShareForPeriod.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 font-medium">
                  (ยอดขายสุทธิ − ค่าใช้จ่ายและเงินเดือนรวม)
                </div>
              )}
            </div>
            <div className={`rounded-xl p-3 ${isProfitable ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"}`}>
              {isProfitable ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />}
            </div>
          </CardContent>
        </Card>

        {/* 4. Total Shoes Volume */}
        <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">จำนวนรองเท้าที่รับบริการ</span>
              <div className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {totalShoes.toLocaleString()} คู่
              </div>
              <div className="text-[11px] text-slate-500">
                S: {sizeSCount} | M: {sizeMCount} | L: {sizeLCount} | XL: {sizeXLCount}
              </div>
            </div>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700">
              <Footprints className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* 5. Total Stock Items */}
        <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">สต๊อกน้ำยา & อุปกรณ์กลาง</span>
              <div className="text-2xl font-semibold tabular-nums text-slate-900">
                {catalogCount} รายการ
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
        <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium text-slate-500">ยอดค้างชำระ</span>
              <div className="text-2xl font-semibold tabular-nums">
                {totalOutstanding > 0 ? (
                  <span className="text-rose-600">฿{totalOutstanding.toLocaleString()}</span>
                ) : (
                  <span className="text-emerald-600">฿0.00 (ชำระครบ)</span>
                )}
              </div>
              <div className="text-[11px] text-slate-400">
                {totalOutstanding > 0 ? "ยอดคงเหลือหลังหักรับชำระเพิ่มแล้ว" : "ไม่มียอดค้างชำระในช่วงนี้"}
              </div>
            </div>
            <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 p-3 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-700">
              <Clock className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Recent Daily Sales Table for the Selected Period ── */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-medium text-slate-900 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-slate-500" />
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
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
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
                  const extraPaid = paidBySaleDate[sale.date] || 0;
                  const totalPaid = Number(sale.transfer_amount || 0) + Number(sale.cash_amount || 0) + extraPaid;
                  const isPaid = totalPaid >= net;

                  return (
                    <tr key={sale.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-2.5 text-slate-700">{sale.date}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-slate-700">
                        {pairs} คู่
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                        ฿{Number(sale.transfer_amount || 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                        ฿{Number(sale.cash_amount || 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-900">
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
