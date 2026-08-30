import { requireProfile } from "@/lib/auth";
import { fetchStagedExpenses } from "@/app/actions/smartacc-expenses";
import { ExpensesOcrClient } from "./expenses-ocr-client";

export default async function ExpensesOcrPage() {
  await requireProfile();
  const expenses = await fetchStagedExpenses();

  return <ExpensesOcrClient initialExpenses={expenses as any} />;
}
