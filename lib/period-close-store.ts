import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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
  const { data, error } = await supabase
    .from("sc_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", CLOSED_PERIODS_KEY)
    .maybeSingle();
  if (error) throw new Error('อ่านสถานะปิดงวดไม่สำเร็จ จึงยังทำรายการเงินไม่ได้');
  if (data) {
    let parsed: unknown;
    try { parsed = JSON.parse(data.value ?? 'null'); } catch { throw new Error('ข้อมูลปิดงวดเสียหาย กรุณาติดต่อผู้ดูแล'); }
    if (!Array.isArray(parsed) || !parsed.every(p => typeof p === 'string' && isPeriodYm(p))) throw new Error('ข้อมูลปิดงวดไม่ถูกต้อง กรุณาติดต่อผู้ดูแล');
  }
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

export async function setPeriodState(tenantId: string, period: string, closed: boolean): Promise<{ closed: string[]; error?: never } | { error: string; closed?: never }> {
  const db = await createClient();
  const rpc = db.rpc.bind(db) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  const result = await rpc('rrs_set_period', { p_tenant: tenantId, p_period: period, p_closed: closed });
  if (result.error) return { error: result.error.message };
  if (!Array.isArray(result.data) || !result.data.every(p => typeof p === 'string' && isPeriodYm(p))) return { error: 'ระบบไม่คืนสถานะปิดงวดที่ถูกต้อง' };
  return { closed: result.data as string[] };
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
