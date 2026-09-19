import { requireProfile, requireModuleView } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { tenantFilter } from "@/lib/tenant";
import { countLowStockAlerts } from "@/lib/low-stock-count";
import { dashboardLookbackOpexMonths, dashboardLookbackStart } from "@/lib/dashboard-books";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

function todayYmdBangkok(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

export default async function DashboardPage() {
  const profile = await requireProfile();
  requireModuleView(profile, "dashboard");
  const supabase = await createClient();

  // super_admin ที่เลือกสาขาไว้ → กรอง tenant ของสาขานั้น (tenantFilter จำค่าต่อ request)
  // role อื่น RLS กรองให้อยู่แล้ว ไม่ต้อง .eq ซ้ำ
  const selectedBranchId = await getSelectedBranchId(profile);
  const tenantId = profile.role === "super_admin" ? await tenantFilter(profile) : null;
  const lookbackStart = dashboardLookbackStart(todayYmdBangkok());
  const opexMonths = dashboardLookbackOpexMonths(todayYmdBangkok());

  let salesQuery = supabase
    .from("sc_sales")
    .select("*")
    .gte("date", lookbackStart)
    .order("date", { ascending: false });
  let opexQuery = supabase
    .from("sc_opex")
    .select("*")
    .in("month", opexMonths)
    .order("month", { ascending: false });
  let paymentsQuery = supabase
    .from("sc_payments")
    .select("*")
    .or(`received_date.gte.${lookbackStart},sale_date.gte.${lookbackStart}`)
    .order("sale_date", { ascending: false });
  let expenseEntriesQuery = supabase
    .from("sc_expense_entries")
    .select("id, entry_date, amount, category, title, pay_method, legacy_ref")
    .gte("entry_date", lookbackStart);
  let itemsCountQuery = supabase.from("items").select("id", { count: "exact", head: true });

  if (tenantId) {
    salesQuery = salesQuery.eq("tenant_id", tenantId);
    opexQuery = opexQuery.eq("tenant_id", tenantId);
    paymentsQuery = paymentsQuery.eq("tenant_id", tenantId);
    expenseEntriesQuery = expenseEntriesQuery.eq("tenant_id", tenantId);
    itemsCountQuery = itemsCountQuery.eq("tenant_id", tenantId);
  }

  const [
    { data: salesRows },
    { data: opexRows },
    { data: paymentsRows },
    { data: expenseEntries },
    { count: catalogCount },
    lowStockCount,
  ] = await Promise.all([
    salesQuery,
    opexQuery,
    paymentsQuery,
    expenseEntriesQuery,
    itemsCountQuery,
    countLowStockAlerts(profile, selectedBranchId).catch(() => 0),
  ]);

  return (
    <DashboardClient
      salesRows={salesRows || []}
      opexRows={opexRows || []}
      paymentsRows={paymentsRows || []}
      catalogCount={catalogCount ?? 0}
      lowStockCount={lowStockCount}
      expenseEntries={expenseEntries || []}
      lookbackStart={lookbackStart}
    />
  );
}
