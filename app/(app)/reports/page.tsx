import { requireProfile, requireModuleView } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function ReportsPage() {
  const profile = await requireProfile();
  requireModuleView(profile, "reports");
  const branchId = await getSelectedBranchId(profile);

  const supabase = await createClient();
  let query = supabase.from("v_monthly_cogs").select("*").order("month", { ascending: false }).limit(12);
  if (branchId) {
    query = query.eq("branch_id", branchId);
  }
  const { data: rows } = await query;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ต้นทุนวัสดุที่ใช้ไป (COGS) รายเดือน</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>เดือน</TableHead>
              <TableHead className="text-right">ต้นทุนรวม</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).map((row) => (
              <TableRow key={`${row.branch_id}-${row.month}`}>
                <TableCell>
                  {new Date(row.month).toLocaleDateString("th-TH", { year: "numeric", month: "long" })}
                </TableCell>
                <TableCell className="text-right">
                  {Number(row.cogs).toLocaleString("th-TH", { style: "currency", currency: "THB" })}
                </TableCell>
              </TableRow>
            ))}
            {(!rows || rows.length === 0) && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  ยังไม่มีข้อมูล
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
