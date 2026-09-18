/**
 * สูตรกลางภาษีหัก ณ ที่จ่าย (WHT) + ค่าเช่า
 *
 * ยอดที่บันทึกเป็นค่าใช้จ่าย/รายได้ = ยอดก่อน VAT + VAT (ถ้ามี)
 * ภาษีหัก ณ ที่จ่าย **ไม่ใช่รายจ่ายเพิ่ม** — เป็นเงินที่หักจากยอดโอนจริงแล้วนำส่งสรรพากร
 *
 *   ยอดจ่ายสุทธิ = ยอดก่อน VAT + VAT − WHT
 *   WHT          = ยอดก่อน VAT × อัตรา  (คิดจากฐานก่อน VAT ตามประมวลรัษฎากร)
 *
 * ค่าเช่าอาคาร/สถานที่ใช้อัตรา 5% เป็นค่าเริ่มต้น (มาตรา 40(5))
 * ภ.ง.ด.3 = ผู้รับเงินเป็นบุคคลธรรมดา · ภ.ง.ด.53 = นิติบุคคล
 *
 * ⚠️ ห้ามนับ WHT เข้า sc_opex.amount อีกครั้ง — ค่าเช่า ฿18,000 ที่กระทบยอดกับ Excel
 * ไว้แล้วเป็นยอดเต็มก่อนหัก ถ้าลง WHT ฿900 เป็นรายจ่ายแยกจะนับซ้ำ (ดู CLAUDE.md)
 */

export const WHT_RATES = [1, 2, 3, 5] as const;
export type WhtRate = (typeof WHT_RATES)[number];

export const BUILDING_RENT_WHT_RATE: WhtRate = 5;
export const STANDARD_VAT_RATE = 7;
export const BUILDING_RENT_CATEGORY = "building_rent";
export const BUILDING_RENT_SHORT_LABEL = "ค่าเช่าอาคาร/สถานที่";

export type WhtPayeeKind = "person" | "juristic";
export type WhtDirection = "payable" | "receivable";
export type PndFormType = "PND3" | "PND53";

export type WhtSettlementInput = {
  /** ยอดก่อน VAT (ฐานที่ใช้คูณอัตราหัก ณ ที่จ่าย) */
  baseAmount: number;
  /** 0 = ไม่มี VAT, 7 = จด VAT */
  vatRate?: number;
  /** 0 = ไม่หัก, หรือ 1 / 2 / 3 / 5 */
  whtRate?: number;
  /** หมวดค่าใช้จ่าย — ค่าเช่าอาคารบังคับอัตรา 5% ถ้าไม่ได้ระบุอัตรา */
  category?: string | null;
};

export type WhtSettlement = {
  baseAmount: number;
  vatRate: number;
  vatAmount: number;
  /** ยอดที่ลงบัญชี (ค่าใช้จ่ายหรือรายได้) = ฐาน + VAT */
  grossAmount: number;
  whtRate: number;
  whtAmount: number;
  /** เงินโอนจริง / เงินเข้าบัญชีจริง */
  netPayment: number;
};

