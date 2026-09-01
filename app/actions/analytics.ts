"use server";

import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type MonthlySummary = {
  month: string; // YYYY-MM
  label: string; // เช่น สิงหาคม 2026
  revenue: number;
  cashAmount: number;
  transferAmount: number;
  discount: number;
  daysCount: number;
  totalShoes: number;
  sizeS: number;
  sizeM: number;
  sizeL: number;
  sizeXL: number;
};

export type DailySaleRecord = {
  id: number;
  date: string;
  totalRevenue: number;
  cashAmount: number;
  transferAmount: number;
  discount: number;
  grandTotal: number;
  sizeS: number;
  sizeM: number;
  sizeL: number;
  sizeXL: number;
  totalShoes: number;
  recordedBy: string;
  extraItems: string;
};

export type InventoryItemSummary = {
  id: string;
  name: string;
  category: string;
  baseUnit: string;
  currentQty: number;
  minStock: number;
  unitCost: number;
  totalValuation: number;
  status: "NORMAL" | "LOW_STOCK" | "OUT_OF_STOCK";
};

export type AnalyticsDashboardData = {
  selectedMonth: string;
  monthsList: Array<{ value: string; label: string; totalRevenue: number }>;
  summary: {
    totalRevenue: number;
    totalCash: number;
    totalTransfer: number;
    totalDiscount: number;
    totalShoes: number;
    totalDays: number;
    dailyAvgRevenue: number;
    avgPerShoe: number;
    sizeS: number;
    sizeM: number;
    sizeL: number;
    sizeXL: number;
  };
  monthlyTrends: MonthlySummary[];
  dailyRecords: DailySaleRecord[];
  inventory: {
    items: InventoryItemSummary[];
    totalItemsCount: number;
    lowStockCount: number;
    totalStockValuation: number;
  };
};

const THAI_MONTHS: Record<string, string> = {
  "01": "มกราคม",
  "02": "กุมภาพันธ์",
  "03": "มีนาคม",
  "04": "เมษายน",
  "05": "พฤษภาคม",
  "06": "มิถุนายน",
  "07": "กรกฎาคม",
  "08": "สิงหาคม",
  "09": "กันยายน",
  "10": "ตุลาคม",
  "11": "พฤศจิกายน",
  "12": "ธันวาคม",
};

function formatMonthLabel(yyyyMm: string): string {
  const [year, month] = yyyyMm.split("-");
  const thYear = Number(year) + 543;
  const thMonth = THAI_MONTHS[month] || month;
  return `${thMonth} ${thYear} (${yyyyMm})`;
}

