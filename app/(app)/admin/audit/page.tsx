import { requireProfile, requireModuleView } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SC_AUDIT_TABLE } from "@/lib/audit";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { DEFAULT_PAGE_SIZE, pageInfo, parsePage, rangeFor } from "@/lib/pagination";
import { ShieldAlert, Trash2, Edit, Plus, Upload, Download, LogIn, LogOut, AlertTriangle } from "lucide-react";

/**
 * Audit Log — ระบบนี้มี "สองสาย" ที่แยกกันโดยเจตนา ห้ามรวมเข้าด้วยกัน
 *
 *  1. app  → ตาราง sc_audit_logs : การกระทำของผู้ใช้ในแอปฝั่งการเงิน/ยอดขาย/เงินเดือน
 *            เขียนโดย lib/audit.ts (service_role) — ไม่มี trigger รองรับเหตุการณ์พวกนี้
 *  2. inv  → view audit_logs (→ inv_audit_logs) : ledger ของคลังสินค้า
 *            เขียนโดย DB trigger fn_write_audit_log เท่านั้น ตามกฎข้อ 1 ใน CLAUDE.md
 *
 * ทั้งคู่ append-only: sc_audit_logs มี trigger กัน UPDATE/DELETE (migration 0011)
 */

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

/**
 * รูปร่างขั้นต่ำของ PostgREST query builder เท่าที่หน้านี้ใช้
 * มีไว้เพื่อไม่ต้องโปรย `any` ทั่วไฟล์เวลาคุยกับตารางที่ยังไม่อยู่ใน database.types.ts
 */
type PostgrestLike<Row> = {
  select: (
    columns: string,
    options?: { count?: "exact" }
  ) => PostgrestLike<Row>;
  order: (column: string, options?: { ascending?: boolean }) => PostgrestLike<Row>;
  range: (from: number, to: number) => PostgrestLike<Row>;
  eq: (column: string, value: string) => PostgrestLike<Row>;
  then: <R>(
    onfulfilled: (value: {
      data: Row[] | null;
      count: number | null;
      error: { message: string; code?: string } | null;
    }) => R
  ) => Promise<R>;
};

type Source = "app" | "inv";

/** แถวจาก sc_audit_logs — ตารางนี้เพิ่งสร้างใน migration 0011 จึงยังไม่อยู่ใน database.types.ts */
type ScAuditRow = {
  id: number;
  action: string;
  entity: string;
  entity_id: string | null;
  actor_name: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};

type AuditRow = {
  key: string;
  at: string;
  action: string;
  entityLabel: string;
  entityId: string | null;
  actor: string;
  detail: string;
};

