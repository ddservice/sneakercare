export type DocumentType =
  | "QUOTATION"
  | "DO"
  | "INVOICE"
  | "BILLING_NOTE"
  | "TAX_INVOICE"
  | "RECEIPT";

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
    nextTypes: ["BILLING_NOTE", "RECEIPT", "TAX_INVOICE"],
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
    nextTypes: ["TAX_INVOICE"],
  },
  TAX_INVOICE: {
    prefix: "TAX",
    labelTh: "ใบกำกับภาษี",
    labelEn: "Tax Invoice",
    nextTypes: [],
  },
};
