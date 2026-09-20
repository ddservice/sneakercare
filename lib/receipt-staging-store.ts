import { createAdminClient } from "@/lib/supabase/admin";
import type { StagedReceipt } from "@/lib/receipt-staging";
import { applyLedgerToQueue } from "@/lib/receipt-ledger";
import { readReceiptLedger } from "@/lib/receipt-ledger-store";

export const RECEIPT_STAGING_KEY = "receipt_staging";

export function parseStagedReceipts(raw: string | null | undefined): StagedReceipt[] {
  if (!raw || !String(raw).trim()) return [];
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => row && typeof row === "object") as StagedReceipt[];
  } catch {
    return [];
  }
}

export async function readStagedReceiptsState(tenantId: string): Promise<{
  raw: string | null;
  receipts: StagedReceipt[];
}> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("sc_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", RECEIPT_STAGING_KEY)
    .maybeSingle();
  const raw = data?.value ?? null;
  return { raw, receipts: parseStagedReceipts(raw) };
}

export async function readStagedReceipts(tenantId: string): Promise<StagedReceipt[]> {
  const { receipts } = await readStagedReceiptsState(tenantId);
  const ledger = await readReceiptLedger(tenantId);
  return applyLedgerToQueue(receipts, ledger);
}

export async function writeStagedReceipts(
  tenantId: string,
  rows: readonly StagedReceipt[]
): Promise<string | null> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("sc_settings").upsert(
    {
      key: RECEIPT_STAGING_KEY,
      value: JSON.stringify(rows),
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,key" }
  );
  return error?.message ?? null;
}

export async function writeStagedReceiptsCas(
  tenantId: string,
  expectedRaw: string | null,
  rows: readonly StagedReceipt[]
): Promise<{ ok: true } | { ok: false; kind: "conflict" | "error"; error: string }> {
  const supabase = createAdminClient();
  const nextRaw = JSON.stringify(rows);
  const stamp = new Date().toISOString();
  if (expectedRaw == null) {
    const { error } = await supabase.from("sc_settings").insert({
      key: RECEIPT_STAGING_KEY,
      value: nextRaw,
      tenant_id: tenantId,
      updated_at: stamp,
    });
    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          kind: "conflict",
          error: "มีคนบันทึกคิวก่อนหน้า — โหลดใหม่แล้วใช้คีย์เดิม ห้ามสร้างรายการใหม่",
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
    .eq("key", RECEIPT_STAGING_KEY)
    .eq("value", expectedRaw)
    .select("key");
  if (error) return { ok: false, kind: "error", error: error.message };
  if (!data?.length) {
    return {
      ok: false,
      kind: "conflict",
      error: "มีคนบันทึกคิวก่อนหน้า — โหลดใหม่แล้วใช้คีย์เดิม ห้ามสร้างรายการใหม่",
    };
  }
  return { ok: true };
}

export function upsertStagedReceipt(
  current: readonly StagedReceipt[],
  next: StagedReceipt
): StagedReceipt[] {
  return [...current.filter((row) => row.id !== next.id), next];
}
