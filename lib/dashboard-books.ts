/**
 * สูตรหน้าภาพรวม — เกณฑ์เริ่มต้นเงินเข้าจริง · นับแค่ sc_sales + sc_payments (+ ค่าเช่าห้อง)
 * ห้ามนับ service_orders เป็นรายได้ (งานที่ชำระแล้วอยู่ใน sc_sales แล้ว)
 */

import {
  applyEntriesToBreakdown,
  calculateExpenseBreakdown,
  type ExpenseEntryLike,
  type OpexRowLike,
} from "./expense-totals";

export type DashboardPeriod = "all" | "day" | "week" | "month" | "custom";
export type RevenueBasis = "cash" | "accrual";

/** ค่าเริ่มต้นที่เจ้าของกระทบยอด Excel — ห้ามสลับโดยไม่ถาม */
export const DEFAULT_REVENUE_BASIS: RevenueBasis = "cash";

/** หน้าภาพรวมดึงย้อนหลังเท่านี้นับรวมเดือนปัจจุบัน — ไม่ดึง sc_sales ทั้งตาราง */
export const DASHBOARD_LOOKBACK_MONTHS = 14;

export type DashboardSaleLike = {
  date?: string | null;
  amount_paid?: number | string | null;
  cash_amount?: number | string | null;
  transfer_amount?: number | string | null;
  total_revenue?: number | string | null;
  grand_total?: number | string | null;
  discount?: number | string | null;
  client_request_id?: string | null;
};

export type DashboardPaymentLike = {
  sale_date?: string | null;
  received_date?: string | null;
  amount?: number | string | null;
};

export type DashboardBooksInput = {
  sales: readonly DashboardSaleLike[];
  opex: readonly OpexRowLike[];
  payments: readonly DashboardPaymentLike[];
  expenseEntries?: readonly ExpenseEntryLike[];
  period: DashboardPeriod;
  filterDate: string;
  customStartDate: string;
  customEndDate: string;
  revenueBasis?: RevenueBasis;
};

function money(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function num(value: unknown): number {
  return Number(value ?? 0) || 0;
}

export function saleNet(sale: DashboardSaleLike): number {
  return num(sale.total_revenue || num(sale.grand_total) - num(sale.discount));
}

export function isPosTicketSale(sale: DashboardSaleLike): boolean {
  return Boolean(String(sale.client_request_id ?? "").trim());
}

export function countsTowardDashboardRevenue(
  source: "sc_sales" | "sc_payments" | "service_orders" | "ext_documents"
): boolean {
  return source === "sc_sales" || source === "sc_payments";
}

export function weekBounds(filterDate: string): { monStr: string; sunStr: string } {
  const baseDate = new Date(filterDate);
  const dayOfWeek = baseDate.getDay();
  const diffToMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    monStr: monday.toISOString().slice(0, 10),
    sunStr: sunday.toISOString().slice(0, 10),
  };
}

function inRange(
  date: string,
  period: DashboardPeriod,
  filterDate: string,
  customStartDate: string,
  customEndDate: string,
  week: { monStr: string; sunStr: string }
): boolean {
  if (period === "day") return date === filterDate;
  if (period === "week") return date >= week.monStr && date <= week.sunStr;
  if (period === "month") return date.startsWith(filterDate.slice(0, 7));
  if (period === "custom") return date >= customStartDate && date <= customEndDate;
  return true;
}

