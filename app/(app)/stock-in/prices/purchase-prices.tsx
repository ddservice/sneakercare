"use client";
import { useState } from 'react';
import Link from 'next/link';
import { summarizePurchases, type PurchaseReceipt } from '@/lib/purchase-receipts';
const num = (n: number) => n.toLocaleString('th-TH',{ maximumFractionDigits:4 });
const day = (d: string) => new Date(`${d}T00:00:00+07:00`).toLocaleDateString('th-TH',{ timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric' });

export function PurchasePrices({ rows }: { rows: PurchaseReceipt[] }) {
  const key = (r: PurchaseReceipt) => `${r.item_id}:${r.base_unit}`;
  const items = [...new Map(rows.map(r=>[key(r),r])).values()];
  const [selection,setSelection] = useState('');
  const itemId = items.some(i=>key(i)===selection) ? selection : items[0] ? key(items[0]) : '';
  const filtered = rows.filter(r=>key(r)===itemId);
  const summary = summarizePurchases(filtered);
  const unit = filtered[0]?.base_unit || 'หน่วย';
  const best = summary.best;
  if (!rows.length) return <div className="space-y-3 rounded-xl border p-6">
    <h2 className="font-semibold">ยังไม่มีประวัติซื้อในช่วงนี้</h2>
    <p className="text-sm text-muted-foreground">เริ่มบันทึกถุงรองเท้า โดยใช้หน่วยฐานเป็น “ใบ” แล้วเก็บร้านค้าและจำนวนต่อแพ็กทุกครั้ง ประวัติเก่าที่ไม่มีข้อมูลร้านแยกช่องจะไม่ถูกนำมาเดาราคา</p>
    <Link href="/stock-in" className="inline-flex min-h-11 items-center text-sm underline">บันทึกการซื้อครั้งแรก</Link>
  </div>;
  return <div className="space-y-6">
    <div className="space-y-2"><label htmlFor="price-item" className="text-sm font-medium">เลือกสินค้าและรูปแบบที่ต้องการเทียบ</label>
      <select id="price-item" value={itemId} onChange={e=>setSelection(e.target.value)} className="block h-11 w-full max-w-xl rounded-md border bg-background px-3 text-sm">{items.map(i=><option key={key(i)} value={key(i)}>{i.item_name} · {i.base_unit}</option>)}</select>
    </div>
    {best && <section className="space-y-2 rounded-xl border bg-muted/40 p-5" aria-label="ร้านที่ราคาซื้อล่าสุดต่ำสุด">
      <p className="text-sm text-muted-foreground">ร้านที่ราคาซื้อล่าสุดต่ำสุดในช่วงที่เลือก</p>
      <h2 className="text-xl font-semibold">{best.name} · <span className="tabular-nums">{num(best.latestPrice)}</span> บาท/{unit}</h2>
      <p className="text-sm">ซื้อเมื่อ {day(best.latest.purchase_date)} จำนวน {num(best.latest.base_quantity)} {unit} · มีประวัติ {best.count} ครั้ง</p>
      <p className="text-xs text-muted-foreground">เป็นราคาที่เคยซื้อจริง รวมค่าส่งและส่วนลด ควรสอบถามราคาใหม่สำหรับจำนวนที่จะสั่ง และพิจารณาคุณภาพก่อนซื้อ · ไม่นำรายการได้ฟรีมาแนะนำ</p>
    </section>}
    <section className="space-y-3"><h2 className="font-semibold">เทียบร้านค้า · บาท/{unit}</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{summary.suppliers.map(s=><article key={s.name} className="space-y-2 rounded-xl border p-4 text-sm tabular-nums">
        <h3 className="font-semibold">{s.name}</h3><p>ครั้งล่าสุด <strong>{num(s.latestPrice)}</strong> บาท/{unit}</p>
        <p>เฉลี่ยถ่วงตามจำนวน <strong>{num(s.average)}</strong> บาท/{unit}</p>
        <p className="text-muted-foreground">{s.count} ครั้ง · {num(s.quantity)} {unit} · {num(s.paid)} บาท</p>
        <p className="text-xs text-muted-foreground">ล่าสุด {day(s.latest.purchase_date)} · {num(s.latest.base_quantity)} {unit}</p>
      </article>)}</div>
    </section>
    <section className="space-y-3"><h2 className="font-semibold">ราคาแต่ละเดือน · บาท/{unit}</h2>
      <p className="text-sm text-muted-foreground">ค่าเฉลี่ย = ยอดสุทธิทั้งหมด ÷ จำนวน{unit}ทั้งหมดในเดือนนั้น</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summary.months.map(m=><article key={m.month} className="space-y-1 rounded-xl border p-4 text-sm tabular-nums">
        <h3 className="font-medium">{new Date(`${m.month}-01T00:00:00+07:00`).toLocaleDateString('th-TH',{ timeZone:'Asia/Bangkok',month:'long',year:'numeric' })}</h3>
        <p>เฉลี่ย <strong>{num(m.paid/m.quantity)}</strong></p><p className="text-muted-foreground">ต่ำสุด {num(m.min)} · สูงสุด {num(m.max)}</p><p className="text-xs text-muted-foreground">{m.count} ครั้ง · {num(m.quantity)} {unit}</p>
      </article>)}</div>
    </section>
    <section className="space-y-3"><h2 className="font-semibold">ประวัติซื้อ {filtered.length} ครั้ง</h2>
      <div className="grid gap-3 lg:grid-cols-2">{filtered.map(r=><article key={r.id} className="space-y-2 rounded-xl border p-4 text-sm tabular-nums">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{r.supplier_name}</h3><span className="text-muted-foreground">{day(r.purchase_date)}</span></div>
        <p>{num(r.pack_count)} {r.purchase_unit} × {num(r.units_per_pack)} {unit} = <strong>{num(r.base_quantity)} {unit}</strong></p>
        <p>สินค้า {num(r.goods_amount)} + ส่ง {num(r.shipping_amount)} − ลด {num(r.discount_amount)} = <strong>{num(r.paid_amount)} บาท</strong></p>
        <p>ราคา <strong>{num(r.paid_amount/r.base_quantity)} บาท/{unit}</strong></p>
        {r.reference_note && <p className="break-words text-muted-foreground">{r.reference_note}</p>}
      </article>)}</div>
    </section>
  </div>;
}
