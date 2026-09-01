import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

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
 * Write an audit log entry.
 * Non-fatal: errors are caught and logged to console — never throw to caller.
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    const supabase = createAdminClient();
    await (supabase.from("audit_logs" as any) as any).insert({
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entity_id !== undefined ? String(entry.entity_id) : null,
      actor_id: entry.actor_id ?? null,
      actor_name: entry.actor_name,
      detail: entry.detail ?? null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    // Audit failure must never crash the main operation
    console.error("[audit] failed to write log:", err);
  }
}
