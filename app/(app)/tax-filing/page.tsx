import { requireProfile } from "@/lib/auth";
import { fetchTaxFilingData } from "@/app/actions/smartacc-documents";
import { TaxFilingClient } from "./tax-filing-client";

export default async function TaxFilingPage() {
  await requireProfile();
  const data = await fetchTaxFilingData();

  return (
    <TaxFilingClient
      initialSalesDocs={data.salesDocs as any}
      initialExpenses={data.expenses as any}
    />
  );
}
