/** ปิดงวดบัญชีร้าน — ค่าเริ่มต้นไม่ปิดงวดใด · ปิดแล้วห้ามแก้ sc_sales / sc_payments / sc_opex */

export const CLOSED_PERIODS_KEY = "closed_periods";

export function isPeriodYm(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value));
}

export function periodYmFromDate(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (isPeriodYm(raw.slice(0, 7))) return raw.slice(0, 7);
  const slash = raw.match(/^(\d{2})\/(\d{4})$/);
  if (slash) return `${slash[2]}-${slash[1]}`;
  return null;
}

export function parseClosedPeriods(raw: string | null | undefined): string[] {
  if (!raw || !String(raw).trim()) return [];
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((item) => String(item)).filter(isPeriodYm))].sort();
  } catch {
    return [];
  }
}

export function isPeriodClosed(periodYm: string, closed: readonly string[]): boolean {
  return isPeriodYm(periodYm) && closed.includes(periodYm);
}

export function canEditPeriod(periodYm: string, closed: readonly string[]): boolean {
  const ym = periodYmFromDate(periodYm) ?? periodYm;
  if (!isPeriodYm(ym)) return false;
  return !isPeriodClosed(ym, closed);
}

export function closedPeriodMessage(periodYm: string): string {
  return `งวด ${periodYm} ปิดแล้ว ห้ามแก้บัญชีร้าน`;
}

export function serializeClosedPeriods(closed: readonly string[]): string {
  return JSON.stringify([...new Set(closed.filter(isPeriodYm))].sort());
}

export function planClosePeriod(
  closed: readonly string[],
  periodYm: string
): { ok: true; next: string[] } | { ok: false; error: string } {
  if (!isPeriodYm(periodYm)) return { ok: false, error: "ระบุงวดเป็น YYYY-MM" };
  if (closed.includes(periodYm)) return { ok: false, error: `งวด ${periodYm} ปิดอยู่แล้ว` };
  return { ok: true, next: [...new Set([...closed, periodYm].filter(isPeriodYm))].sort() };
}

export function planReopenPeriod(
  closed: readonly string[],
  periodYm: string
): { ok: true; next: string[] } | { ok: false; error: string } {
  if (!isPeriodYm(periodYm)) return { ok: false, error: "ระบุงวดเป็น YYYY-MM" };
  if (!closed.includes(periodYm)) return { ok: false, error: `งวด ${periodYm} ยังไม่ปิด` };
  return { ok: true, next: closed.filter((item) => item !== periodYm) };
}
