/** ใบลดหนี้ / ใบเพิ่มหนี้ — ชั้นเอกสารเท่านั้น ไม่กลับรายการขายร้าน และไม่คืนสต๊อก */

export type CorrectionKind = "CREDIT_NOTE" | "DEBIT_NOTE";

export const CORRECTION_PARENT_TYPES = ["INVOICE", "TAX_INVOICE", "RECEIPT"] as const;

export function isCorrectionType(docType: string): docType is CorrectionKind {
  return docType === "CREDIT_NOTE" || docType === "DEBIT_NOTE";
}

export function marksSourceConverted(targetType: string): boolean {
  return !isCorrectionType(targetType);
}

export function canCorrectParent(docType: string, status: string): boolean {
  if (status === "VOID") return false;
  return (CORRECTION_PARENT_TYPES as readonly string[]).includes(docType);
}

function satang(n: number): number {
  return Math.round((Number(n) || 0) * 100);
}

export function planCorrection(input: {
  kind: CorrectionKind;
  parentType: string;
  parentStatus: string;
  parentGrandTotal: number;
  existingCreditTotal: number;
  existingDebitTotal: number;
  requestAmount: number;
}): { ok: true; remaining: number } | { ok: false; error: string } {
  if (!canCorrectParent(input.parentType, input.parentStatus)) {
    return { ok: false, error: "ออกใบลดหนี้/เพิ่มหนี้ได้จากใบแจ้งหนี้ ใบกำกับ หรือใบเสร็จที่ยังไม่ยกเลิก" };
  }

  const request = satang(input.requestAmount);
  if (request <= 0) {
    return { ok: false, error: "ยอดใบลดหนี้/เพิ่มหนี้ต้องมากกว่า 0" };
  }

  const remaining = satang(input.parentGrandTotal) + satang(input.existingDebitTotal) - satang(input.existingCreditTotal);

  if (input.kind === "CREDIT_NOTE" && request > remaining) {
    return {
      ok: false,
      error: `ยอดลดหนี้เกินคงเหลือ ${ (remaining / 100).toFixed(2) } บาท`,
    };
  }

  return { ok: true, remaining: remaining / 100 };
}

/** บัญชีร้านยังอยู่ที่ sc_sales — ใบลดหนี้เอกสารไม่กลับรายการขาย */
export function correctionAffectsOfficialBooks(): false {
  return false;
}

/** ยังไม่มีมติต้นทุนคืนของ — ใบลดหนี้เอกสารไม่คืนสต๊อก */
export function correctionAffectsStock(): false {
  return false;
}
