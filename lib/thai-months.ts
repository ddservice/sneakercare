/** ชื่อเดือนภาษาไทย — ใช้สร้างตัวเลือกงวดจากวันที่เครื่อง ไม่ hardcode เดือนที่เขียนโค้ด */

export const THAI_MONTH_NAMES = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

export const THAI_MONTH_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
] as const;

export function thaiMonthLong(year: number, monthIndex0: number): string {
  return `${THAI_MONTH_NAMES[monthIndex0]} ${year + 543}`;
}

export function thaiMonthShort(year: number, monthIndex0: number): string {
  return `${THAI_MONTH_SHORT[monthIndex0]} ${String(year + 543).slice(-2)}`;
}

export type IsoMonthOption = {
  value: string;
  label: string;
  shortLabel: string;
};

/** ย้อนหลัง N เดือนจากเดือนปัจจุบันของเครื่อง (ไม่ใช่ UTC) */
export function buildIsoMonthOptions(monthsBack = 24, now: Date = new Date()): IsoMonthOption[] {
  const months: IsoMonthOption[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const value = `${yyyy}-${mm}`;
    const long = thaiMonthLong(yyyy, d.getMonth());
    months.push({
      value,
      label: i === 0 ? `${long} (${value}) — งวดล่าสุด` : `${long} (${value})`,
      shortLabel: thaiMonthShort(yyyy, d.getMonth()),
    });
  }
  return months;
}
