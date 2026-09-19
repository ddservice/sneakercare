import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOC_TYPE_CONFIG, isDocumentType, type DocumentType } from "./types";

export { DOC_TYPE_CONFIG, isDocumentType, type DocumentType };

export async function generateDocumentNumber(
  docType: DocumentType,
  tenantId: string,
  date: Date = new Date()
): Promise<string> {
  const config = DOC_TYPE_CONFIG[docType];
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const dateStr = `${year}${month}${day}`; // YYYYMMDD

  const supabase = createAdminClient();
  // RPC ตัวนี้อยู่ใน schema extension_layer — ตัวนับแยกต่อ tenant แล้ว (migration 0036)
  // ต้องส่ง p_tenant_id เสมอ ไม่งั้นฟังก์ชันปฏิเสธ (ไม่มี session ให้ derive tenant เองได้
  // เพราะเรียกผ่าน service_role)
  const { data, error } = await supabase.schema("extension_layer").rpc("fn_generate_document_number", {
    p_doc_type: docType,
    p_prefix: config.prefix,
    p_date_str: dateStr,
    p_tenant_id: tenantId,
  });

  if (error || !data) {
    const randomSeq = Math.floor(1000 + Math.random() * 9000);
    return `${config.prefix}-${dateStr}-${randomSeq}`;
  }

  return String(data);
}
