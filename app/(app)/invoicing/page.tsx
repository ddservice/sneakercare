import { requireProfile } from "@/lib/auth";
import { fetchPendingDeliveryOrders } from "@/app/actions/smartacc-documents";
import { InvoicingClient } from "./invoicing-client";

export default async function InvoicingPage() {
  await requireProfile();
  const pendingDOs = await fetchPendingDeliveryOrders();

  return <InvoicingClient pendingDOs={pendingDOs as any} />;
}
