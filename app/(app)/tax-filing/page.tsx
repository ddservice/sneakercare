import { requireProfile } from "@/lib/auth";
import { TaxFilingClient } from "./tax-filing-client";

export default async function TaxFilingPage() {
  await requireProfile();

  return <TaxFilingClient />;
}
