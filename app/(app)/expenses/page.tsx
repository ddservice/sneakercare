import { requireProfile, requireModuleView } from "@/lib/auth";
import { fetchAllExpensesData } from "@/app/actions/expenses";
import { fetchShopProfile } from "@/app/actions/shop-settings";
import { ExpensesClient } from "./expenses-client";

export default async function ExpensesPage() {
  const profile = await requireProfile();
  // เงินเดือนพนักงานทุกคนและค่าใช้จ่ายร้านทั้งหมดอยู่ในหน้านี้
  requireModuleView(profile, "expenses");
  const [expensesData, shopProfile] = await Promise.all([
    fetchAllExpensesData("this_month"),
    fetchShopProfile(),
  ]);

  return <ExpensesClient initialData={expensesData} shopProfile={shopProfile} />;
}
