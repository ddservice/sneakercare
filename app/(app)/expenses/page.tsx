import { requireProfile } from "@/lib/auth";
import { fetchAllExpensesData } from "@/app/actions/expenses";
import { ExpensesClient } from "./expenses-client";

export default async function ExpensesPage() {
  await requireProfile();
  const expensesData = await fetchAllExpensesData("this_month");

  return <ExpensesClient initialData={expensesData} />;
}
