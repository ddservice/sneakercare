import { requireProfile, requireModuleView } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const profile = await requireProfile();
  requireModuleView(profile, "dashboard");
  const supabase = await createClient();

  // Fetch real sales, opex, payments, orders, items, and low-stock items
  const [
    { data: salesRows },
    { data: opexRows },
    { data: paymentsRows },
    { data: orders },
    { data: stockItems },
    { data: lowStock },
    { data: expenseEntries },
  ] = await Promise.all([
    supabase.from("sc_sales").select("*").order("date", { ascending: false }),
    supabase.from("sc_opex").select("*").order("month", { ascending: false }),
    supabase.from("sc_payments").select("*").order("sale_date", { ascending: false }),
    supabase.from("service_orders").select("*").order("received_at", { ascending: false }),
    supabase.from("items").select("id, name, item_stock(*)").order("name"),
    supabase.from("v_low_stock").select("*"),
    // ขั้นที่ 4 ของ docs/sc-opex-refactor-plan.md — ฝั่ง OPEX อ่านจากตารางใหม่
    // (เงินเดือน/ห้องเช่ายังมาจาก sc_opex จนกว่าจะถึงขั้นที่ 5)
    supabase.from("sc_expense_entries").select("id, entry_date, amount, category, title, pay_method, legacy_ref"),
  ]);

  return (
    <DashboardClient
      salesRows={salesRows || []}
      opexRows={opexRows || []}
      paymentsRows={paymentsRows || []}
      orders={orders || []}
      stockItems={stockItems || []}
      lowStock={lowStock || []}
      expenseEntries={expenseEntries || []}
    />
  );
}
