"use client";

import { useActionState } from "react";
import { createWaste, type StockActionState } from "@/app/actions/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2 } from "lucide-react";
import {
  InventoryAlert,
  inventoryFieldLabel,
  inventoryInput,
} from "@/components/inventory-shell";

type ItemOption = {
  id: string;
  name: string;
  base_unit: string;
  current_qty: number;
};

export function WasteForm({ items, branchId }: { items: ItemOption[]; branchId: string }) {
  const [state, action, pending] = useActionState<StockActionState, FormData>(createWaste, undefined);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="branch_id" value={branchId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="waste_item_id" className={inventoryFieldLabel}>
          สินค้า <span className="text-rose-500">*</span>
        </Label>
        <Select name="item_id" required>
          <SelectTrigger id="waste_item_id" className={`w-full ${inventoryInput}`}>
            <SelectValue placeholder="เลือกสินค้าที่เป็นของเสีย" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name} · คงเหลือ {item.current_qty} {item.base_unit}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="waste_qty" className={inventoryFieldLabel}>
          จำนวนที่ตัด (หน่วยฐาน) <span className="text-rose-500">*</span>
        </Label>
        <Input id="waste_qty" name="qty" type="number" min="0" step="0.01" required className={inventoryInput} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="waste_reason" className={inventoryFieldLabel}>
          เหตุผล <span className="text-rose-500">*</span>
        </Label>
        <Input
          id="waste_reason"
          name="reason"
          required
          placeholder="เช่น หมดอายุ / ทำหก"
          className={inventoryInput}
        />
      </div>
      {state?.error && <InventoryAlert tone="error">{state.error}</InventoryAlert>}
      {state?.success && (
        <InventoryAlert tone="success">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            ตัดของเสียแล้ว
          </span>
        </InventoryAlert>
      )}
      <Button type="submit" disabled={pending} className="h-11 text-sm font-semibold">
        {pending ? "กำลังบันทึก..." : "บันทึกของเสีย"}
      </Button>
    </form>
  );
}
