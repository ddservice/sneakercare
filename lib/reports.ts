import "server-only";
import { createClient } from "@/lib/supabase/server";
import { boundsFor, type MonthRange } from "@/lib/reports-range";

export {
  DEFAULT_MONTHS_BACK,
  formatMonthLabel,
  resolveMonthRange,
  toCsv,
  type MonthRange,
} from "@/lib/reports-range";

export type MonthlyCogsRow = {
  branch_id: string;
  month: string;
  cogs: number | null;
};

export async function fetchMonthlyCogs(range: MonthRange, branchId: string | null) {
  const supabase = await createClient();
  const { gte, lt } = boundsFor(range);

  let query = supabase
    .from("stock_transactions")
    .select("created_at, total_cost, branch_id, txn_type")
    .gte("created_at", gte)
    .lt("created_at", lt)
    .order("created_at", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);

  const { data: txns, error } = await query;

  if (error) {
    return { rows: [] as MonthlyCogsRow[], error };
  }

  // Aggregate monthly COGS
  const monthlyMap: Record<string, number> = {};
  const defaultBranchId = branchId || "cb8dcf5d-7e5e-4671-be42-aca79469a19b";

  for (const t of txns || []) {
    const monthKey = t.created_at.slice(0, 7) + "-01";
    const cost = Math.abs(Number(t.total_cost || 0));
    monthlyMap[monthKey] = (monthlyMap[monthKey] || 0) + cost;
  }

  const rows: MonthlyCogsRow[] = Object.keys(monthlyMap)
    .sort((a, b) => b.localeCompare(a))
    .map((month) => ({
      branch_id: defaultBranchId,
      month,
      cogs: monthlyMap[month],
    }));

  return { rows, error: null };
}
