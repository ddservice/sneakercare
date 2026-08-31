import { requireProfile, requireModuleView } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { canSeeCost } from "@/lib/permissions";
import { TXN_TYPE_LABEL } from "@/lib/txn-labels";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { DEFAULT_PAGE_SIZE, pageInfo, parsePage, rangeFor } from "@/lib/pagination";
import {
  History,
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  Scale,
  CalendarRange,
  Search,
  Filter,
  ArrowLeft,
  Calendar,
} from "lucide-react";
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
  searchParams: Promise<{
    page?: string;
    period?: string;
    startDate?: string;
    endDate?: string;
    txnType?: string;
  }>;
}) {
  const profile = await requireProfile();
  requireModuleView(profile, "history");
  const branchId = await getSelectedBranchId(profile);
  const showCost = canSeeCost(profile.role);
  const supabase = await createClient();

  const resolvedParams = await searchParams;
  const page = parsePage(resolvedParams.page);
  const { from, to } = rangeFor(page);

  const period = resolvedParams.period || "month";
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Compute period date filters
  let startDate = resolvedParams.startDate;
  let endDate = resolvedParams.endDate;

  if (period === "today") {
    startDate = todayStr + "T00:00:00.000Z";
    endDate = todayStr + "T23:59:59.999Z";
  } else if (period === "week") {
    const day = now.getDay();
    const diff = (day + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    startDate = monday.toISOString().slice(0, 10) + "T00:00:00.000Z";
    endDate = todayStr + "T23:59:59.999Z";
  } else if (period === "month") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    startDate = monthStart.toISOString().slice(0, 10) + "T00:00:00.000Z";
    endDate = todayStr + "T23:59:59.999Z";
  } else if (period === "custom" && startDate && endDate) {
    startDate = startDate + "T00:00:00.000Z";
    endDate = endDate + "T23:59:59.999Z";
  }

  let q = supabase
    .from("stock_transactions")
    .select(
      "id, created_at, txn_type, status, quantity_delta, total_cost, reference_note, reason, branch_id, items(name, base_unit), branches(name)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (branchId) q = q.eq("branch_id", branchId);
  if (resolvedParams.txnType && resolvedParams.txnType !== "all") {
    q = q.eq("txn_type", resolvedParams.txnType);
  }
  if (startDate) q = q.gte("created_at", startDate);
  if (endDate) q = q.lte("created_at", endDate);

  const { data: rawRows, count } = await q.range(from, to);

  const rows = (rawRows || []).map((r: any) => ({
    id: r.id,
    created_at: r.created_at,
    txn_type: r.txn_type,
    status: r.status,
    quantity_delta: Number(r.quantity_delta || 0),
    total_cost: Number(r.total_cost || 0),
    reference_note: r.reference_note,
    reason: r.reason,
    item_name: r.items?.name || "สินค้าไม่ระบุชื่อ",
    base_unit: r.items?.base_unit || "ชิ้น",
    branch_name: r.branches?.name || "สาขาหลัก",
    performed_by_name: profile.display_name || "Admin",
  }));

  const info = pageInfo(page, DEFAULT_PAGE_SIZE, count ?? null, rows?.length ?? 0);

  // Period KPIs
  const totalStockIn = rows
    .filter((r) => r.quantity_delta > 0)
    .reduce((acc, r) => acc + r.quantity_delta, 0);
  const totalStockOut = rows
    .filter((r) => r.quantity_delta < 0)
    .reduce((acc, r) => acc + Math.abs(r.quantity_delta), 0);
  const totalCostPeriod = rows.reduce((acc, r) => acc + (r.total_cost || 0), 0);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <History className="h-5 w-5 text-teal-700" />
            ประวัติการเบิก-รับ-ปรับสต๊อก (Inventory Ledger)
          </h2>
          <p className="text-xs text-slate-500">
            บันทึกประวัติการเปลี่ยนแปลงสต๊อกสินค้าทั้งหมด {count ?? 0} รายการ (เลือกดูย้อนหลังได้ทุกช่วงเวลา)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/stock-out">
            <Button size="sm" className="bg-teal-700 hover:bg-teal-800 text-white text-xs gap-1.5 h-8.5">
              <ArrowUpFromLine className="h-3.5 w-3.5" /> เบิกใช้งาน
            </Button>
          </Link>
          <Link href="/stock-in">
            <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8.5">
              <ArrowDownToLine className="h-3.5 w-3.5" /> รับของเข้า
            </Button>
          </Link>
          <Link href="/inventory">
            <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8.5">
              <Boxes className="h-3.5 w-3.5" /> หน้าคลังสินค้า
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Period View Selector Toolbar ── */}
      <Card className="border-teal-200 bg-teal-50/40 shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-teal-950 flex items-center gap-1 mr-1">
                <CalendarRange className="h-3.5 w-3.5 text-teal-700" /> ช่วงเวลา:
              </span>
              <Link href="/history?period=today">
                <Button
                  size="sm"
                  variant={period === "today" ? "default" : "outline"}
                  className={`h-8 text-xs font-bold ${
                    period === "today" ? "bg-teal-700 text-white" : "bg-white text-slate-700"
                  }`}
                >
                  🗓️ วันนี้
                </Button>
              </Link>
              <Link href="/history?period=week">
                <Button
                  size="sm"
                  variant={period === "week" ? "default" : "outline"}
                  className={`h-8 text-xs font-bold ${
                    period === "week" ? "bg-teal-700 text-white" : "bg-white text-slate-700"
                  }`}
                >
                  📅 สัปดาห์นี้
                </Button>
              </Link>
              <Link href="/history?period=month">
                <Button
                  size="sm"
                  variant={period === "month" ? "default" : "outline"}
                  className={`h-8 text-xs font-bold ${
                    period === "month" ? "bg-teal-700 text-white" : "bg-white text-slate-700"
                  }`}
                >
                  📆 เดือนนี้
                </Button>
              </Link>
              <Link href="/history?period=all">
                <Button
                  size="sm"
                  variant={period === "all" ? "default" : "outline"}
                  className={`h-8 text-xs font-bold ${
                    period === "all" ? "bg-teal-700 text-white" : "bg-white text-slate-700"
                  }`}
                >
                  🌐 ภาพรวมทั้งหมด
                </Button>
              </Link>
            </div>

            {/* Quick Summary Pills */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="rounded-md bg-white px-2.5 py-1 border border-teal-200 shadow-2xs">
                <span className="text-slate-500">รับเข้า: </span>
                <span className="font-bold text-emerald-700 font-mono">+{totalStockIn} หน่วย</span>
              </div>
              <div className="rounded-md bg-white px-2.5 py-1 border border-teal-200 shadow-2xs">
                <span className="text-slate-500">เบิกใช้: </span>
                <span className="font-bold text-amber-700 font-mono">-{totalStockOut} หน่วย</span>
              </div>
              {showCost && (
                <div className="rounded-md bg-teal-900 text-white px-2.5 py-1 shadow-2xs">
                  <span className="text-teal-200">มูลค่าต้นทุน: </span>
                  <span className="font-bold font-mono">
                    {totalCostPeriod.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Table ── */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-3">
          <CardTitle className="text-sm font-bold text-slate-800">
            รายการความเคลื่อนไหวสต๊อกสินค้า
          </CardTitle>
          <CardDescription className="text-xs">
            ประวัติบัญชีคลังสินค้า Ledger ที่มีหลักฐานเชื่อมโยง
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
                {showCost && <TableHead className="text-xs text-right">ต้นทุนรวม (฿)</TableHead>}
                <TableHead className="text-xs">เหตุผล / อ้างอิง</TableHead>
                <TableHead className="text-xs">สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs divide-y divide-slate-100">
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={showCost ? 7 : 6} className="text-center py-8 text-slate-400">
                    ไม่พบข้อมูลความเคลื่อนไหวในช่วงเวลานี้
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const isPositive = r.quantity_delta > 0;
                  const isNegative = r.quantity_delta < 0;
                  return (
                    <TableRow key={r.id} className="hover:bg-slate-50/80">
                      <TableCell className="font-mono text-slate-600 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString("th-TH", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            isPositive
                              ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                              : isNegative
                              ? "bg-amber-50 text-amber-700 border-amber-300"
                              : "bg-slate-50 text-slate-700 border-slate-300"
                          }`}
                        >
                          {TXN_TYPE_LABEL[r.txn_type as keyof typeof TXN_TYPE_LABEL] ?? r.txn_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">{r.item_name}</TableCell>
                      <TableCell
                        className={`text-right font-mono font-bold whitespace-nowrap ${
                          isPositive
                            ? "text-emerald-600"
                            : isNegative
                            ? "text-rose-600"
                            : "text-slate-600"
                        }`}
                      >
                        {isPositive ? `+${r.quantity_delta}` : r.quantity_delta} {r.base_unit}
                      </TableCell>
                      {showCost && (
                        <TableCell className="text-right font-mono font-semibold text-slate-800">
                          {r.total_cost > 0
                            ? r.total_cost.toLocaleString("th-TH", { minimumFractionDigits: 2 })
                            : "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-slate-600">
                        <div>{r.reason || r.reference_note || "—"}</div>
                        {r.reference_note && r.reason && (
                          <div className="text-[10px] text-slate-400">อ้างอิง: {r.reference_note}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            r.status === "pending_approval"
                              ? "bg-amber-100 text-amber-800 border-amber-300"
                              : r.status === "rejected"
                              ? "bg-rose-100 text-rose-800 border-rose-300"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }
                        >
                          {statusLabel(r.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pagination info={info} />
    </div>
  );
}
