"use client";

import { useActionState, useState } from "react";
import { createItem, updateItem, type ItemActionState } from "@/app/actions/items";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type ItemRow = {
  id: string;
  sku: string | null;
  name: string;
  item_type: "inventory" | "consumable";
  category: string;
  base_unit: string;
  purchase_unit: string;
  purchase_unit_qty: number;
  default_min_stock_level: number;
  is_active: boolean;
};

export function ItemForm({ item, trigger }: { item?: ItemRow; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const action = item ? updateItem : createItem;
  const [state, formAction, pending] = useActionState<ItemActionState, FormData>(action, undefined);

  // ปิด dialog อัตโนมัติเมื่อบันทึกสำเร็จ — ใช้ pattern "adjust state during render" ของ React แทน
  // useEffect เพราะแค่ react ต่อการเปลี่ยนค่า state ที่มาจาก action ไม่ใช่ sync กับระบบภายนอก
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.success) {
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "แก้ไขสินค้า" : "เพิ่มสินค้าใหม่"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {item && <input type="hidden" name="id" value={item.id} />}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 flex flex-col gap-2">
              <Label htmlFor="name">ชื่อสินค้า</Label>
              <Input id="name" name="name" defaultValue={item?.name} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="item_type">ประเภท</Label>
              <Select name="item_type" required defaultValue={item?.item_type ?? "consumable"}>
                <SelectTrigger id="item_type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inventory">สินค้าคงคลัง (Inventory)</SelectItem>
                  <SelectItem value="consumable">สินค้าสิ้นเปลือง (Consumable)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="category">หมวดหมู่</Label>
              <Input
                id="category"
                name="category"
                defaultValue={item?.category}
                placeholder="เช่น น้ำยาทำความสะอาด"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="base_unit">หน่วยฐาน (ตัดสต๊อก)</Label>
              <Input id="base_unit" name="base_unit" defaultValue={item?.base_unit} placeholder="ml, g, ชิ้น" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="purchase_unit">หน่วยที่ซื้อ</Label>
              <Input
                id="purchase_unit"
                name="purchase_unit"
                defaultValue={item?.purchase_unit}
                placeholder="ขวด, แพ็ค, ชิ้น"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="purchase_unit_qty">1 หน่วยซื้อ = กี่หน่วยฐาน</Label>
              <Input
                id="purchase_unit_qty"
                name="purchase_unit_qty"
                type="number"
                min="0.001"
                step="0.001"
                defaultValue={item?.purchase_unit_qty ?? 1}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="default_min_stock_level">จุดสั่งซื้อขั้นต่ำเริ่มต้น</Label>
              <Input
                id="default_min_stock_level"
                name="default_min_stock_level"
                type="number"
                min="0"
                step="0.01"
                defaultValue={item?.default_min_stock_level ?? 0}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sku">SKU (ถ้ามี)</Label>
              <Input id="sku" name="sku" defaultValue={item?.sku ?? ""} />
            </div>
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "กำลังบันทึก..." : item ? "บันทึกการแก้ไข" : "เพิ่มสินค้า"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
