/**
 * สูตรกลางสำหรับ "อะไรนับเป็นค่าใช้จ่าย" ของตาราง sc_opex
 *
 * ⚠️ ทำไมต้องมีไฟล์นี้ (2026-09-06): เดิมหน้า /expenses กับหน้าภาพรวม (/dashboard) เขียนตรรกะ
 * การกรอง sc_opex กันคนละแบบ ผลคือแสดงยอดค่าใช้จ่ายของเดือนเดียวกัน **ไม่ตรงกัน** มาตลอด
 * (ส.ค. 2569: หน้าภาพรวม ฿50,971.00 vs หน้า /expenses ฿57,571.51 — ต่างกัน ฿6,600.51)
 * เพราะหน้าภาพรวมใช้ whitelist ของชื่อหมวดที่ hardcode ไว้ 8 ชื่อ แต่ `sc_opex.category`
 * เป็นข้อความอิสระที่ฟอร์มสร้างชื่อใหม่ได้เรื่อยๆ หมวดที่ไม่อยู่ในรายชื่อจึงหายเงียบ
 *
 * ไฟล์นี้เป็น **pure function ไม่มี server-only** จึงเรียกได้ทั้งจาก Server Action และ
 * Client Component — ห้าม import อะไรที่เป็น server-only เข้ามาเด็ดขาด จะทำให้หน้าภาพรวมพัง
 *
 * ⚠️ ก่อนเพิ่ม category/key ใหม่ในระบบ ให้มาอ่านไฟล์นี้ก่อนเสมอ: `sc_opex` เป็น key-value store
 * ที่เก็บของหลายชนิดปนกัน (ค่าใช้จ่ายจริง / ยอดสรุปเงินเดือน / รายรับห้องเช่า / ข้อมูลภายใน)
 * แยกกันด้วย `category`/`key` ที่เป็น free-text ไม่มี enum บังคับที่ระดับฐานข้อมูล
 */

import { EXPENSE_CATEGORIES, type ExpenseCategoryKey } from "./expense-categories";

/** แถวดิบจาก sc_opex เท่าที่การคำนวณต้องใช้ */
export type OpexRowLike = {
  id?: string | number;
  month?: string | null;
  category?: string | null;
  key?: string | null;
  name?: string | null;
  amount?: number | string | null;
  pay_method?: string | null;
  recorded_by?: string | null;
};

/** รายการค่าใช้จ่ายหนึ่งบรรทัดหลังผ่านการกรอง/แตกรายการย่อยแล้ว */
export type ExpenseLine = {
  id: string;
  month: string;
  category: string;
  name: string;
  amount: number;
  payMethod: string;
  recordedBy: string;
  key: string;
  /** true = เป็นส่วนแบ่งกำไรหุ้นส่วน ไม่ใช่ค่าใช้จ่ายดำเนินงานปกติ (ดู PARTNER_SHARE_CATEGORY) */
  isPartnerShare?: boolean;
};

/**
 * หมวดที่ "ไม่ใช่ค่าใช้จ่ายจริง" — ต้องกันออกจากทุกยอดรวมเสมอ
 *
 *  payslip_detail : ข้อมูลดิบของสลิปเงินเดือนรายคน (ฐานเงินเดือน/เบี้ยขยัน/OT/หัก)
 *                   ยอดสุทธิถูกนับผ่านแถว category="ค่าแรงพนักงาน" อยู่แล้ว นับซ้ำไม่ได้
 *                   หมวดนี้ยังมีแถว key="audit_log" ที่ระบบเดิมเคยเก็บ timestamp ไว้ใน amount
 *  rental_income  : รายรับค่าเช่าห้องชั้น 3 — เป็นรายรับ ไม่ใช่รายจ่าย
 *  rental_meter   : เลขมิเตอร์/ค่าเช่าที่บันทึกไว้ใช้คำนวณ ไม่ใช่เงินที่จ่ายออกจริง
 */
export const NON_EXPENSE_CATEGORIES: ReadonlySet<string> = new Set([
  "payslip_detail",
  "rental_income",
  "rental_meter",
]);

