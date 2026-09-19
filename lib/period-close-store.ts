import { createAdminClient } from "@/lib/supabase/admin";
import {
  CLOSED_PERIODS_KEY,
  canEditPeriod,
  closedPeriodMessage,
  isPeriodYm,
  parseClosedPeriods,
  periodYmFromDate,
  serializeClosedPeriods,
} from "@/lib/period-close";

export async function readClosedPeriods(tenantId: string): Promise<string[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("sc_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", CLOSED_PERIODS_KEY)
    .maybeSingle();
  return parseClosedPeriods(data?.value);
}

export async function writeClosedPeriods(tenantId: string, closed: readonly string[]): Promise<string | null> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("sc_settings").upsert(
    {
      key: CLOSED_PERIODS_KEY,
      value: serializeClosedPeriods(closed),
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,key" }
  );
  return error?.message ?? null;
}

export async function assertPeriodOpen(
  tenantId: string,
  dateValue: string | null | undefined
): Promise<string | null> {
  const ym = periodYmFromDate(dateValue);
  if (!ym || !isPeriodYm(ym)) return "ระบุวันที่ของงวดไม่ถูกต้อง";
  const closed = await readClosedPeriods(tenantId);
  if (!canEditPeriod(ym, closed)) return closedPeriodMessage(ym);
  return null;
}
