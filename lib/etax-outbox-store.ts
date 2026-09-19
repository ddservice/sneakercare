import { createAdminClient } from "@/lib/supabase/admin";
import type { ETaxOutboxItem } from "@/lib/etax-pipeline";

export const ETAX_OUTBOX_KEY = "etax_outbox";
const MAX_ITEMS = 50;

export function parseETaxOutbox(raw: string | null | undefined): ETaxOutboxItem[] {
  if (!raw || !String(raw).trim()) return [];
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => row && typeof row === "object") as ETaxOutboxItem[];
  } catch {
    return [];
  }
}

export async function readETaxOutbox(tenantId: string): Promise<ETaxOutboxItem[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("sc_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", ETAX_OUTBOX_KEY)
    .maybeSingle();
  return parseETaxOutbox(data?.value);
}

export async function writeETaxOutbox(
  tenantId: string,
  rows: readonly ETaxOutboxItem[]
): Promise<string | null> {
  const supabase = createAdminClient();
  const trimmed = rows.slice(-MAX_ITEMS);
  const { error } = await supabase.from("sc_settings").upsert(
    {
      key: ETAX_OUTBOX_KEY,
      value: JSON.stringify(trimmed),
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,key" }
  );
  return error?.message ?? null;
}

export function upsertOutboxItem(
  current: readonly ETaxOutboxItem[],
  next: ETaxOutboxItem
): ETaxOutboxItem[] {
  return [...current.filter((row) => row.id !== next.id), next].slice(-MAX_ITEMS);
}
