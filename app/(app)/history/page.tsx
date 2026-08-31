import { requireProfile, requireModuleView } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { canSeeCost } from "@/lib/permissions";
import { TXN_TYPE_LABEL } from "@/lib/txn-labels";
import type { StockTxnType } from "@/lib/supabase/database.types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { DEFAULT_PAGE_SIZE, pageInfo, parsePage, rangeFor } from "@/lib/pagination";
import { History, Boxes, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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

  let q = supabase
    .from("stock_transactions")
    .select(
      "id, created_at, txn_type, status, quantity_delta, total_cost, reference_note, reason, branch_id, items(name, base_unit), branches(name)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (branchId) q = q.eq("branch_id", branchId);

  const { data: rawRows, count } = await q;

  const rows = (rawRows || []).map((r: any) => ({
    id: r.id,
    created_at: r.created_at,
    txn_type: r.txn_type,
    status: r.status,
    quantity_delta: r.quantity_delta,
    total_cost: r.total_cost,
    reference_note: r.reference_note,
    reason: r.reason,
    item_name: r.items?.name || "สินค้าไม่ระบุชื่อ",
    base_unit: r.items?.base_unit || "ชิ้น",
    branch_name: r.branches?.name || "สาขาหลัก",
    performed_by_name: profile.display_name || "Admin",
  }));

  const info = pageInfo(page, DEFAULT_PAGE_SIZE, count ?? null, rows?.length ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <History className="h-5 w-5 text-teal-700" />
            ประวัติการเบิก-รับ-ปรับสต๊อก (Inventory Ledger)
          </h2>
          <p className="text-xs text-slate-500">
            บันทึกประวัติการเปลี่ยนแปลงสต๊อกสินค้าทั้งหมด {count ?? 0} รายการ
          </p>
        </div>
        <Link href="/inventory">
          <Button variant="outline" size="sm" className="text-xs gap-1.5">
            <Boxes className="h-3.5 w-3.5" /> กลับไปหน้าคลังสินค้า
          </Button>
        </Link>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-3">
          <CardTitle className="text-sm font-bold text-slate-800">
            ตารางรายการเบิก-รับ-ปรับปรุงสต๊อก
          </CardTitle>
          <CardDescription className="text-xs">
            ประวัติบัญชีคลังสินค้า Ledger ย้อนหลัง
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50 border-b border-slate-200">
              <TableRow>
                <TableHead className="text-xs">เวลา</TableHead>
                <TableHead className="text-xs">ประเภท</TableHead>
                <TableHead className="text-xs">สินค้า</TableHead>
                <TableHead className="text-xs text-right">จำนวน</TableHead>
                {showCost && <TableHead className="text-xs text-right">ต้นทุนรวม</TableHead>}
                <TableHead className="text-xs">อ้างอิง / หมายเหตุ</TableHead>
                <TableHead className="text-xs text-center">สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100 text-xs">
              {(rows ?? []).map((row) => (
                <TableRow key={row.id} className="hover:bg-slate-50/80">
                  <TableCell className="whitespace-nowrap font-mono text-[11px] text-slate-600">
                    {new Date(row.created_at).toLocaleString("th-TH")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] font-semibold">
                      {TXN_TYPE_LABEL[row.txn_type as StockTxnType] ?? row.txn_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-semibold text-slate-800">
                    {row.item_name}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">
                    <span className={row.quantity_delta > 0 ? "text-emerald-600" : "text-rose-600"}>
                      {row.quantity_delta > 0 ? `+${row.quantity_delta}` : row.quantity_delta} {row.base_unit}
                    </span>
                  </TableCell>
                  {showCost && (
                    <TableCell className="text-right font-mono font-semibold text-teal-800">
                      {row.total_cost !== null && row.total_cost !== undefined
                        ? `฿${Number(row.total_cost).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </TableCell>
                  )}
                  <TableCell className="max-w-56 truncate text-slate-500" title={row.reason ?? row.reference_note ?? ""}>
                    {row.reason || row.reference_note || "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={row.status === "approved" ? "default" : "outline"} className="text-[10px]">
                      {statusLabel(row.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(!rows || rows.length === 0) && (
                <TableRow>
                  <TableCell colSpan={showCost ? 7 : 6} className="text-center py-8 text-slate-400">
                    {page > 1 ? "ไม่มีรายการในหน้านี้แล้ว" : "ยังไม่มีรายการประวัติ"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="p-4 border-t border-slate-100">
            <Pagination info={info} basePath="/history" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
