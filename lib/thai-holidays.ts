/**
 * ปฏิทินวันหยุดนักขัตฤกษ์กลางของระบบ — ใช้ร่วมกันทุกสาขา/ทุกกิจการ
 * วันหยุดประจำสัปดาห์ของพนักงานเป็นคนละเรื่อง (ตั้งต่อคนที่ /roster)
 *
 * วันที่ยึดกับปฏิทินเกรกอเรียนคำนวณจากปีได้ วันตามปฏิทินจันทรคติไทยใส่เป็นตาราง
 * ปี 2025–2028 (ขยายตารางนี้เมื่อขึ้นปีใหม่ ไม่ดึงจากสาขาแรก)
 */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** วันหยุดที่วันที่คงที่ทุกปี (เดือนเป็น 1–12) */
const FIXED: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: "วันขึ้นปีใหม่" },
  { month: 4, day: 6, name: "วันจักรี" },
  { month: 4, day: 13, name: "วันสงกรานต์" },
  { month: 4, day: 14, name: "วันสงกรานต์" },
  { month: 4, day: 15, name: "วันสงกรานต์" },
  { month: 5, day: 1, name: "วันแรงงานแห่งชาติ" },
  { month: 5, day: 4, name: "วันฉัตรมงคล" },
  { month: 6, day: 3, name: "วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี" },
  { month: 7, day: 28, name: "วันเฉลิมพระชนมพรรษา ร.10" },
  { month: 8, day: 12, name: "วันแม่แห่งชาติ" },
  { month: 9, day: 24, name: "วันมหิดล" },
  { month: 10, day: 13, name: "วันนวมินทรมหาราช" },
  { month: 10, day: 23, name: "วันปิยมหาราช" },
  { month: 12, day: 5, name: "วันพ่อแห่งชาติ" },
  { month: 12, day: 10, name: "วันรัฐธรรมนูญ" },
  { month: 12, day: 31, name: "วันสิ้นปี" },
];

/** วันตามปฏิทินจันทรคติที่วันที่ขยับทุกปี */
const LUNAR: Record<string, string> = {
  "2025-02-12": "วันมาฆบูชา",
  "2025-05-12": "วันวิสาขบูชา",
  "2025-07-10": "วันอาสาฬหบูชา",
  "2025-07-11": "วันเข้าพรรษา",
  "2026-03-03": "วันมาฆบูชา",
  "2026-05-31": "วันวิสาขบูชา",
  "2026-07-29": "วันอาสาฬหบูชา",
  "2026-07-30": "วันเข้าพรรษา",
  "2027-02-20": "วันมาฆบูชา",
  "2027-05-20": "วันวิสาขบูชา",
  "2027-07-18": "วันอาสาฬหบูชา",
  "2027-07-19": "วันเข้าพรรษา",
  "2028-02-09": "วันมาฆบูชา",
  "2028-05-08": "วันวิสาขบูชา",
  "2028-07-06": "วันอาสาฬหบูชา",
  "2028-07-07": "วันเข้าพรรษา",
};

export function thaiPublicHolidays(year: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of FIXED) {
    out[ymd(year, h.month, h.day)] = h.name;
  }
  for (const [date, name] of Object.entries(LUNAR)) {
    if (date.startsWith(`${year}-`)) out[date] = name;
  }
  return out;
}

/** รวมหลายปีไว้ใน map เดียว — หน้าปฏิทินข้ามปีได้โดยไม่ต้องรู้ล่วงหน้าว่าดูเดือนไหน */
export function thaiPublicHolidaysRange(fromYear: number, toYear: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (let y = fromYear; y <= toYear; y++) {
    Object.assign(out, thaiPublicHolidays(y));
  }
  return out;
}

export function thaiHolidayName(dateYmd: string): string | undefined {
  const year = Number(dateYmd.slice(0, 4));
  if (!Number.isFinite(year)) return undefined;
  return thaiPublicHolidays(year)[dateYmd];
}
