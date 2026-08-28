import { requireProfile, requireModuleView } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { canSeeCost } from "@/lib/permissions";
import { TXN_TYPE_LABEL } from "@/lib/txn-labels";
import type { StockTxnType } from "@/lib/supabase/database.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { DEFAULT_PAGE_SIZE, pageInfo, parsePage, rangeFor } from "@/lib/pagination";

function statusLabel(status: string) {
  if (status === "pending_approval") return "รออนุมัติ";
  if (status === "rejected") return "ปฏิเสธ";
  return "อนุมัติแล้ว";
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const profile = await requireProfile();
  requireModuleView(profile, "history");
  const branchId = await getSelectedBranchId(profile);
  const showCost = canSeeCost(profile.role);
  const supabase = await createClient();

  const page = parsePage((await searchParams).page);
  const { from, to } = rangeFor(page);

  // สองสาขานี้ต่างกันแค่ view ที่ยิงกับคอลัมน์ต้นทุน — Staff ต้องไม่แตะ v_*_cost เด็ดขาด
  const { data: rows, count } = showCost
    ? await (async () => {
        let q = supabase
          .from("v_stock_transactions_cost")
          .select(
            "id, created_at, txn_type, status, quantity_delta, total_cost, reference_note, reason, item_name, branch_name, performed_by_name, branch_id",
            { count: "exact" }
          )
          .order("created_at", { ascending: false })
          .range(from, to);
        if (branchId) q = q.eq("branch_id", branchId);
        return q;
      })()
    : await (async () => {
        let q = supabase
          .from("v_stock_transactions")
          .select(
            "id, created_at, txn_type, status, quantity_delta, reference_note, reason, item_name, branch_name, performed_by_name, branch_id",
            { count: "exact" }
          )
          .order("created_at", { ascending: false })
          .range(from, to);
        if (branchId) q = q.eq("branch_id", branchId);
        return q;
      })();

  const info = pageInfo(page, DEFAULT_PAGE_SIZE, count ?? null, rows?.length ?? 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>ประวัติเบิก-รับ-ปรับสต๊อก</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>เวลา</TableHead>
              {!branchId && <TableHead>สาขา</TableHead>}
              <TableHead>ประเภท</TableHead>
              <TableHead>สินค้า</TableHead>
              <TableHead className="text-right">จำนวน</TableHead>
              {showCost && <TableHead className="text-right">ต้นทุน</TableHead>}
              <TableHead>อ้างอิง / เหตุผล</TableHead>
              <TableHead>ผู้ทำ</TableHead>
              <TableHead>สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap">
                  {new Date(row.created_at).toLocaleString("th-TH")}
                </TableCell>
                {!branchId && <TableCell>{row.branch_name}</TableCell>}
                <TableCell>{TXN_TYPE_LABEL[row.txn_type as StockTxnType] ?? row.txn_type}</TableCell>
                <TableCell>{row.item_name}</TableCell>
                <TableCell className="text-right">{row.quantity_delta}</TableCell>
                {showCost && (
                  <TableCell className="text-right">
                    {Number("total_cost" in row ? row.total_cost : 0).toLocaleString("th-TH", {
                      style: "currency",
                      currency: "THB",
                    })}
                  </TableCell>
                )}
                <TableCell className="max-w-56 truncate" title={row.reason ?? row.reference_note ?? ""}>
                  {row.reason || row.reference_note || "—"}
                </TableCell>
                <TableCell>{row.performed_by_name}</TableCell>
                <TableCell>
                  <Badge variant={row.status === "approved" ? "default" : "outline"}>
                    {statusLabel(row.status)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {(!rows || rows.length === 0) && (
              <TableRow>
                <TableCell colSpan={showCost ? (branchId ? 8 : 9) : branchId ? 7 : 8} className="text-center text-muted-foreground">
                  {page > 1 ? "ไม่มีรายการในหน้านี้แล้ว" : "ยังไม่มีรายการ"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <Pagination info={info} basePath="/history" />
      </CardContent>
    </Card>
  );
}
