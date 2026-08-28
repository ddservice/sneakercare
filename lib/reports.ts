import "server-only";
import { createClient } from "@/lib/supabase/server";

// ตรรกะช่วงเดือน + query ของหน้ารายงาน แยกออกมาไว้ที่เดียว เพราะทั้งหน้าเว็บและปุ่มดาวน์โหลด CSV
// ต้องได้ข้อมูล "ชุดเดียวกันเป๊ะ" — ถ้าปล่อยให้แต่ละที่เขียน query เอง วันหนึ่งตัวเลขบนจอกับในไฟล์
// จะไม่ตรงกันโดยไม่มีใครรู้ ซึ่งเป็นบั๊กประเภทที่หาสาเหตุยากที่สุด

export const DEFAULT_MONTHS_BACK = 12;

export type MonthlyCogsRow = {
  branch_id: string;
  month: string;
  cogs: number | null;
};

/** "YYYY-MM" ของเดือนปัจจุบัน (อิงเวลาเครื่องเซิร์ฟเวอร์) */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** รับค่าจาก <input type="month"> ที่ผู้ใช้พิมพ์มั่วได้ — คืน null ถ้าไม่ใช่รูปแบบ YYYY-MM ที่ถูกต้อง */
function sanitizeMonthKey(raw: string | undefined): string | null {
  if (!raw || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return null;
  return raw;
}

export type MonthRange = { from: string; to: string };

/**
 * ตัดสินช่วงเดือนที่จะแสดง ค่าเริ่มต้น = 12 เดือนล่าสุดจนถึงเดือนนี้
 * ถ้าผู้ใช้สลับ from/to กลับหัว ให้สลับกลับให้เอง แทนที่จะคืนตารางว่างแบบงงๆ
 */
export function resolveMonthRange(fromRaw?: string, toRaw?: string): MonthRange {
  const to = sanitizeMonthKey(toRaw) ?? currentMonthKey();
  const from = sanitizeMonthKey(fromRaw) ?? shiftMonth(to, -(DEFAULT_MONTHS_BACK - 1));
  return from <= to ? { from, to } : { from: to, to: from };
}

/** ต้นเดือนของ from และต้นเดือนถัดจาก to — ใช้เป็นขอบ [gte, lt) ให้ครอบคลุมทั้งเดือนสุดท้าย */
function boundsFor(range: MonthRange) {
  return {
    gte: `${range.from}-01T00:00:00.000Z`,
    lt: `${shiftMonth(range.to, 1)}-01T00:00:00.000Z`,
  };
}

export async function fetchMonthlyCogs(range: MonthRange, branchId: string | null) {
  const supabase = await createClient();
  const { gte, lt } = boundsFor(range);

  let query = supabase
    .from("v_monthly_cogs")
    .select("branch_id, month, cogs")
    .gte("month", gte)
    .lt("month", lt)
    .order("month", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);

  const { data, error } = await query;
  return { rows: (data ?? []) as MonthlyCogsRow[], error };
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
