import { requireProfile, requireModuleView } from "@/lib/auth";
import { canWrite } from "@/lib/permissions";
import { fetchTaxFilingData } from "@/app/actions/smartacc-documents";
import { fetchShopProfile } from "@/app/actions/shop-settings";
import { fetchClosedPeriods } from "@/app/actions/period-close";
import { fetchPurchaseVatLines } from "@/app/actions/purchase-vat";
import { TaxFilingClient } from "./tax-filing-client";

export default async function TaxFilingPage() {
  const profile = await requireProfile();
  // หนังสือรับรองหัก ณ ที่จ่าย + e-Tax XML — admin เท่านั้น
  requireModuleView(profile, "tax-filing");
  const [data, shopProfile, closedPeriods, purchaseVatLines] = await Promise.all([
    fetchTaxFilingData(),
    fetchShopProfile(),
    fetchClosedPeriods(),
    fetchPurchaseVatLines(),
  ]);

  return (
    <TaxFilingClient
      initialSalesDocs={data.salesDocs}
      initialExpenses={data.expenses}
      initialWht={data.whtCertificates}
      initialBooksSales={data.booksSales}
      initialBooksPayments={data.booksPayments}
      initialCorrectionDocs={data.correctionDocs}
      initialClosedPeriods={closedPeriods}
      initialPurchaseVatLines={purchaseVatLines}
      canClosePeriod={canWrite(profile.role, "tax-filing")}
      shopProfile={shopProfile}
    />
  );
}
