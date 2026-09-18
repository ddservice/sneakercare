/**
 * VAT บนเอกสารขาย — จดทะเบียนเป็นระดับนิติบุคคล (tenant) ไม่ใช่ต่อสาขา
 *
 * ใบเสนอราคา / ใบส่งของ ไม่คิด VAT
 * ใบกำกับภาษี คิด 7% เสมอถ้าจด VAT (ยังไม่จด = ออกใบนี้ไม่ได้)
 * ใบแจ้งหนี้ / ใบวางบิล / ใบเสร็จ เลือกได้ต่อใบ: บิลเงินสด (0%) หรือบิล VAT (7%)
 * ค่าเริ่มต้น: แจ้งหนี้/วางบิล = VAT · ใบเสร็จ = เงินสด
 *
 * ⚠️ เซิร์ฟเวอร์ต้องเรียก documentVatRate() เอง ห้ามเชื่อ vat_rate จาก client
 */

import { STANDARD_VAT_RATE, money } from "./wht";
import type { DocumentType } from "./smartacc/types";

export { STANDARD_VAT_RATE };

const NEVER_VAT: ReadonlySet<DocumentType> = new Set(["QUOTATION", "DO"]);
const OPTIONAL_VAT: ReadonlySet<DocumentType> = new Set([
  "INVOICE",
  "BILLING_NOTE",
  "RECEIPT",
]);

/** ไม่มีคีย์ใน sc_settings = จด VAT อยู่แล้ว (กิจการแรกที่กระทบยอดกับ Excel) */
export function parseVatRegistered(raw: string | null | undefined): boolean {
  if (raw === undefined || raw === null || String(raw).trim() === "") return true;
  const v = String(raw).trim().toLowerCase();
  if (v === "false" || v === "0" || v === "no") return false;
  if (v === "true" || v === "1" || v === "yes") return true;
  return true;
}

export function canIssueTaxInvoice(vatRegistered: boolean): boolean {
  return vatRegistered;
}

export function vatChoiceAllowed(docType: DocumentType): boolean {
  return OPTIONAL_VAT.has(docType);
}

export function defaultChargeVat(vatRegistered: boolean, docType: DocumentType): boolean {
  if (!vatRegistered) return false;
  if (NEVER_VAT.has(docType)) return false;
  if (docType === "TAX_INVOICE") return true;
  if (docType === "RECEIPT") return false;
  return vatChoiceAllowed(docType);
}

export function documentVatRate(
  vatRegistered: boolean,
  docType: DocumentType,
  requestedChargeVat?: boolean
): 0 | typeof STANDARD_VAT_RATE {
  if (!vatRegistered) return 0;
  if (NEVER_VAT.has(docType)) return 0;
  if (docType === "TAX_INVOICE") return STANDARD_VAT_RATE;
  if (!vatChoiceAllowed(docType)) return 0;
  const charge =
    requestedChargeVat === undefined
      ? defaultChargeVat(true, docType)
      : requestedChargeVat;
  return charge ? STANDARD_VAT_RATE : 0;
}

export function settleDocumentVat(subtotal: number, vatRate: 0 | typeof STANDARD_VAT_RATE) {
  const base = money(Math.max(0, Number(subtotal) || 0));
  const vatAmount = vatRate === STANDARD_VAT_RATE ? money(base * (STANDARD_VAT_RATE / 100)) : 0;
  return {
    subtotal: base,
    vatRate,
    vatAmount,
    grandTotal: money(base + vatAmount),
  };
}
