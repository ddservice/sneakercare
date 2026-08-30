import { requireProfile } from "@/lib/auth";
import {
  fetchPendingDeliveryOrders,
  fetchCatalogItems,
  fetchSmartAccDocuments,
} from "@/app/actions/smartacc-documents";
import { InvoicingClient } from "./invoicing-client";

export default async function InvoicingPage() {
  await requireProfile();
  const [pendingDOs, catalog, existingDocs] = await Promise.all([
    fetchPendingDeliveryOrders(),
    fetchCatalogItems(),
    fetchSmartAccDocuments(),
  ]);

  return (
    <InvoicingClient
      pendingDOs={pendingDOs as any}
      catalog={catalog}
      existingDocs={existingDocs as any}
    />
  );
}
