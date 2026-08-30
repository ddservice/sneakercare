export type DocumentType =
  | "QUOTATION"
  | "DO"
  | "INVOICE"
  | "BILLING_NOTE"
  | "TAX_INVOICE"
  | "RECEIPT";

export const DOC_TYPE_CONFIG: Record<
  DocumentType,
  { prefix: string; labelTh: string; labelEn: string }
> = {
  QUOTATION: { prefix: "QT", labelTh: "ใบเสนอราคา", labelEn: "Quotation" },
  DO: { prefix: "DO", labelTh: "ใบส่งของ", labelEn: "Delivery Order" },
  INVOICE: { prefix: "INV", labelTh: "ใบแจ้งหนี้", labelEn: "Invoice" },
  BILLING_NOTE: { prefix: "BN", labelTh: "ใบวางบิล", labelEn: "Billing Note" },
  TAX_INVOICE: { prefix: "TAX", labelTh: "ใบกำกับภาษี", labelEn: "Tax Invoice" },
  RECEIPT: { prefix: "REC", labelTh: "ใบเสร็จรับเงิน", labelEn: "Receipt" },
};
