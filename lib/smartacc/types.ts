export type DocumentType =
  | "QUOTATION"
  | "DO"
  | "INVOICE"
  | "BILLING_NOTE"
  | "TAX_INVOICE"
  | "RECEIPT"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE";

export const DOC_TYPE_CONFIG: Record<
  DocumentType,
  { prefix: string; labelTh: string; labelEn: string; nextTypes: DocumentType[] }
> = {
  QUOTATION: {
    prefix: "QA",
    labelTh: "ใบเสนอราคา",
    labelEn: "Quotation",
    nextTypes: ["DO", "INVOICE"],
  },
  DO: {
    prefix: "DO",
    labelTh: "ใบส่งของ",
    labelEn: "Delivery Order",
    nextTypes: ["BILLING_NOTE", "INVOICE"],
  },
  INVOICE: {
    prefix: "INV",
    labelTh: "ใบแจ้งหนี้",
    labelEn: "Invoice",
    nextTypes: ["BILLING_NOTE", "RECEIPT", "TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"],
  },
  BILLING_NOTE: {
    prefix: "BL",
    labelTh: "ใบวางบิล",
    labelEn: "Billing Note",
    nextTypes: ["RECEIPT", "TAX_INVOICE"],
  },
  RECEIPT: {
    prefix: "REC",
    labelTh: "ใบเสร็จรับเงิน",
    labelEn: "Receipt",
    nextTypes: ["TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"],
  },
  TAX_INVOICE: {
    prefix: "TAX",
    labelTh: "ใบกำกับภาษี",
    labelEn: "Tax Invoice",
    nextTypes: ["CREDIT_NOTE", "DEBIT_NOTE"],
  },
  CREDIT_NOTE: {
    prefix: "CN",
    labelTh: "ใบลดหนี้",
    labelEn: "Credit Note",
    nextTypes: [],
  },
  DEBIT_NOTE: {
    prefix: "DN",
    labelTh: "ใบเพิ่มหนี้",
    labelEn: "Debit Note",
    nextTypes: [],
  },
};

export function isDocumentType(value: string): value is DocumentType {
  return Object.prototype.hasOwnProperty.call(DOC_TYPE_CONFIG, value);
}
