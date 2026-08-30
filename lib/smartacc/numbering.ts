import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOC_TYPE_CONFIG, type DocumentType } from "./types";

export { DOC_TYPE_CONFIG, type DocumentType };

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
    const randomSeq = Math.floor(1000 + Math.random() * 9000);
    return `${config.prefix}-${yearMonth}-${randomSeq}`;
  }

  return String(data);
}
