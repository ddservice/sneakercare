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

/** ประเภทเงินได้ที่พิมพ์บน 50 ทวิ / ไฟล์ e-Filing */
export function incomeTypeForCategory(category?: string | null): { code: string; label: string } {
  if (category === BUILDING_RENT_CATEGORY || category === "rental_income") {
    return { code: "5", label: "ค่าเช่า" };
  }
  return { code: "6", label: "ค่าบริการ / ค่าจ้างทำของ" };
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
    whtRate: number;
    baseAmount: number;
    taxAmount: number;
    payeeKind: WhtPayeeKind;
  },
  sequence: number
) {
  return {
    sequence,
    taxId: row.payeeTaxId,
    name: row.payeeName,
    address: row.payeeAddress,
    date: row.paymentDate,
    incomeType: row.incomeType,
    whtRate: row.whtRate,
    baseAmount: row.baseAmount,
    taxAmount: row.taxAmount,
    payeeKind: row.payeeKind,
  };
}
