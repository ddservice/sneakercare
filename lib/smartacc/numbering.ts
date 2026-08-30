import { createAdminClient } from "@/lib/supabase/admin";

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

export async function generateDocumentNumber(
  docType: DocumentType,
  date: Date = new Date()
): Promise<string> {
  const config = DOC_TYPE_CONFIG[docType];
  const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("fn_generate_document_number" as any, {
    p_doc_type: docType,
    p_prefix: config.prefix,
    p_year_month: yearMonth,
  });

  if (error || !data) {
    // Fallback if RPC is constrained
    const randomSeq = Math.floor(1000 + Math.random() * 9000);
    return `${config.prefix}-${yearMonth}-${randomSeq}`;
  }

  return String(data);
}
