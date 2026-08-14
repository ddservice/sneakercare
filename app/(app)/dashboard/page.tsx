import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { canSeeCost as roleCanSeeCost, canWrite } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MinStockForm } from "./min-stock-form";

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const canSeeCost = roleCanSeeCost(profile.role);
  const canEditMin = canWrite(profile.role, "dashboard");
  const branchId = await getSelectedBranchId(profile);

  let lowStockQuery = supabase.from("v_low_stock").select("*");
  let stockQuery = supabase.from("v_item_stock").select("*").eq("is_active", true).order("name");
  if (branchId) {
    lowStockQuery = lowStockQuery.eq("branch_id", branchId);
    stockQuery = stockQuery.eq("branch_id", branchId);
  }

  const topConsumedPromise = canSeeCost
    ? (async () => {
        let q = supabase.from("v_top_consumed_items_30d").select("*");
        if (branchId) q = q.eq("branch_id", branchId);
        return q;
      })()
    : (async () => {
        let q = supabase.from("v_top_consumed_qty_30d").select("*");
        if (branchId) q = q.eq("branch_id", branchId);
        return q;
      })();

  const [{ data: lowStock }, { data: topConsumed }, { data: inventoryValue }, { data: stockRows }] =
    await Promise.all([
      lowStockQuery,
      topConsumedPromise,
      canSeeCost
        ? (async () => {
            let q = supabase.from("v_inventory_value").select("*");
            if (branchId) q = q.eq("branch_id", branchId);
            return q;
          })()
        : Promise.resolve({ data: null }),
      stockQuery,
    ]);

  const totalValue = (inventoryValue ?? []).reduce((sum, row) => sum + Number(row.total_value ?? 0), 0);
  const needsBranch = profile.role === "admin" && !branchId && canEditMin;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">สินค้าที่ต้องสั่งซื้อด่วน</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{lowStock?.length ?? 0} รายการ</CardContent>
        </Card>
        {canSeeCost && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">มูลค่าคลังสินค้าปัจจุบัน</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {totalValue.toLocaleString("th-TH", { style: "currency", currency: "THB" })}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">เบิกใช้บ่อยสุด (30 วัน)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{topConsumed?.length ?? 0} รายการ</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>สินค้าใกล้หมด</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>สินค้า</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead className="text-right">คงเหลือ</TableHead>
                <TableHead className="text-right">ขั้นต่ำ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lowStock ?? []).map((row) => (
                <TableRow key={`${row.branch_id}-${row.item_id}`}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>
                    <Badge variant={row.item_type === "consumable" ? "secondary" : "outline"}>
                      {row.item_type === "consumable" ? "สิ้นเปลือง" : "คงคลัง"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-destructive">
                    {row.current_qty} {row.base_unit}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.min_stock_level} {row.base_unit}
                  </TableCell>
                </TableRow>
              ))}
              {(!lowStock || lowStock.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    ไม่มีสินค้าใกล้หมด
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ยอดคงเหลือและจุดสั่งซื้อขั้นต่ำ</CardTitle>
        </CardHeader>
        <CardContent>
          {needsBranch ? (
            <p className="text-sm text-muted-foreground">
              เลือกสาขาจากแถบด้านบนเพื่อแก้จุดสั่งซื้อขั้นต่ำ (ตอนนี้กำลังดูทุกสาขา)
            </p>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                {!branchId && <TableHead>สาขา</TableHead>}
                <TableHead>สินค้า</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead className="text-right">คงเหลือ</TableHead>
                <TableHead className={canEditMin ? "text-right" : "text-right"}>ขั้นต่ำ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(stockRows ?? []).map((row) => (
                <TableRow key={`${row.branch_id}-${row.item_id}`}>
                  {!branchId && <TableCell>{row.branch_name}</TableCell>}
                  <TableCell>{row.name}</TableCell>
                  <TableCell>
                    <Badge variant={row.item_type === "consumable" ? "secondary" : "outline"}>
                      {row.item_type === "consumable" ? "สิ้นเปลือง" : "คงคลัง"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.current_qty} {row.base_unit}
                  </TableCell>
                  <TableCell className="text-right">
                    {canEditMin && branchId ? (
                      <MinStockForm
                        itemId={row.item_id}
                        branchId={row.branch_id}
                        currentMin={row.min_stock_level}
                        unit={row.base_unit}
                      />
                    ) : (
                      `${row.min_stock_level} ${row.base_unit}`
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!stockRows || stockRows.length === 0) && (
                <TableRow>
                  <TableCell colSpan={branchId ? 4 : 5} className="text-center text-muted-foreground">
                    ยังไม่มียอดคงเหลือในสาขานี้ — รับของเข้าครั้งแรกเพื่อเปิดสต๊อก
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>เบิกใช้บ่อยที่สุด (30 วันล่าสุด)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>สินค้า</TableHead>
                <TableHead className="text-right">จำนวนที่เบิก</TableHead>
                {canSeeCost && <TableHead className="text-right">มูลค่ารวม</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(topConsumed ?? []).map((row) => (
                <TableRow key={`${row.branch_id}-${row.item_id}`}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="text-right">
                    {row.total_qty_used} {row.base_unit}
                  </TableCell>
                  {canSeeCost && (
                    <TableCell className="text-right">
                      {Number("total_cost_used" in row ? row.total_cost_used : 0).toLocaleString("th-TH", {
                        style: "currency",
                        currency: "THB",
                      })}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {(!topConsumed || topConsumed.length === 0) && (
                <TableRow>
                  <TableCell colSpan={canSeeCost ? 3 : 2} className="text-center text-muted-foreground">
                    ยังไม่มีข้อมูลการเบิกใช้ในช่วง 30 วันล่าสุด
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
