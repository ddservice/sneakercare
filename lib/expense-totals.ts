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
              totalOpex += itemAmount;
              opexLines.push({
                id: `${row.id}-misc-${idx}`,
                month: String(row.month ?? ""),
                category: "ค่าใช้จ่ายเบ็ดเตล็ด",
                name: String(item?.name ?? "อื่นๆ"),
                amount: itemAmount,
                payMethod: method,
                recordedBy: String(row.recorded_by ?? "Milo"),
                key: `${row.key}-${idx}`,
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

    totalOpex += amount;
    opexLines.push({
      id: String(row.id ?? `${row.month}-${row.key}`),
      month: String(row.month ?? ""),
      category: String(row.category || "ค่าดำเนินการ"),
      name: String(row.name ?? ""),
      amount,
      payMethod: String(row.pay_method || "บัญชีร้าน"),
      recordedBy: String(row.recorded_by || "Milo"),
      key: String(row.key ?? ""),
    });
  }

  return {
    opexLines,
    totalOpex,
    totalPayroll,
    totalExpenses: totalOpex + totalPayroll,
    totalRentalIncome,
    miscItems,
  };
}