/** หมวดที่เก็บ "ยอดสุทธิที่จ่ายให้พนักงานรายคน" — แยกออกมานับเป็น payroll ต่างหาก */
export const PAYROLL_CATEGORY = "ค่าแรงพนักงาน";

/**
 * แถวสรุปรายจ่ายเบ็ดเตล็ดก้อนเดียว (key="misc") มียอดเท่ากับผลรวมของรายการย่อยใน
 * key="misc_items_json" เป๊ะทุกเดือน (ตรวจย้อนหลังทั้งหมดแล้ว) — ใช้รายการย่อยเป็นแหล่งเดียว
 * เพื่อให้ตารางแสดงแยกบรรทัดได้ แล้วกันแถวสรุปออกไม่ให้นับซ้ำสองรอบ
 */
export const MISC_SUMMARY_KEY = "misc";
export const MISC_ITEMS_KEY = "misc_items_json";

/**
 * หมวด "ส่วนแบ่งกำไรหุ้นส่วน" — เงินที่แบ่งให้หุ้นส่วนตามสัดส่วนของกำไรสุทธิ (ปัจจุบัน 20%)
 *
 * ⚠️ ทำไมต้องแยกออกมาจากค่าใช้จ่ายอื่น (2026-09-08): ยอดนี้ **คำนวณจากกำไรสุทธิ** แล้วถูกบันทึก
 * กลับเข้ามาเป็นค่าใช้จ่าย ⇒ ถ้าแสดงรวมอยู่ในก้อนเดียว ตัวเลข "กำไรสุทธิ" ที่เห็นบนหน้าจอจะเป็น
 * ยอด*หลัง*หักส่วนแบ่งไปแล้ว ซึ่งเอาไปคูณ 20% ซ้ำไม่ได้ (วนเป็นงูกินหาง) — Excel ที่เจ้าของ
 * กระทบยอดจึงแสดงสองบรรทัดเสมอ: กำไรสุทธิ แล้วค่อยหักส่วนแบ่งหุ้นส่วนต่างหาก
 *
 * ยอดนี้ยัง **นับรวมใน `totalExpenses` เหมือนเดิม** (เงินออกจากร้านจริง) — ที่เพิ่มมาคือ
 * `totalPartnerShare` และ `totalExpensesBeforePartnerShare` ไว้ให้หน้าจอแสดงทั้งสองมุมได้
 */
export const PARTNER_SHARE_CATEGORY = "ส่วนแบ่งหุ้นส่วน";

/**
 * รายการรุ่นเก่าถูกบันทึกฝังอยู่ใน `misc_items_json` ชื่อ "ค่าหุ้นส่วน 20%" (พ.ค.–ก.ค. 69)
 * จับด้วยรูปแบบที่แคบที่สุดเท่าที่พอ เพราะคำว่า "หุ้นส่วน" เฉยๆ ไม่ได้แปลว่าเป็นส่วนแบ่งกำไร:
 *  - "เงินเดือนหุ้นส่วนผู้จัดการ (ไม่หัก ปกส.)" = เงินเดือน ไม่ใช่ส่วนแบ่ง (ต้องไม่เข้าเงื่อนไข)
 *  - "คืนเงินหุ้นส่วน" (02/2569) = คืนเงินลงทุน ไม่ใช่ส่วนแบ่ง (ต้องไม่เข้าเงื่อนไข)
 * จึงบังคับให้ต้องมีเครื่องหมาย % หรือคำว่า "ส่วนแบ่ง" อยู่ในชื่อด้วย
 */
const LEGACY_PARTNER_SHARE_NAME = /หุ้นส่วน/;
const PARTNER_SHARE_QUALIFIER = /(\d+\s*%|ส่วนแบ่ง)/;

/** รายการนี้เป็น "ส่วนแบ่งกำไรหุ้นส่วน" หรือไม่ (ใช้ได้ทั้งแถว sc_opex และรายการย่อยใน misc) */
export function isPartnerShareEntry(name?: string | null, category?: string | null): boolean {
  if (String(category ?? "") === PARTNER_SHARE_CATEGORY) return true;
  const label = String(name ?? "");
  return LEGACY_PARTNER_SHARE_NAME.test(label) && PARTNER_SHARE_QUALIFIER.test(label);
}

