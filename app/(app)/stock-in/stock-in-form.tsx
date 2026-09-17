"use client";

import { useState, useActionState } from "react";
import { createStockIn, type StockActionState } from "@/app/actions/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, CheckCircle2, Package, Boxes } from "lucide-react";
import {
  InventoryAlert,
  SegmentedControl,
  inventoryFieldLabel,
  inventoryInput,
} from "@/components/inventory-shell";

type ItemOption = {
  id: string;
  name: string;
  purchase_unit: string;
};

export function StockInForm({ items, branchId }: { items: ItemOption[]; branchId: string }) {
  const [state, action, pending] = useActionState<StockActionState, FormData>(createStockIn, undefined);
  const [isNewItem, setIsNewItem] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="branch_id" value={branchId} />
      <input type="hidden" name="is_new_item" value={isNewItem ? "true" : "false"} />

      <SegmentedControl
        value={isNewItem ? "new" : "existing"}
        onChange={(v) => setIsNewItem(v === "new")}
        options={[
          {
            value: "existing",
            label: `สินค้าที่มีอยู่ (${items.length})`,
            icon: <Boxes className="h-3.5 w-3.5" />,
          },
          {
            value: "new",
            label: "เพิ่มสินค้าใหม่",
            icon: <PlusCircle className="h-3.5 w-3.5" />,
          },
        ]}
      />

      {!isNewItem ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="item_id" className={inventoryFieldLabel}>
            สินค้าที่รับเข้า <span className="text-rose-500">*</span>
          </Label>
          <Select name="item_id" required={!isNewItem}>
            <SelectTrigger id="item_id" className={`w-full ${inventoryInput}`}>
              <SelectValue placeholder={`เลือกจาก ${items.length} รายการ`} />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {items.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} ({item.purchase_unit})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
            <Package className="h-4 w-4 text-emerald-600" />
            สินค้านี้จะถูกเพิ่มเข้าแคตตาล็อกอัตโนมัติ
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new_item_name" className={inventoryFieldLabel}>
              ชื่อสินค้า <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="new_item_name"
              name="new_item_name"
              placeholder="เช่น น้ำยาขจัดคราบ, กาวซ่อมพื้นรองเท้า"
              required={isNewItem}
              className={`${inventoryInput} bg-white dark:bg-slate-900`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new_item_category" className={inventoryFieldLabel}>
                หมวดหมู่
              </Label>
              <Input
                id="new_item_category"
                name="new_item_category"
                defaultValue="อุปกรณ์ทำความสะอาด"
                placeholder="น้ำยา, อะไหล่, บรรจุภัณฑ์"
                className={`${inventoryInput} bg-white dark:bg-slate-900`}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new_item_unit" className={inventoryFieldLabel}>
                หน่วยซื้อ
              </Label>
              <Input
                id="new_item_unit"
                name="new_item_unit"
                defaultValue="ขวด"
                placeholder="ขวด, ชิ้น, มล."
                className={`${inventoryInput} bg-white dark:bg-slate-900`}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new_min_stock" className={inventoryFieldLabel}>
              จุดสั่งซื้อขั้นต่ำ
            </Label>
            <Input
              id="new_min_stock"
              name="new_min_stock"
              type="number"
              min="0"
              defaultValue="1"
              className={`${inventoryInput} bg-white dark:bg-slate-900`}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="purchase_qty" className={inventoryFieldLabel}>
            จำนวนที่ซื้อ <span className="text-rose-500">*</span>
          </Label>
          <Input
            id="purchase_qty"
            name="purchase_qty"
            type="number"
            min="0"
            step="0.01"
            placeholder="1"
            required
            className={inventoryInput}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="total_cost" className={inventoryFieldLabel}>
            ยอดที่จ่ายจริง (บาท) <span className="text-rose-500">*</span>
          </Label>
          <Input
            id="total_cost"
            name="total_cost"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            required
            className={`${inventoryInput} font-mono`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reference_note" className={inventoryFieldLabel}>
          ใบเสร็จ / ผู้ขาย / หมายเหตุ
        </Label>
        <Input
          id="reference_note"
          name="reference_note"
          placeholder="เช่น บิลร้านเคมีภัณฑ์ #1234"
          className={inventoryInput}
        />
      </div>

      {state?.error && <InventoryAlert tone="error">{state.error}</InventoryAlert>}
      {state?.success && (
        <InventoryAlert tone="success">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            รับของเข้าสต๊อกแล้ว
          </span>
        </InventoryAlert>
      )}

      <Button type="submit" disabled={pending} className="h-11 text-sm font-semibold">
        {pending ? "กำลังบันทึก..." : isNewItem ? "สร้างสินค้าและรับเข้าสต๊อก" : "บันทึกรับของเข้า"}
      </Button>
    </form>
  );
}