const ACTION_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  DELETE: { label: "ลบ",       color: "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300",           Icon: Trash2   },
  UPDATE: { label: "แก้ไข",    color: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",       Icon: Edit     },
  CREATE: { label: "สร้าง",    color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300", Icon: Plus   },
  INSERT: { label: "สร้าง",    color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300", Icon: Plus   },
  IMPORT: { label: "นำเข้า",   color: "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300",               Icon: Upload   },
  EXPORT: { label: "ส่งออก",   color: "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300",   Icon: Download },
  LOGIN:  { label: "เข้าระบบ", color: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300",          Icon: LogIn    },
  LOGOUT: { label: "ออกระบบ",  color: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300",          Icon: LogOut   },
};

const ENTITY_LABEL: Record<string, string> = {
  daily_sale:        "ยอดขายรายวัน",
  ar_payment:        "รับชำระ AR",
  expense:           "ค่าใช้จ่าย",
  payroll:           "เงินเดือน",
  inventory_item:    "สินค้าคลัง",
  stock_transaction: "รายการสต๊อก",
  user:              "ผู้ใช้งาน",
  document:          "เอกสาร",
  roster_employee:   "พนักงาน",
  settings:          "ตั้งค่า",
};

/** ตัดค่าที่ยาวเกินให้พออ่านในตาราง โดยยังเห็นเต็มได้ที่ title ของ cell */
function short(value: unknown): string {
  const text =
    value === null || value === undefined
      ? "null"
      : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  return text.length > 60 ? text.slice(0, 57) + "…" : text;
}

function formatDetail(detail: Record<string, unknown> | null, limit = 6): string {
  if (!detail || typeof detail !== "object") return "—";
  const entries = Object.entries(detail);
  if (entries.length === 0) return "—";
  const shown = entries.slice(0, limit).map(([k, v]) => `${k}: ${short(v)}`).join(" · ");
  return entries.length > limit ? `${shown} · (+${entries.length - limit})` : shown;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; entity?: string; source?: string }>;
}) {
  const profile = await requireProfile();
  requireModuleView(profile, "audit");

  const params = await searchParams;
  const source: Source = params.source === "inv" ? "inv" : "app";
  const page = parsePage(params.page);
  const { from, to } = rangeFor(page, PAGE_SIZE);

  const supabase = createAdminClient();

  let rows: AuditRow[] = [];
  let count: number | null = null;
  let loadError: string | null = null;
  let migrationMissing = false;

  if (source === "app") {
    // ต้อง cast เพราะ sc_audit_logs ยังไม่ถูก generate ลง database.types.ts
    let q = (supabase.from(SC_AUDIT_TABLE as never) as unknown as PostgrestLike<ScAuditRow>)
      .select("id, action, entity, entity_id, actor_name, detail, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (params.action) q = q.eq("action", params.action.toUpperCase());
    if (params.entity) q = q.eq("entity", params.entity);

    const { data, count: c, error } = await q;
    if (error) {
      loadError = error.message;
      migrationMissing =
        error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
    } else {
      count = c ?? null;
      rows = (data ?? []).map((r) => ({
        key: `app-${r.id}`,
        at: r.created_at,
        action: r.action,
        entityLabel: ENTITY_LABEL[r.entity] ?? r.entity,
        entityId: r.entity_id,
        actor: r.actor_name || "ระบบ",
        detail: formatDetail(r.detail),
      }));
    }
  } else {
    let q = supabase
      .from("audit_logs")
      .select(
        "id, table_name, record_id, action, performed_by, performed_at, before_data, after_data, reason",
        { count: "exact" }
      )
      .order("performed_at", { ascending: false })
      .range(from, to);

    // action ในตารางนี้เป็น enum ของ Postgres — ค่าที่มาจาก URL ต้อง cast ก่อน
    if (params.action) q = q.eq("action", params.action.toUpperCase() as never);
    if (params.entity) q = q.eq("table_name", params.entity);

    const { data, count: c, error } = await q;
    if (error) {
      loadError = error.message;
    } else {
      count = c ?? null;
      const actorIds = [...new Set((data ?? []).map((r) => r.performed_by).filter(Boolean))] as string[];
      const { data: actors } = actorIds.length
        ? await supabase.from("profiles").select("id, display_name").in("id", actorIds)
        : { data: [] };
      const actorName = new Map((actors ?? []).map((a) => [a.id, a.display_name]));

      rows = (data ?? []).map((r) => ({
        key: `inv-${r.id}`,
        at: r.performed_at,
        action: r.action,
        entityLabel: r.table_name,
        entityId: r.record_id,
        actor: r.performed_by ? actorName.get(r.performed_by) ?? "—" : "ระบบ (trigger)",
        detail:
          (r.reason ? `${r.reason} · ` : "") +
          formatDetail((r.after_data ?? r.before_data) as Record<string, unknown> | null),
      }));
    }
  }

  const info = pageInfo(page, PAGE_SIZE, count, rows.length);
  const totalCount = count ?? 0;

  // เก็บตัวกรองไว้ตอนเปลี่ยนหน้า — ไม่งั้นกด "ถัดไป" แล้วตัวกรองหลุดเงียบๆ
  const carriedParams = {
    source: source === "inv" ? "inv" : undefined,
    action: params.action,
    entity: params.entity,
  };

  const filters =
    source === "app"
      ? [
          { label: "ทั้งหมด",   href: "/admin/audit" },
          { label: "ลบ",        href: "/admin/audit?action=DELETE" },
          { label: "แก้ไข",     href: "/admin/audit?action=UPDATE" },
          { label: "สร้าง",     href: "/admin/audit?action=CREATE" },
          { label: "ยอดขาย",    href: "/admin/audit?entity=daily_sale" },
          { label: "ค่าใช้จ่าย", href: "/admin/audit?entity=expense" },
          { label: "เงินเดือน",  href: "/admin/audit?entity=payroll" },
          { label: "AR",        href: "/admin/audit?entity=ar_payment" },
        ]
      : [
          { label: "ทั้งหมด", href: "/admin/audit?source=inv" },
          { label: "ลบ",      href: "/admin/audit?source=inv&action=DELETE" },
          { label: "แก้ไข",   href: "/admin/audit?source=inv&action=UPDATE" },
          { label: "สร้าง",   href: "/admin/audit?source=inv&action=INSERT" },
          { label: "สต๊อก",   href: "/admin/audit?source=inv&entity=inv_stock_transactions" },
          { label: "สินค้า",  href: "/admin/audit?source=inv&entity=inv_items" },
        ];

  const activeFilterHref = (() => {
    const base = source === "inv" ? "/admin/audit?source=inv" : "/admin/audit";
    const sep = source === "inv" ? "&" : "?";
    if (params.action) return `${base}${sep}action=${params.action}`;
    if (params.entity) return `${base}${sep}entity=${params.entity}`;
    return base;
  })();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            Audit Log
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            บันทึกการแก้ไข/ลบข้อมูลสำคัญ — อ่านอย่างเดียว ฐานข้อมูลมี trigger กัน UPDATE/DELETE ไว้อีกชั้น
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            {totalCount.toLocaleString("th-TH")}
          </span>
          <span>รายการทั้งหมด</span>
        </div>
      </div>

      {/* เลือกสายของ log */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
        {[
          { key: "app", label: "การเงิน / ยอดขาย (แอป)", href: "/admin/audit" },
          { key: "inv", label: "คลังสินค้า (DB trigger)", href: "/admin/audit?source=inv" },
        ].map((t) => (
          <a
            key={t.key}
            href={t.href}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              source === t.key
                ? "bg-emerald-500 text-white border-emerald-500"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      {/* ยังไม่ได้รัน migration 0011 */}
      {migrationMissing && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700/60 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">ยังไม่ได้สร้างตาราง {SC_AUDIT_TABLE} ในฐานข้อมูลนี้</p>
              <p>
                การกระทำฝั่งการเงินจึงยัง <strong>ไม่ถูกบันทึก</strong> — เปิด Supabase SQL Editor แล้วรัน{" "}
                <code className="font-mono">supabase/migrations/0011_sc_audit_logs_and_indexes.sql</code>{" "}
                หนึ่งครั้ง จากนั้นรีเฟรชหน้านี้
              </p>
              <p className="text-xs opacity-80">
                ระหว่างนี้ log ฝั่งคลังสินค้า (เขียนโดย DB trigger) ยังดูได้ตามปกติที่แท็บ &ldquo;คลังสินค้า
                (DB trigger)&rdquo;
              </p>
            </div>
          </div>
        </div>
      )}

      {loadError && !migrationMissing && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-700/60 px-4 py-3 text-sm text-rose-800 dark:text-rose-200">
          โหลด audit log ไม่สำเร็จ: <span className="font-mono">{loadError}</span>
        </div>
      )}

      {/* Quick filter pills */}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <a
            key={f.href}
            href={f.href}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              f.href === activeFilterHref
                ? "bg-emerald-500 text-white border-emerald-500"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            {f.label}
          </a>
        ))}
      </div>

      {/* Table */}
      <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3 w-40">เวลา</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3 w-24">Action</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3 w-40">ประเภท</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3 w-32">ผู้ดำเนินการ</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3">รายละเอียด</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-slate-400 dark:text-slate-500">
                      {loadError
                        ? "ไม่สามารถแสดงข้อมูลได้"
                        : page > 1
                        ? "ไม่มีบันทึกในหน้านี้แล้ว"
                        : "ยังไม่มีบันทึก Audit Log"}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const cfg = ACTION_CONFIG[row.action] ?? {
                      label: row.action,
                      color: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
                      Icon: ShieldAlert,
                    };
                    const ActionIcon = cfg.Icon;
                    return (
                      <TableRow
                        key={row.key}
                        className="border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <TableCell className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono">
                          {new Date(row.at).toLocaleString("th-TH", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>

                        <TableCell className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
                            <ActionIcon className="h-3 w-3" />
                            {cfg.label}
                          </span>
                        </TableCell>

                        <TableCell className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                          <div className="font-medium">{row.entityLabel}</div>
                          {row.entityId && (
                            <div className="text-slate-400 dark:text-slate-500 font-mono text-[10px] truncate max-w-[9rem]">
                              ID: {row.entityId}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                          {row.actor}
                        </TableCell>

                        <TableCell
                          className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 max-w-md"
                          title={row.detail}
                        >
                          <span className="truncate block">{row.detail}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">
            <Pagination info={info} basePath="/admin/audit" params={carriedParams} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