/**
 * เพดานกันค่าผิดปกติ — ระบบเดิมเคยเก็บ epoch milliseconds (ระดับ 1.78 ล้านล้าน) ไว้ในคอลัมน์
 * `amount` ของแถว audit_log ถ้าหลุดเข้ามานับ ยอดเงินทุกหน้าจะระเบิดทันที
 * (แถวเก่าถูกล้างเป็น 0 และแก้ต้นเหตุใน legacy แล้วเมื่อ 2026-09-06 แต่คงเพดานไว้เป็นตาข่าย)
 */
export const MAX_REASONABLE_AMOUNT = 10_000_000;

function toAmount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** จำนวนเงินที่ "สมเหตุสมผล" พอจะนับเข้ายอดรวมได้ */
export function isUsableAmount(value: unknown): boolean {
  const n = toAmount(value);
  return n > 0 && n < MAX_REASONABLE_AMOUNT;
}

/** แถวข้อมูลภายในของสลิปรายคน (empd_*) — กันไว้อีกชั้นเผื่อถูกบันทึกด้วย category อื่น */
function isPayslipInternalRow(row: OpexRowLike): boolean {
  return (
    String(row.key ?? "").startsWith("empd_") ||
    String(row.name ?? "").startsWith("empd_") ||
    String(row.category ?? "").startsWith("empd_")
  );
}

/** แถวนี้เป็น "ค่าใช้จ่ายดำเนินงาน" ที่ต้องนับเข้า OPEX หรือไม่ (ไม่รวมเงินเดือน) */
export function isOpexRow(row: OpexRowLike): boolean {
  const category = String(row.category ?? "");
  if (NON_EXPENSE_CATEGORIES.has(category)) return false;
  if (category === PAYROLL_CATEGORY) return false;
  if (row.key === MISC_SUMMARY_KEY) return false;
  if (isPayslipInternalRow(row)) return false;
  return true;
}

/** แถวนี้เป็นยอดสุทธิเงินเดือนรายคนหรือไม่ */
export function isPayrollRow(row: OpexRowLike): boolean {
  return String(row.category ?? "") === PAYROLL_CATEGORY && !isPayslipInternalRow(row);
}

export type ExpenseBreakdown = {
  /** รายการค่าใช้จ่ายดำเนินงาน แตกรายการย่อยของ misc_items_json ออกมาแล้ว */
  opexLines: ExpenseLine[];
  /** ผลรวมของ opexLines */
  totalOpex: number;
  /** ผลรวมยอดสุทธิเงินเดือนที่จ่ายพนักงาน (จากแถว category="ค่าแรงพนักงาน") */
  totalPayroll: number;
  /** totalOpex + totalPayroll — ตัวเลข "รวมค่าใช้จ่ายทั้งหมด" ที่ทุกหน้าต้องใช้ร่วมกัน */
  totalExpenses: number;
  /** ส่วนแบ่งกำไรหุ้นส่วน (รวมอยู่ใน totalOpex/totalExpenses แล้ว — แยกมาเพื่อแสดงผลเท่านั้น) */
  totalPartnerShare: number;
  /** totalExpenses หักส่วนแบ่งหุ้นส่วนออก = ฐานที่เอาไปคำนวณกำไรก่อนแบ่งได้ */
  totalExpensesBeforePartnerShare: number;
  /** รายรับค่าเช่าห้อง (แยกออกมา ไม่ปนกับค่าใช้จ่าย) */
  totalRentalIncome: number;
  /** ชื่อ→ยอด ของรายการย่อยในรายจ่ายเบ็ดเตล็ด ใช้แสดงรายละเอียด */
  miscItems: Array<{ name: string; amount: number; method: string; month: string }>;
};

/**
 * คำนวณยอดค่าใช้จ่ายทั้งหมดจากแถว sc_opex ที่กรองเดือนมาแล้ว
 *
 * onParseError ใช้ส่ง callback สำหรับ log ฝั่งเซิร์ฟเวอร์ (client component ไม่ต้องส่งมา)
 * — ตั้งใจไม่ให้ throw เพราะแถว JSON เสียแถวเดียวไม่ควรทำให้ทั้งหน้าพัง แต่ต้องไม่เงียบสนิท
 */
