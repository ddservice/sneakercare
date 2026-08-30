import { requireProfile } from "@/lib/auth";
import {
  fetchPendingDeliveryOrders,
  fetchCatalogItems,
  fetchSmartAccDocuments,
} from "@/app/actions/smartacc-documents";
import { fetchShopProfile } from "@/app/actions/shop-settings";
import { InvoicingClient } from "./invoicing-client";

export default async function InvoicingPage() {
  await requireProfile();
  const [pendingDOs, catalog, existingDocs, shopProfile] = await Promise.all([
    fetchPendingDeliveryOrders(),
    fetchCatalogItems(),
    fetchSmartAccDocuments(),
    fetchShopProfile(),
  ]);

  return (
    <InvoicingClient
      pendingDOs={pendingDOs as any}
      catalog={catalog}
      existingDocs={existingDocs as any}
      shopProfile={shopProfile}
    />
  );
}

