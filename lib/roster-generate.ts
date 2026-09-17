/**
 * จัดวันหยุดประจำสัปดาห์อัตโนมัติจากจำนวนพนักงาน + จำนวนคนที่ต้องอยู่ร้านต่อวัน
 * ไม่ผูกชื่อคนหรือสาขาแรก — ใครส่งรายชื่อมาได้ตารางของกิจการนั้น
 *
 * กติกา:
 * - แต่ละคนได้วันหยุดประจำสัปดาห์ 1 วัน (วนอาทิตย์→เสาร์)
 * - ถ้าคนน้อยกว่า 7 คน จะกระจายไม่ให้หยุดวันเดียวกันจนกว่าจะหมดวัน
 * - ถ้าคนมากกว่า 7 คน วันเดียวกันมีคนหยุดซ้ำได้ (คนที่ 8 หยุดอาทิตย์เหมือนคนที่ 1)
 * - `workersPerDay` ใช้ตรวจว่าครอบคลุมพอไหม ไม่ได้บังคับให้ทุกวันมีคนหยุดเท่ากัน
 *   (ร้าน 3 คนอยากให้มี 2 คนต่อวัน ⇒ แต่ละคนหยุด 1 วัน สัปดาห์นั้นมี 2 วันที่ครบ 3 คน)
 */

export type GeneratedDayOff = {
  staffIndex: number;
  dayOff: number;
};

export type CoverageWarning = {
  weekday: number;
  working: number;
  needed: number;
};

export function assignWeeklyDayOffs(staffCount: number): number[] {
  if (staffCount <= 0) return [];
  return Array.from({ length: staffCount }, (_, i) => i % 7);
}

export function weekdayCoverage(staffCount: number, dayOffs: number[]): number[] {
  const working = Array.from({ length: 7 }, () => staffCount);
  for (const d of dayOffs) {
    if (d >= 0 && d <= 6) working[d] -= 1;
  }
  return working;
}

export function coverageWarnings(
  staffCount: number,
  dayOffs: number[],
  workersPerDay: number
): CoverageWarning[] {
  const needed = Math.max(0, Math.min(workersPerDay, staffCount));
  return weekdayCoverage(staffCount, dayOffs)
    .map((working, weekday) => ({ weekday, working, needed }))
    .filter((row) => row.working < row.needed);
}

export function generateRosterPlan(staffCount: number, workersPerDay: number) {
  const dayOffs = assignWeeklyDayOffs(staffCount);
  return {
    dayOffs,
    coverage: weekdayCoverage(staffCount, dayOffs),
    warnings: coverageWarnings(staffCount, dayOffs, workersPerDay),
  };
}

const MINUTES_PER_HOUR = 60;

function parseHm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * MINUTES_PER_HOUR + min;
}

function formatHm(total: number): string {
  const wrapped = ((total % (24 * MINUTES_PER_HOUR)) + 24 * MINUTES_PER_HOUR) % (24 * MINUTES_PER_HOUR);
  const h = Math.floor(wrapped / MINUTES_PER_HOUR);
  const min = wrapped % MINUTES_PER_HOUR;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** กะเช้า/กะสายจากเวลาเปิด-ปิดของสาขานั้น (เตรียมร้าน 30 นาที / เคลียร์หลังปิด 30 นาที) */
export function shiftsFromShopHours(openTime: string, closeTime: string) {
  const open = parseHm(openTime) ?? parseHm("09:00")!;
  const close = parseHm(closeTime) ?? parseHm("20:00")!;
  const morningStart = open - 30;
  const lateEnd = close + 30;
  const morningEnd = morningStart + 9 * MINUTES_PER_HOUR;
  const lateStart = lateEnd - 9 * MINUTES_PER_HOUR;
  return {
    open: formatHm(open),
    close: formatHm(close),
    morning: `${formatHm(morningStart)} - ${formatHm(morningEnd)}`,
    late: `${formatHm(lateStart)} - ${formatHm(lateEnd)}`,
  };
}
