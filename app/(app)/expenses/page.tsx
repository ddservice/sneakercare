import { requireProfile } from "@/lib/auth";
import { fetchAllExpensesData } from "@/app/actions/expenses";
import { fetchShopProfile } from "@/app/actions/shop-settings";
import { ExpensesClient } from "./expenses-client";

export default async function ExpensesPage() {
  await requireProfile();
  const [expensesData, shopProfile] = await Promise.all([
    fetchAllExpensesData("this_month"),
    fetchShopProfile(),
  ]);

  return <ExpensesClient initialData={expensesData} shopProfile={shopProfile} />;
}
