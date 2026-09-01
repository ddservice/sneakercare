import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ตารางที่เก็บ audit trail ระดับแอป (ฝั่งการเงิน/ยอดขาย/เงินเดือน)
 *
 * ⚠️ ห้ามเปลี่ยนไปเขียนลง `audit_logs` เด็ดขาด — ในฐานข้อมูลจริง `audit_logs` เป็น VIEW
 * ที่ชี้ไป `inv_audit_logs` ซึ่งเป็น ledger ของฝั่งคลังสินค้าที่เขียนโดย DB trigger เท่านั้น
 * (กฎข้อ 1 ใน CLAUDE.md) ดูเหตุผลเต็มใน supabase/migrations/0011_sc_audit_logs_and_indexes.sql
 */
export const SC_AUDIT_TABLE = "sc_audit_logs";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "IMPORT"
  | "EXPORT";

export type AuditEntity =
  | "payroll"
  | "expense"
  | "daily_sale"
  | "ar_payment"
  | "inventory_item"
  | "stock_transaction"
  | "user"
  | "document"
  | "roster_employee"
  | "settings";

export interface AuditLogEntry {
  action: AuditAction;
  entity: AuditEntity;
  entity_id?: string | number;
  actor_id?: string;
  actor_name: string;
  detail?: Record<string, unknown>;
}

/**
 * เขียน audit log หนึ่งแถว
 *
 * จงใจไม่ throw: การบันทึก log ล้มเหลวต้องไม่ทำให้การลบ/แก้ข้อมูลของผู้ใช้พังตาม
 * แต่ต้อง "ดัง" พอในล็อกเซิร์ฟเวอร์ — ของเดิมกลืน error เงียบจนระบบ audit ไม่เคยทำงาน
 * เลยตั้งแต่ commit e3f025d โดยไม่มีใครรู้ (insert ลงคอลัมน์ที่ไม่มีอยู่จริง)
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    const supabase = createAdminClient();
    // cast เพราะ sc_audit_logs ยังไม่ถูก generate ลง database.types.ts (สร้างใน migration 0011)
    const table = supabase.from(SC_AUDIT_TABLE as never) as unknown as {
      insert: (row: Record<string, unknown>) => PromiseLike<{
        error: { message: string; code?: string } | null;
      }>;
    };
    const { error } = await table.insert({
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entity_id !== undefined ? String(entry.entity_id) : null,
      actor_id: entry.actor_id ?? null,
      actor_name: entry.actor_name || "ระบบ",
      detail: entry.detail ?? null,
    });

    if (error) {
      // PGRST205 = ยังไม่ได้รัน migration 0011 — บอกให้ชัดแทนที่จะเงียบ
      const hint =
        error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "")
          ? ` — ยังไม่ได้รัน supabase/migrations/0011_sc_audit_logs_and_indexes.sql บนฐานข้อมูลนี้`
          : "";
      console.error(
        `[audit] เขียน ${SC_AUDIT_TABLE} ไม่สำเร็จ (${entry.action} ${entry.entity} ${entry.entity_id ?? "-"}): ${error.message}${hint}`
      );
    }
  } catch (err) {
    // Audit failure must never crash the main operation
    console.error("[audit] failed to write log:", err);
  }
}
