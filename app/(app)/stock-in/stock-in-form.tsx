"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import { createStockIn, type StockActionState } from "@/app/actions/stock";
import { bangkokToday, purchaseTotals } from "@/lib/purchase-receipts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InventoryAlert, SegmentedControl, inventoryInput } from "@/components/inventory-shell";

type ItemOption = { id: string; name: string; purchase_unit: string; purchase_unit_qty: number; base_unit: string };
type Props = { items: ItemOption[]; branchId: string; initialRequestId: string };
const number = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 4 });

export function StockInForm(props: Props) {
  const [requestId, setRequestId] = useState(props.initialRequestId);
  return <PurchaseForm key={`${props.branchId}:${requestId}`} {...props} requestId={requestId} onNext={() => setRequestId(crypto.randomUUID())} />;
}

function PurchaseForm({ items, branchId, requestId, onNext }: Props & { requestId: string; onNext: () => void }) {
  const [state, action, pending] = useActionState<StockActionState, FormData>(createStockIn, undefined);
  const [isNew, setNew] = useState(items.length === 0);
  const [values, setValues] = useState<Record<string,string>>({
    item_id: '', new_item_name: '', new_item_category: 'บรรจุภัณฑ์', new_item_unit: 'ใบ', new_min_stock: '1',
    supplier_name: '', purchase_date: bangkokToday(), purchase_unit: 'แพ็ก', purchase_qty: '', units_per_pack: '1',
    goods_amount: '', shipping_amount: '0', discount_amount: '0', reference_note: '',
  });
  const update = (key: string, value: string) => setValues(v => ({ ...v, [key]: value }));
  const item = items.find(i => i.id === values.item_id);
  const baseUnit = isNew ? values.new_item_unit || 'หน่วยฐาน' : item?.base_unit || 'หน่วยฐาน';
  const totals = purchaseTotals(Number(values.purchase_qty), Number(values.units_per_pack), Number(values.goods_amount), Number(values.shipping_amount), Number(values.discount_amount));
  const field = (key: string, label: string, options: { type?: string; min?: string; step?: string; maxLength?: number; placeholder?: string; required?: boolean } = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input id={key} name={key} value={values[key]} onChange={e => update(key,e.target.value)} className={inventoryInput} required={options.required ?? true} {...options} />
    </div>
  );
  return (
    <form action={action} onReset={event => event.preventDefault()} className="space-y-5">
      <input type="hidden" name="branch_id" value={branchId} />
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="is_new_item" value={isNew ? 'true' : 'false'} />
      <p className="text-sm text-muted-foreground">ถุงต่างขนาด / วัสดุ / แบบ ให้แยกสินค้า เช่น “ถุงหูรูดผ้า 30×40 ซม.” ร้านหรือจำนวนต่อแพ็กเปลี่ยน ใช้สินค้าเดิมได้</p>
      <fieldset disabled={pending || state?.success} className="space-y-5 disabled:opacity-70">
        <legend className="sr-only">รายละเอียดซื้อเข้าคลัง</legend>
        <SegmentedControl value={isNew ? 'new' : 'existing'} onChange={v=>setNew(v==='new')} options={[{ value:'existing',label:'สินค้าเดิม' },{ value:'new',label:'เพิ่มสินค้าใหม่' }]} />
        {isNew ? <div className="space-y-4 rounded-xl border p-4">
          {field('new_item_name','ชื่อสินค้าและรูปแบบ', { maxLength:160,placeholder:'ถุงหูรูดผ้า สีดำ 30×40 ซม.' })}
          <div className="grid grid-cols-2 gap-3">
            {field('new_item_category','หมวดหมู่',{ maxLength:80 })}
            {field('new_item_unit','หน่วยนับในคลัง',{ maxLength:30,placeholder:'ใบ' })}
          </div>
          {field('new_min_stock','เตือนเมื่อเหลือต่ำกว่า / เท่ากับ',{ type:'number',min:'0',step:'0.001' })}
        </div> : <div className="space-y-1.5">
          <Label htmlFor="item_id">สินค้าที่รับเข้า</Label>
          <select id="item_id" name="item_id" required value={values.item_id} className="h-11 w-full rounded-md border bg-background px-3 text-sm" onChange={e=>{
            const selected = items.find(i=>i.id===e.target.value);
            setValues(v=>({ ...v,item_id:e.target.value,purchase_unit:selected?.purchase_unit || 'แพ็ก',units_per_pack:String(selected?.purchase_unit_qty || 1) }));
          }}>
            <option value="">เลือกสินค้าและแบบที่ตรงกัน</option>
            {items.map(i=><option key={i.id} value={i.id}>{i.name} · นับเป็น{i.base_unit}</option>)}
          </select>
        </div>}
        <div className="grid gap-3 sm:grid-cols-2">
          {field('supplier_name','ร้านค้า / ผู้ขาย',{ maxLength:160,placeholder:'ชื่อร้านเดียวกันใช้ชื่อเดิมทุกครั้ง' })}
          <div className="space-y-1.5"><Label htmlFor="purchase_date">วันที่ซื้อ</Label><Input id="purchase_date" name="purchase_date" type="date" required max={bangkokToday()} value={values.purchase_date} onChange={e=>update('purchase_date',e.target.value)} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {field('purchase_unit','หน่วยที่ซื้อ',{ maxLength:30,placeholder:'แพ็ก / ใบ' })}
          {field('purchase_qty','จำนวนที่ซื้อ',{ type:'number',min:'0.001',step:'0.001',placeholder:'2' })}
          {field('units_per_pack',`${baseUnit}ต่อ 1 ${values.purchase_unit || 'หน่วยซื้อ'}`,{ type:'number',min:'0.001',step:'0.001',placeholder:'100' })}
        </div>
        <p className="text-xs text-muted-foreground">แก้จำนวนต่อหน่วยซื้อได้ทุกครั้ง เช่น 2 แพ็ก × 100 ใบ = 200 ใบ · ถ้าซื้อเป็นใบ ให้ใส่ 1 ใบต่อหน่วยซื้อ</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {field('goods_amount','ค่าสินค้าก่อนส่วนลด (บาท)',{ type:'number',min:'0',step:'0.01' })}
          {field('shipping_amount','ค่าส่งของรายการนี้ (บาท)',{ type:'number',min:'0',step:'0.01' })}
          {field('discount_amount','ส่วนลด (บาท)',{ type:'number',min:'0',step:'0.01' })}
        </div>
        <p className="text-xs text-muted-foreground">ใช้ยอดรวมภาษีที่จ่ายจริง หากบิลมีหลายสินค้า ให้แบ่งค่าส่งให้แต่ละรายการก่อนบันทึก</p>
        {field('reference_note','เลขบิล / ลิงก์ร้าน / หมายเหตุ',{ maxLength:500,required:false })}
        <div className="rounded-xl border bg-muted/40 p-4 text-sm tabular-nums" aria-live="polite">
          <p>รับเข้าคลัง <strong>{number(totals.baseQuantity)} {baseUnit}</strong></p>
          <p>ยอดสุทธิรวมค่าส่ง <strong>{number(totals.paid)} บาท</strong></p>
          <p>ต้นทุนซื้อครั้งนี้ <strong>{number(totals.unitPrice)} บาท/{baseUnit}</strong></p>
        </div>
        <p className="text-xs text-muted-foreground">สต๊อกเพิ่ม ณ เวลาบันทึก วันที่ซื้อใช้วิเคราะห์ราคา · การรับเข้าไม่ได้ลงค่าใช้จ่ายหรือภาษีซื้ออัตโนมัติ</p>
        <Button type="submit" disabled={pending || state?.success} className="h-11 w-full">{pending ? 'กำลังบันทึก…' : 'บันทึกซื้อและเพิ่มเข้าคลัง'}</Button>
      </fieldset>
      {state?.error && <div role="alert"><InventoryAlert tone="error">{state.error}</InventoryAlert></div>}
      {state?.success && <div role="status" className="space-y-3">
        <InventoryAlert tone="success">บันทึกประวัติซื้อและเพิ่มสต๊อกแล้ว</InventoryAlert>
        <div className="flex flex-wrap gap-3"><Button type="button" onClick={onNext}>รับเข้ารายการถัดไป</Button><Link href="/stock-in/prices" className="inline-flex min-h-11 items-center text-sm underline">ดูประวัติและเปรียบเทียบร้าน</Link></div>
      </div>}
    </form>
  );
}
