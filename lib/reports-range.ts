// ตรรกะช่วงเดือน + จัดรูปแบบ ของหน้ารายงาน — **ไม่มี dependency ฝั่งเซิร์ฟเวอร์เลย**
//
// แยกออกมาจาก lib/reports.ts โดยตั้งใจ เพราะไฟล์นั้น import "server-only" ทำให้เอามา
// เขียนเทสต์ไม่ได้ ทั้งที่ส่วนที่พลาดง่ายที่สุดคือคณิตศาสตร์ขอบเดือน (ตกหล่นเดือนสุดท้าย,
// ข้ามปี, ผู้ใช้กรอกเดือนกลับหัว) กับการ escape CSV — ซึ่งล้วนเป็น logic บริสุทธิ์ทั้งหมด
//
// เทสต์อยู่ที่ scripts/test-reports-range.mjs (`npm run test:reports`)

export const DEFAULT_MONTHS_BACK = 12;

export type MonthRange = { from: string; to: string };

/** "YYYY-MM" ของเดือนปัจจุบัน (อิง UTC ให้ตรงกับที่ month ใน DB เก็บเป็น timestamptz) */
export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** เลื่อนเดือนไปข้างหน้า/ถอยหลัง ข้ามปีได้ถูกต้องเพราะให้ Date จัดการ overflow เอง */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** รับค่าจาก <input type="month"> ที่ผู้ใช้พิมพ์มั่วได้ — คืน null ถ้าไม่ใช่ YYYY-MM ที่ถูกต้อง */
export function sanitizeMonthKey(raw: string | undefined): string | null {
  if (!raw || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return null;
  return raw;
}

/**
 * ตัดสินช่วงเดือนที่จะแสดง ค่าเริ่มต้น = 12 เดือนล่าสุดจนถึงเดือนนี้
 * ถ้าผู้ใช้สลับ from/to กลับหัว ให้สลับกลับให้เอง แทนที่จะคืนตารางว่างแบบงงๆ
 */
export function resolveMonthRange(
  fromRaw?: string,
  toRaw?: string,
  now: Date = new Date()
): MonthRange {
  const to = sanitizeMonthKey(toRaw) ?? currentMonthKey(now);
  const from = sanitizeMonthKey(fromRaw) ?? shiftMonth(to, -(DEFAULT_MONTHS_BACK - 1));
  return from <= to ? { from, to } : { from: to, to: from };
}

/**
 * ขอบสำหรับ query: [gte, lt) — ใช้ "ต้นเดือนถัดจาก to" เป็นขอบบนแบบไม่รวม
 * เพื่อให้ครอบคลุมทั้งเดือนสุดท้ายจริงๆ (ถ้าใช้ lte กับต้นเดือน to จะได้แค่วันที่ 1)
 */
export function boundsFor(range: MonthRange) {
  return {
    gte: `${range.from}-01T00:00:00.000Z`,
    lt: `${shiftMonth(range.to, 1)}-01T00:00:00.000Z`,
  };
}

export function formatMonthLabel(month: string): string {
  return new Date(month).toLocaleDateString("th-TH", { year: "numeric", month: "long" });
}

/**
 * แปลงเป็น CSV — ใส่ BOM ไว้ข้างหน้าเพราะ Excel บน Windows อ่านไฟล์ UTF-8 ที่ไม่มี BOM
 * เป็น ANSI ทำให้ภาษาไทยกลายเป็นตัวขยะทั้งไฟล์
 */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (value: string | number) => {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}
