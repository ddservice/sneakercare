import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireProfile();
  const supabase = await createClient();

  // Fetch real sales, opex, expenses, orders, items, and low-stock items
  const [
    { data: salesRows },
    { data: opexRows },
    { data: expensesRows },
    { data: orders },
    { data: stockItems },
    { data: lowStock },
  ] = await Promise.all([
    (supabase.from("sc_sales" as any) as any).select("*").order("date", { ascending: false }),
    (supabase.from("sc_opex" as any) as any).select("*").order("month", { ascending: false }),
    (supabase.from("sc_expenses" as any) as any).select("*").order("date", { ascending: false }),
    supabase.from("service_orders").select("*").order("received_at", { ascending: false }),
    supabase.from("items").select("id, name, item_stock(*)").order("name"),
    supabase.from("v_low_stock").select("*"),
  ]);

  return (
    <DashboardClient
      salesRows={salesRows || []}
      opexRows={opexRows || []}
      expensesRows={expensesRows || []}
      orders={orders || []}
      stockItems={stockItems || []}
      lowStock={lowStock || []}
    />
  );
}
