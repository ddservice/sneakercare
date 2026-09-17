/**
 * วันที่ตามปฏิทินท้องถิ่นของผู้ใช้ — ห้ามใช้ `toISOString().slice(0, 10)`
 * เพราะ ISO เป็น UTC: หลัง 7 โมงเช้าไทยในวันใหม่ยังได้วันก่อนหน้า
 */

export function localYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** รวมวันที่ที่ผู้ใช้เลือกกับเวลาปัจจุบันของเครื่อง เป็น timestamptz */
export function receivedAtFromYmd(ymd: string, now: Date = new Date()): string {
  if (!isYmd(ymd)) return now.toISOString();
  const [y, m, d] = ymd.split("-").map(Number);
  const local = new Date(
    y,
    m - 1,
    d,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  );
  return local.toISOString();
}

/** ส่วนวันที่ของเลขที่เอกสาร เช่น 260917 จาก 2026-09-17 */
export function ymdToOrderDateCode(ymd: string): string {
  if (!isYmd(ymd)) return localYmd().slice(2).replace(/-/g, "");
  return ymd.slice(2).replace(/-/g, "");
}
