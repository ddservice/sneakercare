"use client";

import { useState, useActionState } from "react";
import { createStockIn, type StockActionState } from "@/app/actions/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, CheckCircle2, Package, Boxes } from "lucide-react";

type ItemOption = {
  id: string;
  name: string;
  purchase_unit: string;
};

export function StockInForm({ items, branchId }: { items: ItemOption[]; branchId: string }) {
  const [state, action, pending] = useActionState<StockActionState, FormData>(createStockIn, undefined);
  const [isNewItem, setIsNewItem] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-5 max-w-lg">
      <input type="hidden" name="branch_id" value={branchId} />
      <input type="hidden" name="is_new_item" value={isNewItem ? "true" : "false"} />

      {/* Mode Switcher */}
      <div className="flex rounded-lg bg-slate-100 p-1 border border-slate-200">
        <button
          type="button"
          onClick={() => setIsNewItem(false)}
          className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            !isNewItem ? "bg-white text-teal-800 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Boxes className="h-3.5 w-3.5" />
          เลือกสินค้าที่มีในระบบ ({items.length})
        </button>
        <button
          type="button"
          onClick={() => setIsNewItem(true)}
          className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            isNewItem ? "bg-emerald-500 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <PlusCircle className="h-3.5 w-3.5" />
          + เพิ่มสินค้าใหม่เข้าระบบ
        </button>
      </div>

      {!isNewItem ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="item_id" className="text-xs font-bold text-slate-700">
            เลือกสินค้าที่รับเข้า <span className="text-rose-500">*</span>
          </Label>
          <Select name="item_id" required={!isNewItem}>
            <SelectTrigger id="item_id" className="w-full text-xs h-9">
              <SelectValue placeholder="เลือกสินค้าจากรายการ 46 รายการ..." />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {items.map((item) => (
                <SelectItem key={item.id} value={item.id} className="text-xs">
                  {item.name} ({item.purchase_unit})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-4 space-y-3.5">
          <div className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
            <Package className="h-4 w-4 text-teal-700" />
            ข้อมูลสินค้าใหม่ (จะบันทึกเข้าแคตตาล็อกสินค้าอัตโนมัติ)
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new_item_name" className="text-xs font-semibold text-slate-700">
              ชื่อสินค้า / น้ำยา <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="new_item_name"
              name="new_item_name"
              placeholder="เช่น น้ำยาขจัดคราบฝังลึกสูตรพิเศษ, กาวซ่อมพื้นรองเท้า..."
              required={isNewItem}
              className="text-xs h-9 bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new_item_category" className="text-xs font-semibold text-slate-700">
                หมวดหมู่
              </Label>
              <Input
                id="new_item_category"
                name="new_item_category"
                defaultValue="อุปกรณ์ทำความสะอาด"
                placeholder="เช่น อุปกรณ์ทำความสะอาด, สีและเคมีภัณฑ์"
                className="text-xs h-9 bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new_item_unit" className="text-xs font-semibold text-slate-700">
                หน่วยนับ / หน่วยซื้อ
              </Label>
              <Input
                id="new_item_unit"
                name="new_item_unit"
                defaultValue="ขวด"
                placeholder="ขวด, ชิ้น, มล., แกลลอน, กก."
                className="text-xs h-9 bg-white"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new_min_stock" className="text-xs font-semibold text-slate-700">
              จุดแจ้งเตือนสั่งซื้อขั้นต่ำ (Min Stock)
            </Label>
            <Input
              id="new_min_stock"
              name="new_min_stock"
              type="number"
              min="0"
              defaultValue="1"
              className="text-xs h-9 bg-white"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="purchase_qty" className="text-xs font-bold text-slate-700">
            จำนวนที่ซื้อ <span className="text-rose-500">*</span>
          </Label>
          <Input
            id="purchase_qty"
            name="purchase_qty"
            type="number"
            min="0"
            step="0.01"
            placeholder="เช่น 1, 5, 10"
            required
            className="text-xs h-9"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="total_cost" className="text-xs font-bold text-slate-700">
            ยอดที่จ่ายจริงทั้งหมด (บาท) <span className="text-rose-500">*</span>
          </Label>
          <Input
            id="total_cost"
            name="total_cost"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            required
            className="text-xs h-9 font-mono"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reference_note" className="text-xs font-semibold text-slate-700">
          เลขที่ใบเสร็จ / ร้านค้าผู้ขาย / หมายเหตุ
        </Label>
        <Input
          id="reference_note"
          name="reference_note"
          placeholder="เช่น บิลร้านเคมีภัณฑ์ #1234 หรือ ซื้อจาก Shopee"
          className="text-xs h-9"
        />
      </div>

      {state?.error && <p className="text-xs font-bold text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">{state.error}</p>}
      {state?.success && (
        <p className="text-xs font-bold text-emerald-700 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          บันทึกรับของเข้าและอัปเดตสต๊อกสินค้าสำเร็จเรียบร้อย
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="bg-teal-700 hover:bg-emerald-600 text-white text-xs h-10 font-bold shadow-xs"
      >
        {pending ? "กำลังบันทึก..." : isNewItem ? "+ สร้างสินค้าใหม่และรับเข้าสต๊อก" : "บันทึกรับของเข้า"}
      </Button>
    </form>
  );
}
