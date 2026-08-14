"use client";

import { useActionState } from "react";
import { createWaste, type StockActionState } from "@/app/actions/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ItemOption = {
  id: string;
  name: string;
  base_unit: string;
  current_qty: number;
};

export function WasteForm({ items, branchId }: { items: ItemOption[]; branchId: string }) {
  const [state, action, pending] = useActionState<StockActionState, FormData>(createWaste, undefined);

  return (
    <form action={action} className="flex flex-col gap-4 max-w-md">
      <input type="hidden" name="branch_id" value={branchId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="waste_item_id">สินค้า</Label>
        <Select name="item_id" required>
          <SelectTrigger id="waste_item_id" className="w-full">
            <SelectValue placeholder="เลือกสินค้าที่เป็นของเสีย" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name} (คงเหลือ {item.current_qty} {item.base_unit})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="waste_qty">จำนวนที่ตัด (หน่วยฐาน)</Label>
        <Input id="waste_qty" name="qty" type="number" min="0" step="0.01" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="waste_reason">เหตุผล (บังคับกรอก)</Label>
        <Input id="waste_reason" name="reason" required placeholder="เช่น หมดอายุ / ทำหก" />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-600">บันทึกของเสียสำเร็จ</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "กำลังบันทึก..." : "บันทึกของเสีย"}
      </Button>
    </form>
  );
}
