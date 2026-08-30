import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOC_TYPE_CONFIG, type DocumentType } from "./types";

export { DOC_TYPE_CONFIG, type DocumentType };

export async function generateDocumentNumber(
  docType: DocumentType,
  date: Date = new Date()
): Promise<string> {
  const config = DOC_TYPE_CONFIG[docType];
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const dateStr = `${year}${month}${day}`; // YYYYMMDD

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("fn_generate_document_number" as any, {
    p_doc_type: docType,
    p_prefix: config.prefix,
    p_date_str: dateStr,
  });

  if (error || !data) {
    const randomSeq = Math.floor(1000 + Math.random() * 9000);
    return `${config.prefix}-${dateStr}-${randomSeq}`;
  }

  return String(data);
}
