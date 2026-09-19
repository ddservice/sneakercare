import { createAdminClient } from "@/lib/supabase/admin";
import {
  PURCHASE_VAT_KEY,
  parsePurchaseVatLines,
  serializePurchaseVatLines,
  type PurchaseVatLine,
} from "@/lib/purchase-vat";

export async function readPurchaseVatLinesState(tenantId: string): Promise<{
  raw: string | null;
  lines: PurchaseVatLine[];
}> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("sc_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", PURCHASE_VAT_KEY)
    .maybeSingle();
  const raw = data?.value ?? null;
  return { raw, lines: parsePurchaseVatLines(raw) };
}

export async function readPurchaseVatLines(tenantId: string): Promise<PurchaseVatLine[]> {
  return (await readPurchaseVatLinesState(tenantId)).lines;
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

export async function writePurchaseVatLinesCas(
  tenantId: string,
  expectedRaw: string | null,
  lines: readonly PurchaseVatLine[]
): Promise<{ ok: true } | { ok: false; kind: "conflict" | "error"; error: string }> {
  const supabase = createAdminClient();
  const nextRaw = serializePurchaseVatLines(lines);
  const stamp = new Date().toISOString();
  if (expectedRaw == null) {
    const { error } = await supabase.from("sc_settings").insert({
      key: PURCHASE_VAT_KEY,
      value: nextRaw,
      tenant_id: tenantId,
      updated_at: stamp,
    });
    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          kind: "conflict",
          error: "มีคนบันทึกสมุดซื้อก่อนหน้า — โหลดใหม่แล้วใช้คีย์เดิม ห้ามสร้างรายการใหม่",
        };
      }
      return { ok: false, kind: "error", error: error.message };
    }
    return { ok: true };
  }
  const { data, error } = await supabase
    .from("sc_settings")
    .update({ value: nextRaw, updated_at: stamp })
    .eq("tenant_id", tenantId)
    .eq("key", PURCHASE_VAT_KEY)
    .eq("value", expectedRaw)
    .select("key");
  if (error) return { ok: false, kind: "error", error: error.message };
  if (!data?.length) {
    return {
      ok: false,
      kind: "conflict",
      error: "มีคนบันทึกสมุดซื้อก่อนหน้า — โหลดใหม่แล้วใช้คีย์เดิม ห้ามสร้างรายการใหม่",
    };
  }
  return { ok: true };
}
