import { requireProfile, requireModuleView } from "@/lib/auth";
import {
  fetchPendingDeliveryOrders,
  fetchCatalogItems,
  fetchSmartAccDocuments,
} from "@/app/actions/smartacc-documents";
import { fetchShopProfile } from "@/app/actions/shop-settings";
import { InvoicingClient } from "./invoicing-client";

export default async function InvoicingPage() {
  const profile = await requireProfile();
  // ออกใบกำกับภาษี/ใบเสร็จในนามนิติบุคคล
  requireModuleView(profile, "invoicing");
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

