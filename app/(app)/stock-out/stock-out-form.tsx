"use client";

import { useActionState } from "react";
import { createStockOut, type StockActionState } from "@/app/actions/stock";
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

export function StockOutForm({ items, branchId }: { items: ItemOption[]; branchId: string }) {
  const [state, action, pending] = useActionState<StockActionState, FormData>(createStockOut, undefined);

  return (
    <form action={action} className="flex flex-col gap-4 max-w-md">
      <input type="hidden" name="branch_id" value={branchId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="item_id">สินค้า</Label>
        <Select name="item_id" required>
          <SelectTrigger id="item_id" className="w-full">
            <SelectValue placeholder="เลือกสินค้าที่จะเบิก" />
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
        <Label htmlFor="qty">จำนวนที่เบิก</Label>
        <Input id="qty" name="qty" type="number" min="0" step="0.01" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reference_note">เลขบิล/ออเดอร์ (ถ้ามี)</Label>
        <Input id="reference_note" name="reference_note" placeholder="เช่น เลขบิล #1234" />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-600">บันทึกการเบิกใช้งานสำเร็จ</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "กำลังบันทึก..." : "บันทึกการเบิกใช้งาน"}
      </Button>
    </form>
  );
}
