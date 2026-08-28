import { requireProfile, requireModuleView } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { DEFAULT_PAGE_SIZE, pageInfo, parsePage, rangeFor } from "@/lib/pagination";

function summarize(data: Record<string, unknown> | null): string {
  if (!data) return "—";
  const skip = new Set(["updated_at", "created_at", "id"]);
  const parts = Object.entries(data)
    .filter(([key]) => !skip.has(key))
    .slice(0, 6)
    .map(([key, value]) => `${key}=${value === null ? "null" : String(value)}`);
  return parts.join(" · ") || "—";
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const profile = await requireProfile();
  requireModuleView(profile, "audit");
  const supabase = await createClient();

  const page = parsePage((await searchParams).page);
  const { from, to } = rangeFor(page);

  const { data: rows, count } = await supabase
    .from("audit_logs")
    .select(
      "id, table_name, record_id, action, performed_at, performed_by, before_data, after_data, reason",
      { count: "exact" }
    )
    .order("performed_at", { ascending: false })
    .range(from, to);

  const info = pageInfo(page, DEFAULT_PAGE_SIZE, count ?? null, rows?.length ?? 0);

  const actorIds = [...new Set((rows ?? []).map((row) => row.performed_by).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", actorIds)
    : { data: [] };
  const actorName = new Map((actors ?? []).map((actor) => [actor.id, actor.display_name]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Log (อ่านอย่างเดียว — แก้หรือลบไม่ได้)</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>เวลา</TableHead>
              <TableHead>ตาราง</TableHead>
              <TableHead>การกระทำ</TableHead>
              <TableHead>ผู้ทำ</TableHead>
              <TableHead>สรุป</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap">
                  {new Date(row.performed_at).toLocaleString("th-TH")}
                </TableCell>
                <TableCell>{row.table_name}</TableCell>
                <TableCell>
                  <Badge variant={row.action === "DELETE" ? "destructive" : "outline"}>{row.action}</Badge>
                </TableCell>
                <TableCell>
                  {row.performed_by ? actorName.get(row.performed_by) ?? "—" : "ระบบ"}
                </TableCell>
                <TableCell className="max-w-xl truncate" title={summarize(row.after_data ?? row.before_data)}>
                  {row.reason ? `${row.reason} · ` : ""}
                  {summarize(row.after_data ?? row.before_data)}
                </TableCell>
              </TableRow>
            ))}
            {(!rows || rows.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {page > 1 ? "ไม่มีบันทึกในหน้านี้แล้ว" : "ยังไม่มีบันทึก"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <Pagination info={info} basePath="/admin/audit" />
      </CardContent>
    </Card>
  );
}
