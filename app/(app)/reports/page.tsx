import { requireProfile, requireModuleView } from "@/lib/auth";
import { getActiveBranches, getSelectedBranchId } from "@/lib/branch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchMonthlyCogs, formatMonthLabel, resolveMonthRange } from "@/lib/reports";

const baht = (value: number) =>
  value.toLocaleString("th-TH", { style: "currency", currency: "THB" });

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const profile = await requireProfile();
  requireModuleView(profile, "reports");
  const branchId = await getSelectedBranchId(profile);

  const { from: fromRaw, to: toRaw } = await searchParams;
  const range = resolveMonthRange(fromRaw, toRaw);
  const { rows } = await fetchMonthlyCogs(range, branchId);

  // ต้องรู้ชื่อสาขาเฉพาะตอน Admin ดูรวมทุกสาขา — v_monthly_cogs คืนมาแค่ branch_id
  const branches = branchId ? [] : await getActiveBranches();
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  const total = rows.reduce((sum, row) => sum + Number(row.cogs ?? 0), 0);
  const exportHref = `/reports/export?from=${range.from}&to=${range.to}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ต้นทุนวัสดุที่ใช้ไป (COGS) รายเดือน</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* ฟอร์ม GET ธรรมดา — ช่วงเดือนอยู่ใน URL จึง bookmark/ส่งต่อลิงก์ได้ และไม่ต้องใช้ JS เลย */}
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from">ตั้งแต่เดือน</Label>
            <Input id="from" type="month" name="from" defaultValue={range.from} className="w-44" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="to">ถึงเดือน</Label>
            <Input id="to" type="month" name="to" defaultValue={range.to} className="w-44" />
          </div>
          <Button type="submit" variant="secondary">
            ดูรายงาน
          </Button>
          <a
            href={exportHref}
            className={cn(buttonVariants({ variant: "outline" }))}
            download
          >
            ดาวน์โหลด CSV
          </a>
        </form>

        {rows.length > 0 && (
          <p className="text-sm text-muted-foreground">
            รวมทั้งช่วง <span className="font-semibold text-foreground">{baht(total)}</span>
            {" · "}
            {rows.length} เดือนที่มีข้อมูล
            {branchId ? "" : " (รวมทุกสาขา)"}
          </p>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>เดือน</TableHead>
              {!branchId && <TableHead>สาขา</TableHead>}
              <TableHead className="text-right">ต้นทุนรวม</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.branch_id}-${row.month}`}>
                <TableCell>{formatMonthLabel(row.month)}</TableCell>
                {!branchId && <TableCell>{branchName.get(row.branch_id) ?? "—"}</TableCell>}
                <TableCell className="text-right">{baht(Number(row.cogs ?? 0))}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={branchId ? 2 : 3} className="text-center text-muted-foreground">
                  ไม่มีข้อมูลในช่วงเดือนที่เลือก
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
