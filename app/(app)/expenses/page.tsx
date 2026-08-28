import { requireProfile } from "@/lib/auth";
import { getSelectedBranchId } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";
import { ExpensesClient, type ExpenseItem } from "./expenses-client";

export default async function ExpensesPage() {
  const profile = await requireProfile();
  const selectedBranchId = await getSelectedBranchId(profile);
  const supabase = await createClient();

  let query = supabase
    .from("expenses")
    .select("*")
    .order("expense_date", { ascending: false });

  if (selectedBranchId) {
    query = query.eq("branch_id", selectedBranchId);
  }

  const { data: expenses } = await query;

  const formattedExpenses: ExpenseItem[] =
    expenses && expenses.length > 0
      ? expenses.map((e) => ({
          id: e.id,
          category: e.category,
          title: e.title,
          amount: Number(e.amount ?? 0),
          expense_date: e.expense_date,
          note: e.note,
        }))
      : [];

  return <ExpensesClient initialExpenses={formattedExpenses} />;
}
