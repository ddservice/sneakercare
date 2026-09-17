import { requireProfile, requireModuleView } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { canSeeCost } from "@/lib/permissions";
import { TXN_TYPE_LABEL } from "@/lib/txn-labels";
import type { StockTxnType } from "@/lib/supabase/database.types";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/pagination";
import { DEFAULT_PAGE_SIZE, pageInfo, parsePage, rangeFor } from "@/lib/pagination";
import { CalendarRange } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { withId, text, num } from "@/lib/db-rows";
import { InventoryShell } from "@/components/inventory-shell";

type HistoryRow = {
  id: string;
  created_at: string;
  txn_type: string;
  status: string;
  quantity_delta: number;
  total_cost: number;
  reference_note: string | null;
  reason: string | null;
  item_name: string;
  base_unit: string;
  branch_name: string;
  performed_by_name: string;
};

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

  // ค่าจาก query string เป็นข้อความอิสระที่ใครก็พิมพ์อะไรมาก็ได้ — ตรวจกับรายการชนิดที่มีจริง
  // ก่อนเอาไปใส่ .eq() แทนการ cast ทับ (ค่ามั่วจะกลายเป็น "ไม่กรอง" แทนที่จะทำให้ query error)
  const rawTxnType = resolvedParams.txnType;
  const txnTypeFilter: StockTxnType | null =
    rawTxnType && rawTxnType !== "all" && rawTxnType in TXN_TYPE_LABEL
      ? (rawTxnType as StockTxnType)
      : null;

  // query ของหน้าที่กำลังดู
  let q = supabase
    .from("stock_transactions")
    .select(
      "id, created_at, txn_type, status, quantity_delta, total_cost, reference_note, reason, branch_id, items(name, base_unit), branches(name)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (branchId) q = q.eq("branch_id", branchId);
  if (txnTypeFilter) q = q.eq("txn_type", txnTypeFilter);
  if (startDate) q = q.gte("created_at", startDate);
  if (endDate) q = q.lte("created_at", endDate);

  // ยอดรวมของ "ทั้งช่วงเวลา" ไม่ใช่แค่หน้าที่กำลังดู — ดึงเฉพาะสองคอลัมน์ที่ต้องบวก
  // ก่อนหน้านี้การ์ดสรุปบวกจากแถวในหน้าเดียว แต่พาดหัวว่าเป็นยอดของทั้งช่วง = ตัวเลขผิด
  // ตัวกรองด้านล่างต้องเหมือน query ข้างบนเป๊ะ ไม่งั้นยอดรวมกับตารางจะไม่ตรงกัน
  const SUMMARY_CAP = 5000;
  let summaryQuery = supabase.from("stock_transactions").select("quantity_delta, total_cost");

  if (branchId) summaryQuery = summaryQuery.eq("branch_id", branchId);
  if (txnTypeFilter) summaryQuery = summaryQuery.eq("txn_type", txnTypeFilter);
  if (startDate) summaryQuery = summaryQuery.gte("created_at", startDate);
  if (endDate) summaryQuery = summaryQuery.lte("created_at", endDate);

  const [{ data: rawRows, count }, { data: summaryRows }] = await Promise.all([
    q.range(from, to),
    summaryQuery.limit(SUMMARY_CAP),
  ]);

  // view alias ทำให้ทุกคอลัมน์เป็น nullable — normalize ตรงนี้ครั้งเดียวแทนการ cast ทับ
  // (แถวที่ไม่มี id ใช้งานต่อไม่ได้อยู่แล้ว จึงถูก withId() กรองทิ้ง)
  const rows: HistoryRow[] = withId(rawRows).map((r) => ({
    id: r.id,
    created_at: text(r.created_at),
    txn_type: text(r.txn_type),
    status: text(r.status),
    quantity_delta: num(r.quantity_delta),
    total_cost: num(r.total_cost),
    reference_note: r.reference_note,
    reason: r.reason,
    item_name: r.items?.name || "สินค้าไม่ระบุชื่อ",
    base_unit: r.items?.base_unit || "ชิ้น",
    branch_name: r.branches?.name || "สาขาหลัก",
    performed_by_name: profile.display_name || "Admin",
  }));

  const info = pageInfo(page, DEFAULT_PAGE_SIZE, count ?? null, rows?.length ?? 0);

  // Period KPIs — คิดจากทุกแถวในช่วงเวลาที่เลือก ไม่ใช่แค่แถวในหน้านี้
  const summary = (summaryRows ?? []).map((r) => ({
    qty: Number(r.quantity_delta || 0),
    cost: Number(r.total_cost || 0),
  }));
  const totalStockIn = summary.filter((r) => r.qty > 0).reduce((acc, r) => acc + r.qty, 0);
  const totalStockOut = summary.filter((r) => r.qty < 0).reduce((acc, r) => acc + Math.abs(r.qty), 0);
  const totalCostPeriod = summary.reduce((acc, r) => acc + r.cost, 0);
  // ถ้าชนเพดานแปลว่ายอดรวมยังไม่ครบ ต้องบอกผู้ใช้ ไม่ใช่แสดงตัวเลขที่ขาดไปเฉยๆ
  const summaryTruncated = summary.length >= SUMMARY_CAP;

  return (
    <InventoryShell
      title="ประวัติคลัง"
      description={`ความเคลื่อนไหวสต๊อก ${count ?? 0} รายการ ในช่วงที่เลือก`}
      role={profile.role}
    >
      <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                <CalendarRange className="h-3.5 w-3.5" /> ช่วงเวลา
              </span>
              <Link href="/history?period=today">
                <Button
                  size="sm"
                  variant={period === "today" ? "default" : "outline"}
                  className="h-8 text-xs"
                >
                  วันนี้
                </Button>
              </Link>
              <Link href="/history?period=week">
                <Button
                  size="sm"
                  variant={period === "week" ? "default" : "outline"}
                  className="h-8 text-xs"
                >
                  สัปดาห์นี้
                </Button>
              </Link>
              <Link href="/history?period=month">
                <Button
                  size="sm"
                  variant={period === "month" ? "default" : "outline"}
                  className="h-8 text-xs"
                >
                  เดือนนี้
                </Button>
              </Link>
              <Link href="/history?period=all">
                <Button
                  size="sm"
                  variant={period === "all" ? "default" : "outline"}
                  className="h-8 text-xs"
                >
                  ทั้งหมด
                </Button>
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-slate-50 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                รับเข้า <span className="font-semibold tabular-nums text-emerald-700">+{totalStockIn}</span>
              </span>
              <span className="rounded-full bg-slate-50 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                เบิกใช้ <span className="font-semibold tabular-nums text-amber-700">−{totalStockOut}</span>
              </span>
              {showCost && (
                <span className="rounded-full bg-slate-50 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  ต้นทุน{" "}
                  <span className="font-semibold tabular-nums">
                    ฿{totalCostPeriod.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </span>
                </span>
              )}
              {summaryTruncated && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  ยอดรวมนับจาก {SUMMARY_CAP.toLocaleString("th-TH")} รายการล่าสุดเท่านั้น
                </span>
              )}
            </div>
          </div>
      </div>

      {/* ── Table ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:border-slate-800">
                <th className="px-4 py-3 font-medium">เวลา</th>
                <th className="px-3 py-3 font-medium">ประเภท</th>
                <th className="px-3 py-3 font-medium">สินค้า</th>
                <th className="px-3 py-3 text-right font-medium">จำนวน</th>
                {showCost && <th className="px-3 py-3 text-right font-medium">ต้นทุนรวม</th>}
                <th className="px-3 py-3 font-medium">เหตุผล / อ้างอิง</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={showCost ? 7 : 6} className="px-4 py-12 text-center text-slate-400">
                    ไม่พบความเคลื่อนไหวในช่วงเวลานี้
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const isPositive = r.quantity_delta > 0;
                  const isNegative = r.quantity_delta < 0;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-400">
                        {new Date(r.created_at).toLocaleString("th-TH", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          variant="outline"
                          className={
                            isPositive
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                              : isNegative
                                ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                          }
                        >
                          {TXN_TYPE_LABEL[r.txn_type as keyof typeof TXN_TYPE_LABEL] ?? r.txn_type}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900 dark:text-slate-100">{r.item_name}</td>
                      <td
                        className={`px-3 py-3 text-right tabular-nums whitespace-nowrap ${
                          isPositive
                            ? "font-medium text-emerald-600"
                            : isNegative
                              ? "font-medium text-rose-600"
                              : "text-slate-600"
                        }`}
                      >
                        {isPositive ? `+${r.quantity_delta}` : r.quantity_delta} {r.base_unit}
                      </td>
                      {showCost && (
                        <td className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                          {r.total_cost > 0
                            ? r.total_cost.toLocaleString("th-TH", { minimumFractionDigits: 2 })
                            : "—"}
                        </td>
                      )}
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-400">
                        <div>{r.reason || r.reference_note || "—"}</div>
                        {r.reference_note && r.reason && (
                          <div className="text-xs text-slate-400">อ้างอิง: {r.reference_note}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            r.status === "pending_approval"
                              ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                              : r.status === "rejected"
                                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                          }
                        >
                          {statusLabel(r.status)}
                        </Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ส่ง params ไปด้วย ไม่งั้นกด "ถัดไป" แล้วช่วงเวลา/ประเภทที่เลือกไว้หลุดกลับเป็นค่า default */}
      <Pagination
        info={info}
        basePath="/history"
        params={{
          period: resolvedParams.period,
          txnType: resolvedParams.txnType,
          startDate: resolvedParams.startDate,
          endDate: resolvedParams.endDate,
        }}
      />
      </div>
    </InventoryShell>
  );
}
