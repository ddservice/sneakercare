import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestAuditContext } from "@/lib/request-context";

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
  | "settings"
  | "service_order";

export interface AuditLogEntry {
  action: AuditAction;
  entity: AuditEntity;
  entity_id?: string | number;
  actor_id?: string;
  actor_name: string;
  tenant_id?: string | null;
  detail?: Record<string, unknown>;
}

function isMissingColumnError(message: string): boolean {
  return /Could not find the .* column|schema cache|PGRST204/i.test(message);
}

/**
 * เขียน audit log หนึ่งแถว พร้อมบริบทมาตรฐานของ request (IP / browser / อุปกรณ์ / หน้า)
 *
 * จงใจไม่ throw: การบันทึก log ล้มเหลวต้องไม่ทำให้การลบ/แก้ข้อมูลของผู้ใช้พังตาม
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    const ctx = await getRequestAuditContext();
    const supabase = createAdminClient();
    const table = supabase.from(SC_AUDIT_TABLE as never) as unknown as {
      insert: (row: Record<string, unknown>) => PromiseLike<{
        error: { message: string; code?: string } | null;
      }>;
    };

    const detail = {
      ...(entry.detail ?? {}),
      ip: ctx.ip_address || undefined,
      browser: ctx.browser || undefined,
      device: ctx.device || undefined,
      page: ctx.page_path || undefined,
      user_agent: ctx.user_agent || undefined,
    };

    const row: Record<string, unknown> = {
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entity_id !== undefined ? String(entry.entity_id) : null,
      actor_id: entry.actor_id ?? null,
      actor_name: entry.actor_name || "ระบบ",
      detail,
      ip_address: ctx.ip_address || null,
      user_agent: ctx.user_agent || null,
      browser: ctx.browser || null,
      device: ctx.device || null,
      page_path: ctx.page_path || null,
    };
    if (entry.tenant_id) row.tenant_id = entry.tenant_id;

    const { error } = await table.insert(row);

    if (error && isMissingColumnError(error.message ?? "")) {
      const fallback: Record<string, unknown> = {
        action: row.action,
        entity: row.entity,
        entity_id: row.entity_id,
        actor_id: row.actor_id,
        actor_name: row.actor_name,
        detail,
      };
      if (entry.tenant_id) fallback.tenant_id = entry.tenant_id;
      const retry = await table.insert(fallback);
      if (retry.error) {
        console.error(
          `[audit] เขียน ${SC_AUDIT_TABLE} ไม่สำเร็จ (${entry.action} ${entry.entity} ${entry.entity_id ?? "-"}): ${retry.error.message}`
        );
      }
      return;
    }

    if (error) {
      const hint =
        error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "")
          ? ` — ยังไม่ได้รัน supabase/migrations/0011_sc_audit_logs_and_indexes.sql บนฐานข้อมูลนี้`
          : "";
      console.error(
        `[audit] เขียน ${SC_AUDIT_TABLE} ไม่สำเร็จ (${entry.action} ${entry.entity} ${entry.entity_id ?? "-"}): ${error.message}${hint}`
      );
    }
  } catch (err) {
    console.error("[audit] failed to write log:", err);
  }
}
