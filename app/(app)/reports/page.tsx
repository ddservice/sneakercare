import { requireProfile, requireModuleView } from "@/lib/auth";
import { getSelectedBranchId } from "@/lib/branch";
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

  const [
    { rows: cogsRows },
    { data: salesRows },
    { data: stockRows },
    { data: expensesRows },
  ] = await Promise.all([
    fetchMonthlyCogs(range, branchId),
    (supabase.from("sc_sales" as any) as any).select("*").order("date", { ascending: false }),
    supabase.from("items").select("*, item_stock(*)").order("name"),
    (supabase.from("sc_expenses" as any) as any).select("*").order("date", { ascending: false }),
  ]);

  const totalCogs = cogsRows.reduce((sum, row) => sum + Number(row.cogs ?? 0), 0);

  const flatStock = (stockRows || []).map((item: any) => {
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
