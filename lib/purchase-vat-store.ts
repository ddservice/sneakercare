import { createAdminClient } from "@/lib/supabase/admin";
import {
  PURCHASE_VAT_KEY,
  parsePurchaseVatLines,
  serializePurchaseVatLines,
  type PurchaseVatLine,
} from "@/lib/purchase-vat";

export async function readPurchaseVatLines(tenantId: string): Promise<PurchaseVatLine[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("sc_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", PURCHASE_VAT_KEY)
    .maybeSingle();
  return parsePurchaseVatLines(data?.value);
}

export async function writePurchaseVatLines(
  tenantId: string,
  lines: readonly PurchaseVatLine[]
): Promise<string | null> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("sc_settings").upsert(
    {
      key: PURCHASE_VAT_KEY,
      value: serializePurchaseVatLines(lines),
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,key" }
  );
  return error?.message ?? null;
}
