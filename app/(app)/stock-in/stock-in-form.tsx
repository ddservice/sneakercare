"use client";

import { useActionState } from "react";
import { createStockIn, type StockActionState } from "@/app/actions/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ItemOption = {
  id: string;
  name: string;
  purchase_unit: string;
};

export function StockInForm({ items, branchId }: { items: ItemOption[]; branchId: string }) {
  const [state, action, pending] = useActionState<StockActionState, FormData>(createStockIn, undefined);

  return (
    <form action={action} className="flex flex-col gap-4 max-w-md">
      <input type="hidden" name="branch_id" value={branchId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="item_id">สินค้า</Label>
        <Select name="item_id" required>
          <SelectTrigger id="item_id" className="w-full">
            <SelectValue placeholder="เลือกสินค้าที่รับเข้า" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name} (หน่วยซื้อ: {item.purchase_unit})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="purchase_qty">จำนวนที่ซื้อ (หน่วยซื้อ)</Label>
        <Input id="purchase_qty" name="purchase_qty" type="number" min="0" step="0.01" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="total_cost">ยอดที่จ่ายจริงทั้งหมด (บาท)</Label>
        <Input id="total_cost" name="total_cost" type="number" min="0" step="0.01" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reference_note">เลขที่ใบเสร็จ/ผู้ขาย (ถ้ามี)</Label>
        <Input id="reference_note" name="reference_note" />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-600">บันทึกรับของเข้าสำเร็จ</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "กำลังบันทึก..." : "บันทึกรับของเข้า"}
      </Button>
    </form>
  );
}
