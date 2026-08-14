import { requireProfile, requireModuleView } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ItemForm, type ItemRow } from "./item-form";
import { ToggleActiveButton } from "./toggle-active-button";

export default async function AdminItemsPage() {
  const profile = await requireProfile();
  requireModuleView(profile, "items");
  const canEdit = canWrite(profile.role, "items");

  const supabase = await createClient();
  const { data: items } = await supabase
    .from("items")
    .select(
      "id, sku, name, item_type, category, base_unit, purchase_unit, purchase_unit_qty, default_min_stock_level, is_active"
    )
    .order("name");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{canEdit ? "จัดการสินค้า" : "รายการสินค้า"}</CardTitle>
        {canEdit && <ItemForm trigger={<Button>+ เพิ่มสินค้าใหม่</Button>} />}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>สินค้า</TableHead>
              <TableHead>ประเภท</TableHead>
              <TableHead>หมวดหมู่</TableHead>
              <TableHead>หน่วยฐาน</TableHead>
              <TableHead>หน่วยซื้อ</TableHead>
              <TableHead className="text-right">อัตราแปลงหน่วย</TableHead>
              <TableHead className="text-right">ขั้นต่ำเริ่มต้น</TableHead>
              <TableHead>สถานะ</TableHead>
              {canEdit && <TableHead className="text-right">จัดการ</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(items ?? []).map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>
                  <Badge variant={item.item_type === "consumable" ? "secondary" : "outline"}>
                    {item.item_type === "consumable" ? "สิ้นเปลือง" : "คงคลัง"}
                  </Badge>
                </TableCell>
                <TableCell>{item.category}</TableCell>
                <TableCell>{item.base_unit}</TableCell>
                <TableCell>{item.purchase_unit}</TableCell>
                <TableCell className="text-right">
                  1 {item.purchase_unit} = {item.purchase_unit_qty} {item.base_unit}
                </TableCell>
                <TableCell className="text-right">
                  {item.default_min_stock_level} {item.base_unit}
                </TableCell>
                <TableCell>
                  <Badge variant={item.is_active ? "default" : "outline"}>
                    {item.is_active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                  </Badge>
                </TableCell>
                {canEdit && (
                  <TableCell className="flex justify-end gap-2">
                    <ItemForm item={item as ItemRow} trigger={<Button size="sm" variant="outline">แก้ไข</Button>} />
                    <ToggleActiveButton id={item.id} isActive={item.is_active} />
                  </TableCell>
                )}
              </TableRow>
            ))}
            {(!items || items.length === 0) && (
              <TableRow>
                <TableCell colSpan={canEdit ? 9 : 8} className="text-center text-muted-foreground">
                  {canEdit
                    ? "ยังไม่มีสินค้าในระบบ กด \"เพิ่มสินค้าใหม่\" เพื่อเริ่มต้น"
                    : "ยังไม่มีสินค้าในระบบ"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