export function planDashboardBooks(input: DashboardBooksInput): {
  filteredSales: DashboardSaleLike[];
  totalExpensesForPeriod: number;
  partnerShareForPeriod: number;
  cashRevenueForPeriod: number;
  billRevenueForPeriod: number;
  rentalIncomeForPeriod: number;
  outstandingForPeriod: number;
  paidOnBills: number;
  arReceived: number;
  posTicketPaid: number;
  dailyEntryPaid: number;
  posTicketCount: number;
  paidBySaleDate: Record<string, number>;
  serviceRevenueForPeriod: number;
  totalIncomeForPeriod: number;
  netProfit: number;
  revenueBasis: RevenueBasis;
} {
  const revenueBasis = input.revenueBasis ?? DEFAULT_REVENUE_BASIS;
  const week = weekBounds(input.filterDate);
  const [y, m] = input.filterDate.slice(0, 7).split("-");
  const monthPrefixISO = input.filterDate.slice(0, 7);
  const monthPrefixLegacy = `${m}/${y}`;

  const filteredSales = input.sales.filter((s) => {
    const date = String(s.date || "");
    return inRange(date, input.period, input.filterDate, input.customStartDate, input.customEndDate, week);
  });

  const monthRows = input.opex.filter((o) => {
    const oMonth = String(o.month || "").trim();
    if (input.period === "month" || input.period === "day" || input.period === "week") {
      return oMonth === monthPrefixLegacy || oMonth === monthPrefixISO;
    }
    if (input.period === "custom") {
      const [sy, sm] = input.customStartDate.slice(0, 7).split("-");
      const [ey, em] = input.customEndDate.slice(0, 7).split("-");
      return oMonth >= `${sm}/${sy}` && oMonth <= `${em}/${ey}`;
    }
    return true;
  });

  const expenseEntries = input.expenseEntries ?? [];
  const periodEntries = expenseEntries.filter((e) => {
    const d = String(e.entry_date ?? "");
    if (!d) return false;
    if (input.period === "month" || input.period === "day" || input.period === "week") {
      return d.startsWith(monthPrefixISO);
    }
    if (input.period === "custom") {
      return d.slice(0, 7) >= input.customStartDate.slice(0, 7) && d.slice(0, 7) <= input.customEndDate.slice(0, 7);
    }
    return true;
  });

  const legacyBreakdown = calculateExpenseBreakdown(monthRows);
  const breakdown =
    expenseEntries.length > 0
      ? applyEntriesToBreakdown(legacyBreakdown, periodEntries, monthRows)
      : legacyBreakdown;

  let expSum = breakdown.totalExpenses;
  let partnerShare = breakdown.totalPartnerShare;
  let rentalIncome = breakdown.totalRentalIncome;
  if (input.period === "day" || input.period === "week") {
    const daysInMonth = 31;
    const ratio = input.period === "day" ? 1 / daysInMonth : 7 / daysInMonth;
    expSum *= ratio;
    partnerShare *= ratio;
    rentalIncome *= ratio;
  }

  const paidOnBills = filteredSales.reduce((acc, s) => acc + num(s.amount_paid), 0);
  const posTicketSales = filteredSales.filter(isPosTicketSale);
  const posTicketPaid = posTicketSales.reduce((acc, s) => acc + num(s.amount_paid), 0);
  const dailyEntryPaid = paidOnBills - posTicketPaid;

  const arReceived = input.payments.reduce((acc, p) => {
    const d = String(p.received_date || "");
    if (!d) return acc;
    return inRange(d, input.period, input.filterDate, input.customStartDate, input.customEndDate, week)
      ? acc + num(p.amount)
      : acc;
  }, 0);

  const periodEnd =
    input.period === "day"
      ? input.filterDate
      : input.period === "week"
        ? week.sunStr
        : input.period === "month"
          ? `${monthPrefixISO}-31`
          : input.period === "custom"
            ? input.customEndDate
            : "9999-12-31";

  const paidBySaleDate: Record<string, number> = {};
  input.payments.forEach((p) => {
    if (!p.sale_date) return;
    const received = String(p.received_date || "");
    if (received && received > periodEnd) return;
    paidBySaleDate[p.sale_date] = (paidBySaleDate[p.sale_date] || 0) + num(p.amount);
  });

  const outstanding = filteredSales.reduce((acc, s) => {
    const net = saleNet(s);
    const paid = num(s.cash_amount) + num(s.transfer_amount) + (paidBySaleDate[String(s.date)] || 0);
    return acc + Math.max(0, net - paid);
  }, 0);

  const cashRevenueForPeriod = money(paidOnBills + arReceived);
  const billRevenueForPeriod = money(filteredSales.reduce((acc, s) => acc + saleNet(s), 0));
  const serviceRevenueForPeriod = revenueBasis === "cash" ? cashRevenueForPeriod : billRevenueForPeriod;
  const rentalIncomeForPeriod = money(rentalIncome);
  const totalExpensesForPeriod = money(expSum);
  const totalIncomeForPeriod = money(serviceRevenueForPeriod + rentalIncomeForPeriod);

  return {
    filteredSales,
    totalExpensesForPeriod,
    partnerShareForPeriod: money(partnerShare),
    cashRevenueForPeriod,
    billRevenueForPeriod,
    rentalIncomeForPeriod,
    outstandingForPeriod: money(outstanding),
    paidOnBills: money(paidOnBills),
    arReceived: money(arReceived),
    posTicketPaid: money(posTicketPaid),
    dailyEntryPaid: money(dailyEntryPaid),
    posTicketCount: posTicketSales.length,
    paidBySaleDate,
    serviceRevenueForPeriod,
    totalIncomeForPeriod,
    netProfit: money(totalIncomeForPeriod - totalExpensesForPeriod),
    revenueBasis,
  };
}

function ymdParts(value: string): { y: number; m: number; d: number } | null {
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** วันแรกของเดือนที่ย้อนหลัง `months` เดือน (นับเดือนปัจจุบันด้วย) */
export function dashboardLookbackStart(todayYmd: string, months = DASHBOARD_LOOKBACK_MONTHS): string {
  const parts = ymdParts(todayYmd);
  if (!parts || months < 1) return `${String(todayYmd).slice(0, 7)}-01`;
  const total = parts.y * 12 + (parts.m - 1) - (months - 1);
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export function dashboardLookbackOpexMonths(todayYmd: string, months = DASHBOARD_LOOKBACK_MONTHS): string[] {
  const start = dashboardLookbackStart(todayYmd, months);
  const startParts = ymdParts(start);
  const todayParts = ymdParts(todayYmd);
  if (!startParts || !todayParts) return [];
  const keys: string[] = [];
  let cursor = startParts.y * 12 + (startParts.m - 1);
  const end = todayParts.y * 12 + (todayParts.m - 1);
  while (cursor <= end) {
    const y = Math.floor(cursor / 12);
    const m = String((cursor % 12) + 1).padStart(2, "0");
    keys.push(`${m}/${y}`, `${y}-${m}`);
    cursor += 1;
  }
  return keys;
}
