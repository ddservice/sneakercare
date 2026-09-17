import { requireProfile, requireModuleView } from "@/lib/auth";
import { getSelectedBranchId } from "@/lib/branch";
import { tenantFilter } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { fetchMonthlyCogs, resolveMonthRange } from "@/lib/reports";
import { ReportsClient } from "./reports-client";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const profile = await requireProfile();
  requireModuleView(profile, "reports");
  const branchId = await getSelectedBranchId(profile);
  const supabase = await createClient();

  const { from: fromRaw, to: toRaw } = await searchParams;
  const range = resolveMonthRange(fromRaw, toRaw);

  // ⚠️ [แก้บั๊กจริง 2026-09-17] เดิมสาม query นี้ไม่กรอง tenant เองเลย พึ่ง RLS อย่างเดียว —
  // RLS ปกป้อง admin ทั่วไปได้ถูกต้อง (เห็นแค่ tenant ตัวเองเสมอ) แต่ super_admin RLS อนุญาตให้
  // เห็นทุก tenant เสมอไม่สนใจสาขาที่เลือกไว้ ⇒ เลือกสาขาของ LUXSU แล้วหน้านี้ยังโชว์ยอดขาย/
  // แคตตาล็อก/ค่าใช้จ่ายของ tenant #1 ปนอยู่ดี (พิสูจน์จริง: LUXSU มียอดขาย 0 แถว แต่หน้านี้
  // เคยโชว์ "306 รายการ" ซึ่งเป็นของ tenant #1 ทั้งหมด) เพิ่มกรองด้วย tenantId ที่ resolve จาก
  // สาขาที่เลือกไว้แล้ว (เฉพาะ super_admin — admin ปกติค่าเท่าเดิมกับที่ RLS กรองอยู่แล้ว)
  const tenantId = await tenantFilter(profile);

  let salesQuery = supabase.from("sc_sales").select("*").order("date", { ascending: false });
  let itemsQuery = supabase.from("items").select("*, item_stock(*)").order("name");
  let expensesQuery = supabase.from("sc_expenses").select("*").order("date", { ascending: false });
  if (tenantId) {
    salesQuery = salesQuery.eq("tenant_id", tenantId);
    itemsQuery = itemsQuery.eq("tenant_id", tenantId);
    expensesQuery = expensesQuery.eq("tenant_id", tenantId);
  }

  const [
    { rows: cogsRows },
    { data: salesRows },
    { data: stockRows },
    { data: expensesRows },
  ] = await Promise.all([
    fetchMonthlyCogs(range, branchId),
    salesQuery,
    itemsQuery,
    expensesQuery,
  ]);

  const totalCogs = cogsRows.reduce((sum, row) => sum + Number(row.cogs ?? 0), 0);

  const flatStock = (stockRows || []).map((item) => {
    const stockRow = Array.isArray(item.item_stock) ? item.item_stock[0] : item.item_stock;
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      base_unit: item.base_unit,
      current_qty: Number(stockRow?.current_qty ?? 0),
      min_stock_level: Number(stockRow?.min_stock_level ?? item.default_min_stock_level ?? 1),
      avg_unit_cost: Number(stockRow?.avg_unit_cost ?? 0),
    };
  });

  return (
    <ReportsClient
      salesData={salesRows || []}
      stockData={flatStock}
      expensesData={expensesRows || []}
      cogsData={{
        rows: cogsRows,
        total: totalCogs,
        range,
      }}
    />
  );
}
