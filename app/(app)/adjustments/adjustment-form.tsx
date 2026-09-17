"use client";

import { useActionState, useState } from "react";
import { createAdjustment, type StockActionState } from "@/app/actions/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2 } from "lucide-react";
import {
  InventoryAlert,
  SegmentedControl,
  inventoryFieldLabel,
  inventoryInput,
} from "@/components/inventory-shell";

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
  const [direction, setDirection] = useState("decrease");

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="branch_id" value={branchId} />
      <input type="hidden" name="direction" value={direction} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="item_id" className={inventoryFieldLabel}>
          สินค้า <span className="text-rose-500">*</span>
        </Label>
        <Select name="item_id" required>
          <SelectTrigger id="item_id" className={`w-full ${inventoryInput}`}>
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
        <Label className={inventoryFieldLabel}>ทิศทาง</Label>
        <SegmentedControl
          value={direction}
          onChange={setDirection}
          options={[
            { value: "decrease", label: "ปรับลด" },
            { value: "increase", label: "ปรับเพิ่ม" },
          ]}
        />
        <p className="text-xs text-slate-500">
          {direction === "decrease"
            ? "นับได้น้อยกว่าในระบบ — จะตัดสต๊อกลง"
            : "นับได้มากกว่าในระบบ — จะเพิ่มสต๊อก"}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="qty" className={inventoryFieldLabel}>
          จำนวนที่ต่างไป <span className="text-rose-500">*</span>
        </Label>
        <Input id="qty" name="qty" type="number" min="0" step="0.01" required className={inventoryInput} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reason" className={inventoryFieldLabel}>
          เหตุผล <span className="text-rose-500">*</span>
        </Label>
        <Input
          id="reason"
          name="reason"
          required
          placeholder="เช่น ตรวจนับประจำเดือน พบของขาด"
          className={inventoryInput}
        />
      </div>
      {requiresApproval && (
        <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          รายการนี้จะรอ Admin อนุมัติก่อน ยอดคงเหลือยังไม่เปลี่ยนจนกว่าจะอนุมัติ
        </p>
      )}
      {state?.error && <InventoryAlert tone="error">{state.error}</InventoryAlert>}
      {state?.success && (
        <InventoryAlert tone="success">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            ส่งคำขอปรับปรุงสต๊อกแล้ว
          </span>
        </InventoryAlert>
      )}
      <Button type="submit" disabled={pending} className="h-11 text-sm font-semibold">
        {pending ? "กำลังบันทึก..." : "บันทึกการตรวจนับ"}
      </Button>
    </form>
  );
}
