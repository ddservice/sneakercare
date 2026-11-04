export type PurchaseData = {
  item_id: string; new_item_name: string; new_item_category: string; new_item_unit: string; new_min_stock: number;
  supplier_name: string; purchase_date: string; purchase_unit: string; purchase_qty: number; units_per_pack: number;
  goods_amount: number; shipping_amount: number; discount_amount: number; reference_note: string;
};

export function bangkokToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function purchaseTotals(qty: number, perPack: number, goods: number, shipping: number, discount: number) {
  const baseQuantity = qty * perPack;
  const paid = Math.round((goods + shipping - discount) * 100) / 100;
  return { baseQuantity, paid, unitPrice: baseQuantity > 0 ? paid / baseQuantity : 0 };
}

export function validatePurchase(data: PurchaseData, today = bangkokToday()): string | null {
  if (!data.item_id && (!data.new_item_name.trim() || data.new_item_name.length > 160)) return 'ชื่อสินค้า: ระบุชื่อและแบบถุงไม่เกิน 160 ตัวอักษร';
  if (!data.item_id && (!data.new_item_unit.trim() || data.new_item_unit.length > 30 || !data.new_item_category.trim() || data.new_item_category.length > 80)) return 'สินค้าใหม่: ระบุหน่วยฐานและหมวดหมู่ให้ครบ';
  if (!data.item_id && (!Number.isFinite(data.new_min_stock) || data.new_min_stock < 0 || data.new_min_stock > 999999999)) return 'จุดสั่งซื้อ: ต้องเป็นเลขตั้งแต่ 0 ถึง 999,999,999';
  if (!data.supplier_name.trim() || data.supplier_name.length > 160) return 'ร้านค้า: ระบุชื่อร้านไม่เกิน 160 ตัวอักษร';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.purchase_date) || !Number.isFinite(Date.parse(data.purchase_date)) || new Date(data.purchase_date).toISOString().slice(0,10) !== data.purchase_date || data.purchase_date > today) return 'วันที่ซื้อ: เลือกวันที่จริงที่ไม่เกินวันนี้';
  if (!data.purchase_unit.trim() || data.purchase_unit.length > 30) return 'หน่วยซื้อ: ระบุแพ็ก ขวด หรือหน่วยที่ซื้อ';
  if (![data.purchase_qty, data.units_per_pack].every(n => Number.isFinite(n) && n >= 0.001 && Math.abs(n*1000-Math.round(n*1000)) < 0.0001)) return 'จำนวน: ต้องตั้งแต่ 0.001 และทศนิยมไม่เกิน 3 ตำแหน่ง';
  const base = data.purchase_qty * data.units_per_pack;
  if (base > 999999999 || Math.abs(base * 1000 - Math.round(base * 1000)) > 0.0001) return 'จำนวนเข้าคลัง: ไม่เกิน 999,999,999 และทศนิยมไม่เกิน 3 ตำแหน่ง';
  if (data.units_per_pack > 999999999) return 'จำนวนต่อหน่วยซื้อ: ไม่เกิน 999,999,999';
  if (![data.goods_amount, data.shipping_amount, data.discount_amount].every(n => Number.isFinite(n) && n >= 0 && n <= 999999999 && Math.abs(n * 100 - Math.round(n * 100)) < 0.0001)) return 'ยอดเงิน: ใช้เลขตั้งแต่ 0 ถึง 999,999,999 ทศนิยมไม่เกิน 2 ตำแหน่ง';
  const { paid } = purchaseTotals(data.purchase_qty,data.units_per_pack,data.goods_amount,data.shipping_amount,data.discount_amount);
  if (paid < 0 || paid > 999999999) return 'ยอดสุทธิ: ส่วนลดต้องไม่เกินค่าสินค้ารวมค่าส่ง และยอดสุทธิต้องไม่เกิน 999,999,999';
  if (paid/base > 9999999999) return 'ต้นทุนต่อหน่วยสูงเกินขอบเขตคลัง กรุณาตรวจจำนวนและยอดเงิน';
  if (data.reference_note.length > 500) return 'หมายเหตุ: ไม่เกิน 500 ตัวอักษร';
  return null;
}

export type PurchaseReceipt = {
  id: string; branch_id: string; item_id: string; item_name: string; base_unit: string;
  purchase_date: string; supplier_name: string; purchase_unit: string;
  pack_count: number; units_per_pack: number; base_quantity: number;
  goods_amount: number; shipping_amount: number; discount_amount: number; paid_amount: number;
  reference_note: string; created_at: string; stock_transaction_id: string;
};

/** Compare one SKU only. Sum money / sum units, never average invoice prices. */
export function summarizePurchases(rows: readonly PurchaseReceipt[]) {
  if (new Set(rows.map(r => `${r.item_id}:${r.base_unit}`)).size > 1) throw new Error('เลือกสินค้าและหน่วยฐานเดียวก่อนเปรียบเทียบราคา');
  const ordered = [...rows].sort((a,b) => b.purchase_date.localeCompare(a.purchase_date) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const suppliers = new Map<string, { name: string; count: number; quantity: number; paid: number; latest: PurchaseReceipt }>();
  const months = new Map<string, { month: string; quantity: number; paid: number; min: number; max: number; count: number }>();
  for (const row of ordered) {
    const unit = row.paid_amount / row.base_quantity;
    const key = row.supplier_name.trim().normalize('NFKC').toLocaleLowerCase('th-TH').replace(/\s+/g, ' ');
    const supplier = suppliers.get(key) ?? { name: row.supplier_name, count: 0, quantity: 0, paid: 0, latest: row };
    supplier.count++; supplier.quantity += row.base_quantity; supplier.paid += row.paid_amount;
    suppliers.set(key,supplier);
    const month = row.purchase_date.slice(0,7);
    const bucket = months.get(month) ?? { month, quantity: 0, paid: 0, min: unit, max: unit, count: 0 };
    bucket.count++; bucket.quantity += row.base_quantity; bucket.paid += row.paid_amount;
    bucket.min = Math.min(bucket.min,unit); bucket.max = Math.max(bucket.max,unit);
    months.set(month,bucket);
  }
  // Free samples are retained in history but excluded from purchase recommendations.
  const ranked = [...suppliers.values()].map(s => ({ ...s, average: s.paid/s.quantity, latestPrice: s.latest.paid_amount/s.latest.base_quantity }))
    .sort((a,b) => a.latestPrice-b.latestPrice || b.latest.purchase_date.localeCompare(a.latest.purchase_date));
  return { suppliers: ranked, months: [...months.values()].sort((a,b)=>a.month.localeCompare(b.month)), best: ranked.find(s=>s.latestPrice > 0), latest: ordered[0] };
}