export async function fetchAnalyticsData(targetMonth: string = "all"): Promise<AnalyticsDashboardData> {
  await requireProfile();
  const supabase = createAdminClient();

  // 1. Fetch sales from sc_sales — only needed columns, with date range limit
  // "all" mode: rolling 13-month window (12 months history + current month)
  // Specific month: filter exact month range only
  const NEEDED_COLS = "id, date, size_s, size_m, size_l, size_xl, cash_amount, transfer_amount, discount, grand_total, total_revenue, recorded_by, extra_items";

  let salesQuery = (supabase.from("sc_sales" as any) as any)
    .select(NEEDED_COLS)
    .order("date", { ascending: false });

  if (targetMonth !== "all") {
    // Specific month: e.g. "2026-08" → filter 2026-08-01 to 2026-08-31
    const [yr, mo] = targetMonth.split("-").map(Number);
    const monthStart = `${targetMonth}-01`;
    const lastDay = new Date(yr, mo, 0).getDate();
    const monthEnd = `${targetMonth}-${String(lastDay).padStart(2, "0")}`;
    salesQuery = salesQuery.gte("date", monthStart).lte("date", monthEnd);
  } else {
    // "all" mode: last 13 months to avoid unbounded scans
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);
    cutoff.setDate(1);
    salesQuery = salesQuery.gte("date", cutoff.toISOString().slice(0, 10));
  }

  const { data: salesRows } = await salesQuery;


  // 2. Fetch inventory items and stock
  const [itemsRes, stockRes] = await Promise.all([
    supabase.from("items").select("id, name, category, base_unit"),
    supabase.from("item_stock").select("item_id, current_qty, min_stock, unit_cost"),
  ]);

  const stockMap: Record<string, { currentQty: number; minStock: number; unitCost: number }> = {};
  (stockRes.data || []).forEach((st: any) => {
    stockMap[st.item_id] = {
      currentQty: Number(st.current_qty || 0),
      minStock: Number(st.min_stock || 0),
      unitCost: Number(st.unit_cost || 0),
    };
  });

  const inventoryItems: InventoryItemSummary[] = (itemsRes.data || []).map((it: any) => {
    const st = stockMap[it.id] || { currentQty: 0, minStock: 0, unitCost: 0 };
    const currentQty = st.currentQty;
    const minStock = st.minStock;
    const unitCost = st.unitCost;
    let status: "NORMAL" | "LOW_STOCK" | "OUT_OF_STOCK" = "NORMAL";
    if (currentQty <= 0) {
      status = "OUT_OF_STOCK";
    } else if (currentQty <= minStock) {
      status = "LOW_STOCK";
    }

    return {
      id: it.id,
      name: it.name,
      category: it.category || "ทั่วไป",
      baseUnit: it.base_unit || "ชิ้น",
      currentQty,
      minStock,
      unitCost,
      totalValuation: currentQty * unitCost,
      status,
    };
  });

  const lowStockCount = inventoryItems.filter((i) => i.status !== "NORMAL").length;
  const totalStockValuation = inventoryItems.reduce((sum, i) => sum + i.totalValuation, 0);

  // Group sales by month
  const monthlyGroups: Record<string, DailySaleRecord[]> = {};

  (salesRows || []).forEach((row: any) => {
    const dateStr = row.date; // YYYY-MM-DD
    const monthKey = dateStr.slice(0, 7); // YYYY-MM
    const sizeS = Number(row.size_s || 0);
    const sizeM = Number(row.size_m || 0);
    const sizeL = Number(row.size_l || 0);
    const sizeXL = Number(row.size_xl || 0);
    const totalShoes = sizeS + sizeM + sizeL + sizeXL;

    const record: DailySaleRecord = {
      id: row.id,
      date: dateStr,
      totalRevenue: Number(row.total_revenue || row.grand_total || 0),
      cashAmount: Number(row.cash_amount || 0),
      transferAmount: Number(row.transfer_amount || 0),
      discount: Number(row.discount || 0),
      grandTotal: Number(row.grand_total || 0),
      sizeS,
      sizeM,
      sizeL,
      sizeXL,
      totalShoes,
      recordedBy: row.recorded_by || "-",
      extraItems: row.extra_items || "",
    };

    if (!monthlyGroups[monthKey]) {
      monthlyGroups[monthKey] = [];
    }
    monthlyGroups[monthKey].push(record);
  });

  const monthlyTrends: MonthlySummary[] = Object.keys(monthlyGroups)
    .sort((a, b) => b.localeCompare(a))
    .map((monthKey) => {
      const records = monthlyGroups[monthKey];
      const revenue = records.reduce((sum, r) => sum + r.grandTotal, 0);
      const cashAmount = records.reduce((sum, r) => sum + r.cashAmount, 0);
      const transferAmount = records.reduce((sum, r) => sum + r.transferAmount, 0);
      const discount = records.reduce((sum, r) => sum + r.discount, 0);
      const sizeS = records.reduce((sum, r) => sum + r.sizeS, 0);
      const sizeM = records.reduce((sum, r) => sum + r.sizeM, 0);
      const sizeL = records.reduce((sum, r) => sum + r.sizeL, 0);
      const sizeXL = records.reduce((sum, r) => sum + r.sizeXL, 0);
      const totalShoes = sizeS + sizeM + sizeL + sizeXL;

      return {
        month: monthKey,
        label: formatMonthLabel(monthKey),
        revenue,
        cashAmount,
        transferAmount,
        discount,
        daysCount: records.length,
        totalShoes,
        sizeS,
        sizeM,
        sizeL,
        sizeXL,
      };
    });

  const monthsList = [
    {
      value: "all",
      label: "📊 ดูข้อมูลสะสมทั้งหมด (All Time)",
      totalRevenue: (salesRows || []).reduce((s: number, r: any) => s + Number(r.grand_total || 0), 0),
    },
    ...monthlyTrends.map((m) => ({
      value: m.month,
      label: m.label,
      totalRevenue: m.revenue,
    })),
  ];

  // Filter records based on targetMonth
  let filteredRecords: DailySaleRecord[] = [];
  if (targetMonth === "all" || !monthlyGroups[targetMonth]) {
    filteredRecords = Object.values(monthlyGroups).flat().sort((a, b) => b.date.localeCompare(a.date));
  } else {
    filteredRecords = monthlyGroups[targetMonth].sort((a, b) => b.date.localeCompare(a.date));
  }

  const totalRevenue = filteredRecords.reduce((sum, r) => sum + r.grandTotal, 0);
  const totalCash = filteredRecords.reduce((sum, r) => sum + r.cashAmount, 0);
  const totalTransfer = filteredRecords.reduce((sum, r) => sum + r.transferAmount, 0);
  const totalDiscount = filteredRecords.reduce((sum, r) => sum + r.discount, 0);
  const sizeS = filteredRecords.reduce((sum, r) => sum + r.sizeS, 0);
  const sizeM = filteredRecords.reduce((sum, r) => sum + r.sizeM, 0);
  const sizeL = filteredRecords.reduce((sum, r) => sum + r.sizeL, 0);
  const sizeXL = filteredRecords.reduce((sum, r) => sum + r.sizeXL, 0);
  const totalShoes = sizeS + sizeM + sizeL + sizeXL;
  const totalDays = filteredRecords.length;
  const dailyAvgRevenue = totalDays > 0 ? totalRevenue / totalDays : 0;
  const avgPerShoe = totalShoes > 0 ? totalRevenue / totalShoes : 0;

  return {
    selectedMonth: targetMonth,
    monthsList,
    summary: {
      totalRevenue,
      totalCash,
      totalTransfer,
      totalDiscount,
      totalShoes,
      totalDays,
      dailyAvgRevenue,
      avgPerShoe,
      sizeS,
      sizeM,
      sizeL,
      sizeXL,
    },
    monthlyTrends,
    dailyRecords: filteredRecords,
    inventory: {
      items: inventoryItems,
      totalItemsCount: inventoryItems.length,
      lowStockCount,
      totalStockValuation,
    },
  };
}
