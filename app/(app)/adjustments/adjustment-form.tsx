"use client";

import { useActionState } from "react";
import { createAdjustment, type StockActionState } from "@/app/actions/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ItemOption = { id: string; name: string; base_unit: string };

export function AdjustmentForm({
  items,
  branchId,
  requiresApproval,
}: {
  items: ItemOption[];
  branchId: string;
  requiresApproval: boolean;
}) {
  const [state, action, pending] = useActionState<StockActionState, FormData>(createAdjustment, undefined);

  return (
    <form action={action} className="flex flex-col gap-4 max-w-md">
      <input type="hidden" name="branch_id" value={branchId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="item_id">สินค้า</Label>
        <Select name="item_id" required>
          <SelectTrigger id="item_id" className="w-full">
            <SelectValue placeholder="เลือกสินค้าที่ต้องปรับปรุง" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="direction">ทิศทาง</Label>
        <Select name="direction" required defaultValue="decrease">
          <SelectTrigger id="direction" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="decrease">ปรับลด (นับได้น้อยกว่าระบบ)</SelectItem>
            <SelectItem value="increase">ปรับเพิ่ม (นับได้มากกว่าระบบ)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="qty">จำนวนที่ต่างไป</Label>
        <Input id="qty" name="qty" type="number" min="0" step="0.01" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reason">เหตุผล (บังคับกรอก)</Label>
        <Input id="reason" name="reason" required placeholder="เช่น ตรวจนับประจำเดือน พบของขาด" />
      </div>
      {requiresApproval && (
        <p className="text-xs text-muted-foreground">
          รายการนี้จะถูกส่งไปรออนุมัติจาก Admin ก่อน ยอดคงเหลือจะยังไม่เปลี่ยนจนกว่าจะอนุมัติ
        </p>
      )}
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-600">ส่งคำขอปรับปรุงสต๊อกสำเร็จ</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "กำลังบันทึก..." : "บันทึกการปรับปรุงสต๊อก"}
      </Button>
    </form>
  );
}