export function calculateExpenseBreakdown(
  rows: readonly OpexRowLike[],
  onParseError?: (rowId: string | number | undefined, err: unknown) => void
): ExpenseBreakdown {
  const opexLines: ExpenseLine[] = [];
  const miscItems: ExpenseBreakdown["miscItems"] = [];
  let totalOpex = 0;
  let totalPayroll = 0;
  let totalRentalIncome = 0;
  let totalPartnerShare = 0;

  for (const row of rows) {
    const amount = toAmount(row.amount);

    if (String(row.category ?? "") === "rental_income") {
      totalRentalIncome += amount;
      continue;
    }

    if (isPayrollRow(row)) {
      if (isUsableAmount(amount)) totalPayroll += amount;
      continue;
    }

    // รายจ่ายเบ็ดเตล็ดเก็บเป็น JSON array ในคอลัมน์ name ของแถวเดียว — แตกออกเป็นบรรทัด
    if (row.key === MISC_ITEMS_KEY && row.name) {
      try {
        const parsed: unknown = JSON.parse(String(row.name));
        if (Array.isArray(parsed)) {
          parsed.forEach((item: Record<string, unknown>, idx: number) => {
            const itemAmount = toAmount(item?.amount);
            const method = String(item?.method ?? "บัญชีร้าน");
            miscItems.push({
              name: String(item?.name ?? "อื่นๆ"),
              amount: itemAmount,
              method,
              month: String(row.month ?? ""),
            });
            if (isUsableAmount(itemAmount)) {
              const partnerShare = isPartnerShareEntry(String(item?.name ?? ""));
              totalOpex += itemAmount;
              if (partnerShare) totalPartnerShare += itemAmount;
              opexLines.push({
                id: `${row.id}-misc-${idx}`,
                month: String(row.month ?? ""),
                category: partnerShare ? PARTNER_SHARE_CATEGORY : "ค่าใช้จ่ายเบ็ดเตล็ด",
                name: String(item?.name ?? "อื่นๆ"),
                amount: itemAmount,
                payMethod: method,
                recordedBy: String(row.recorded_by ?? "Milo"),
                key: `${row.key}-${idx}`,
                isPartnerShare: partnerShare,
              });
            }
          });
        }
      } catch (err) {
        onParseError?.(row.id, err);
      }
      continue;
    }

    if (!isOpexRow(row) || !isUsableAmount(amount)) continue;

    const partnerShare = isPartnerShareEntry(row.name, row.category);
    totalOpex += amount;
    if (partnerShare) totalPartnerShare += amount;
    opexLines.push({
      id: String(row.id ?? `${row.month}-${row.key}`),
      month: String(row.month ?? ""),
      category: String(row.category || "ค่าดำเนินการ"),
      name: String(row.name ?? ""),
      amount,
      payMethod: String(row.pay_method || "บัญชีร้าน"),
      recordedBy: String(row.recorded_by || "Milo"),
      key: String(row.key ?? ""),
      isPartnerShare: partnerShare,
    });
  }

  const totalExpenses = totalOpex + totalPayroll;
  return {
    opexLines,
    totalOpex,
    totalPayroll,
    totalExpenses,
    totalPartnerShare,
    totalExpensesBeforePartnerShare: totalExpenses - totalPartnerShare,
    totalRentalIncome,
    miscItems,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ขั้นที่ 4 ของ docs/sc-opex-refactor-plan.md — อ่านฝั่ง OPEX จากตารางใหม่
// ═══════════════════════════════════════════════════════════════════════════

/** แถวจาก `sc_expense_entries` เท่าที่การคำนวณต้องใช้ */
export type ExpenseEntryLike = {
  id?: number | string | null;
  entry_date?: string | null;
  amount?: number | string | null;
  /** เก็บเป็น **key** ของหมวด (เช่น "supplies_cogs") ไม่ใช่ shortLabel เหมือน sc_opex */
  category?: string | null;
  title?: string | null;
  pay_method?: string | null;
  /** `"<opexId>"` หรือ `"<opexId>-misc-<index>"` — ดู migration 0025 */
  legacy_ref?: string | null;
};

/** "YYYY-MM-DD" → "MM/YYYY" (รูปแบบที่หน้าเว็บใช้แสดงผลอยู่) */
function monthMYFromDate(date: string): string {
  return date.length >= 7 ? `${date.slice(5, 7)}/${date.slice(0, 4)}` : "";
}

/**
 * แทนที่ "ฝั่ง OPEX" ของ breakdown ด้วยข้อมูลจาก `sc_expense_entries`
 *
 * ⚠️ **เงินเดือนและรายรับห้องเช่ายังมาจาก `sc_opex` เหมือนเดิม** (ยังไม่ถูกย้าย จนกว่าจะถึง
 * ขั้นที่ 5) จึงรับ `base` ที่คำนวณจาก `sc_opex` มาแล้วเป็นฐาน แล้วเปลี่ยนเฉพาะส่วน OPEX
 *
 * ⚠️ `id` ของแต่ละบรรทัดยังเป็น `legacy_ref` เสมอ ไม่ใช่ id ของตารางใหม่ — เพราะปุ่มลบ
 * ในหน้า /expenses ยังลบผ่าน `sc_opex` (ซึ่งเป็นแหล่งข้อมูลจริง และระบบเดิมยังอ่านอยู่)
 * `legacy_ref` ถูกออกแบบให้มีรูปแบบเดียวกับ id สังเคราะห์ที่ UI ใช้อยู่แล้วพอดี
 *
 * `sourceRows` ใช้แค่หา "ผู้บันทึก" ของแต่ละรายการ ซึ่งตารางใหม่ยังไม่มีคอลัมน์นั้น
 * (มีแต่ `created_by` ที่เป็น uuid) — ถ้าไม่ส่งมาจะแสดงเป็น "Milo" เหมือนค่าเดิมของระบบ
 */
export function applyEntriesToBreakdown(
  base: ExpenseBreakdown,
  entries: readonly ExpenseEntryLike[],
  sourceRows: readonly OpexRowLike[] = []
): ExpenseBreakdown {
  const recordedByOpexId = new Map<string, string>();
  for (const r of sourceRows) {
    if (r.id === undefined || r.id === null) continue;
    recordedByOpexId.set(String(r.id), String(r.recorded_by || "Milo"));
  }

  const opexLines: ExpenseLine[] = [];
  const miscItems: ExpenseBreakdown["miscItems"] = [];
  let totalOpex = 0;
  let totalPartnerShare = 0;

  for (const e of entries) {
    const amount = toAmount(e.amount);
    if (!isUsableAmount(amount)) continue;

    const ref = String(e.legacy_ref ?? e.id ?? "");
    const month = monthMYFromDate(String(e.entry_date ?? ""));
    const categoryKey = String(e.category ?? "");
    const meta = EXPENSE_CATEGORIES[categoryKey as ExpenseCategoryKey];
    const isShare = categoryKey === "partner_share";
    const title = String(e.title ?? "");
    const payMethod = String(e.pay_method || "บัญชีร้าน");
    // ref เป็น "<opexId>" หรือ "<opexId>-misc-<index>" — ตัดส่วนหลังออกเพื่อหาผู้บันทึก
    const sourceId = ref.split("-misc-")[0];

    totalOpex += amount;
    if (isShare) totalPartnerShare += amount;

    opexLines.push({
      id: ref,
      month,
      category: isShare ? PARTNER_SHARE_CATEGORY : meta?.shortLabel || categoryKey || "ค่าดำเนินการ",
      name: title,
      amount,
      payMethod,
      recordedBy: recordedByOpexId.get(sourceId) ?? "Milo",
      key: ref,
      isPartnerShare: isShare,
    });

    if (ref.includes("-misc-")) miscItems.push({ name: title, amount, method: payMethod, month });
  }

  const totalExpenses = totalOpex + base.totalPayroll;
  return {
    ...base,
    opexLines,
    miscItems,
    totalOpex,
    totalExpenses,
    totalPartnerShare,
    totalExpensesBeforePartnerShare: totalExpenses - totalPartnerShare,
  };
}
