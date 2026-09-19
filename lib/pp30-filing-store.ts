import { createAdminClient } from "@/lib/supabase/admin";
import type { Pp30FilingRecord } from "@/lib/pp30-filing";

export const PP30_FILINGS_KEY = "pp30_filings";

export function parsePp30Filings(raw: string | null | undefined): Pp30FilingRecord[] {
  if (!raw || !String(raw).trim()) return [];
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => row && typeof row === "object") as Pp30FilingRecord[];
  } catch {
    return [];
  }
}

export async function readPp30Filings(tenantId: string): Promise<Pp30FilingRecord[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("sc_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", PP30_FILINGS_KEY)
    .maybeSingle();
  return parsePp30Filings(data?.value);
}

export async function writePp30Filings(
  tenantId: string,
  rows: readonly Pp30FilingRecord[]
): Promise<string | null> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("sc_settings").upsert(
    {
      key: PP30_FILINGS_KEY,
      value: JSON.stringify(rows),
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,key" }
  );
  return error?.message ?? null;
}

export function upsertFiling(
  current: readonly Pp30FilingRecord[],
  next: Pp30FilingRecord
): Pp30FilingRecord[] {
  return [...current.filter((row) => row.periodYm !== next.periodYm), next];
}