export function money(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function isWhtRate(n: number): n is WhtRate {
  return (WHT_RATES as readonly number[]).includes(n);
}

export function defaultWhtRateForCategory(category?: string | null): WhtRate | 0 {
  return category === BUILDING_RENT_CATEGORY ? BUILDING_RENT_WHT_RATE : 0;
}

export function settleWht(input: WhtSettlementInput): WhtSettlement {
  const baseAmount = money(Math.max(0, Number(input.baseAmount) || 0));
  const vatRate = input.vatRate === STANDARD_VAT_RATE ? STANDARD_VAT_RATE : 0;
  const requested = Number(input.whtRate);
  const fallback = defaultWhtRateForCategory(input.category);
  const whtRate = isWhtRate(requested) ? requested : requested === 0 ? 0 : fallback;

  const vatAmount = money(baseAmount * (vatRate / 100));
  const grossAmount = money(baseAmount + vatAmount);
  const whtAmount = money(baseAmount * (whtRate / 100));
  const netPayment = money(grossAmount - whtAmount);

  return {
    baseAmount,
    vatRate,
    vatAmount,
    grossAmount,
    whtRate,
    whtAmount,
    netPayment,
  };
}

export function pndFormForPayee(kind: WhtPayeeKind): PndFormType {
  return kind === "person" ? "PND3" : "PND53";
}

export function classifyPayeeKindFromTaxId(taxId: string): WhtPayeeKind {
  const d = String(taxId ?? "").replace(/[^0-9]/g, "");
  if (d.length === 13 && d.startsWith("0")) return "juristic";
  return "person";
}

/** ลำดับตามแบบ ภ.ง.ด.50 ทวิ ของกรมสรรพากร */
export const TAWI50_INCOME_TYPES = {
  "1": { article: "มาตรา 40(1)", label: "เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ" },
  "2": { article: "มาตรา 40(2)", label: "ค่าธรรมเนียม ค่านายหน้า ฯลฯ" },
  "3": { article: "มาตรา 40(3)", label: "ค่าแห่งลิขสิทธิ์ ฯลฯ" },
  "4": { article: "มาตรา 40(4)", label: "ดอกเบี้ย เงินปันผล ส่วนแบ่งกำไร ฯลฯ" },
  "5": { article: "มาตรา 40(5)", label: "ค่าเช่าอาคาร/อสังหาริมทรัพย์" },
  "6": { article: "มาตรา 40(6)", label: "ค่าจ้างทำของ / ค่าบริการ" },
} as const;

export type Tawi50IncomeCode = keyof typeof TAWI50_INCOME_TYPES;

export const TAWI50_CONDITIONS = [
  { id: "1", label: "(1) หัก ณ ที่จ่าย" },
  { id: "2", label: "(2) ออกให้ตลอดไป" },
  { id: "3", label: "(3) ออกให้ครั้งเดียว" },
  { id: "4", label: "(4) อื่น ๆ" },
] as const;

export type Tawi50ConditionId = (typeof TAWI50_CONDITIONS)[number]["id"];
/** ค่าเริ่มต้นตามแบบกรมสรรพากรเมื่อร้านเป็นผู้หักตอนจ่ายเงิน */
export const DEFAULT_TAWI50_CONDITION: Tawi50ConditionId = "1";

const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** ประเภทเงินได้ที่พิมพ์บน 50 ทวิ / ไฟล์ e-Filing */
export function incomeTypeForCategory(category?: string | null): { code: Tawi50IncomeCode; label: string } {
  if (category === BUILDING_RENT_CATEGORY || category === "rental_income") {
    const spec = TAWI50_INCOME_TYPES["5"];
    return { code: "5", label: `${spec.label} (${spec.article})` };
  }
  const spec = TAWI50_INCOME_TYPES["6"];
  return { code: "6", label: `${spec.label} (${spec.article})` };
}

export function inferIncomeTypeCode(label: string, code?: string | null): Tawi50IncomeCode {
  if (code && code in TAWI50_INCOME_TYPES) return code as Tawi50IncomeCode;
  if (/เช่า/.test(label)) return "5";
  if (/เงินเดือน|ค่าจ้าง(?!ทำของ)|โบนัส/.test(label)) return "1";
  return "6";
}

/** บรรทัดประเภทเงินได้บน 50 ทวิ — มีมาตราให้ผู้รับนำไปยื่น ภ.ง.ด.90/91 */
export function formatTawi50IncomeLine(code: string, storedLabel: string, whtRate: number): string {
  const resolved = inferIncomeTypeCode(storedLabel, code);
  const spec = TAWI50_INCOME_TYPES[resolved];
  return `${spec.label} (${spec.article}) อัตราภาษี ${whtRate}%`;
}

/** จำนวนเงินบน 50 ทวิ — ตัวเลขธรรมดาหน่วยบาท ไม่ใช้ $ หรือสัญลักษณ์สกุลเงินของ locale */
export function formatTawi50Amount(n: number): string {
  return money(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** YYYY-MM-DD → วันที่ไทย พ.ศ. โดยไม่ผ่าน Date() เพื่อกันเลื่อนวันจาก UTC */
export function thaiOfficialDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!m) return isoDate;
  const month = THAI_MONTHS_FULL[Number(m[2]) - 1];
  if (!month) return isoDate;
  return `${Number(m[3])} ${month} ${Number(m[1]) + 543}`;
}

export function certificateNumber(periodYm: string, sequence: number): string {
  const ym = /^\d{4}-\d{2}$/.test(periodYm) ? periodYm.replace("-", "") : "000000";
  return `WHT-${ym}-${String(Math.max(1, sequence)).padStart(4, "0")}`;
}

export function periodYmFromIsoDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(isoDate.trim());
  return m ? `${m[1]}-${m[2]}` : "";
}

export function validatePayeeTaxId(taxId: string): string | null {
  const d = String(taxId ?? "").replace(/[^0-9]/g, "");
  if (d.length !== 13) return "เลขประจำตัวผู้เสียภาษีต้องเป็น 13 หลัก";
  return null;
}

/** แปลงแถวหนังสือรับรองเป็นรูปแบบพิมพ์ 50 ทวิ / ไฟล์ ภ.ง.ด. */
export function certificateToWhtRecord(
  row: {
    payeeTaxId: string;
    payeeName: string;
    payeeAddress: string;
    paymentDate: string;
    incomeType: string;
    incomeTypeCode?: string | null;
    whtRate: number;
    baseAmount: number;
    taxAmount: number;
    payeeKind: WhtPayeeKind;
  },
  sequence: number
) {
  const incomeTypeCode = inferIncomeTypeCode(row.incomeType, row.incomeTypeCode);
  return {
    sequence,
    taxId: row.payeeTaxId,
    name: row.payeeName,
    address: row.payeeAddress,
    date: row.paymentDate,
    incomeType: row.incomeType,
    incomeTypeCode,
    incomeTypeLine: formatTawi50IncomeLine(incomeTypeCode, row.incomeType, row.whtRate),
    whtRate: row.whtRate,
    baseAmount: row.baseAmount,
    taxAmount: row.taxAmount,
    payeeKind: row.payeeKind,
  };
}
