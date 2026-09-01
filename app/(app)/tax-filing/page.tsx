import { requireProfile } from "@/lib/auth";
import { fetchTaxFilingData } from "@/app/actions/smartacc-documents";
import { fetchShopProfile } from "@/app/actions/shop-settings";
import { TaxFilingClient } from "./tax-filing-client";

export default async function TaxFilingPage() {
  await requireProfile();
  const [data, shopProfile] = await Promise.all([fetchTaxFilingData(), fetchShopProfile()]);

  return (
    <TaxFilingClient
      initialSalesDocs={data.salesDocs as any}
      initialExpenses={data.expenses as any}
      shopProfile={shopProfile}
    />
  );
}
