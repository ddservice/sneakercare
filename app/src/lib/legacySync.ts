import { supabase } from './supabase';

/**
 * ระบบเดิม (sneakercare_dashboard.html) ยังอ่านต้นทุนวัสดุคลังจาก sc_stock_transactions/sc_stock_status
 * ไม่ใช่ inv_* — ระหว่างที่สองระบบรันคู่กันอยู่ (migration ยังไม่เสร็จ) ต้อง dual-write แบบเดียวกับ
 * ระบบเดิมไว้ก่อน เพื่อไม่ให้หน้าภาพรวมของระบบเดิมเพี้ยน จะถอดออกทีเดียวตอนย้ายแท็บภาพรวมมา React แล้ว
 * (ระบบเดิมข้ามการ sync นี้เมื่อ purchase_unit_qty !== 1 — เป็นบั๊กที่รู้อยู่แล้ว คงพฤติกรรมเดิมไว้ก่อนที่นี่
 * เพื่อให้สองระบบเห็นตรงกัน จนกว่าจะแก้ที่ต้นทาง)
 */
export async function syncLegacyStock(
  item: { name: string; purchase_unit_qty: number; base_unit: string; category: string },
  qtyDelta: number,
  unitCost: number,
  txnTypeThai: string,
  txnDate?: string,
  recordedBy?: string,
) {
  if (Number(item.purchase_unit_qty) !== 1) return;
  try {
    const { data: stkRow } = await supabase
      .from('sc_stock_status')
      .select('quantity')
      .eq('item_name', item.name)
      .maybeSingle();
    const newQty = Math.max(0, (Number(stkRow?.quantity) || 0) + qtyDelta);
    await supabase.from('sc_stock_status').upsert(
      {
        item_name: item.name,
        quantity: newQty,
        unit: item.base_unit,
        last_price: unitCost || undefined,
        category: item.category,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'item_name' },
    );

    if (txnTypeThai === 'ซื้อเข้า') {
      await supabase.from('sc_stock_transactions').insert({
        date: txnDate || new Date().toISOString().slice(0, 10),
        type: 'ซื้อเข้า',
        item_name: item.name,
        quantity: qtyDelta,
        price_per_unit: unitCost || 0,
        total: qtyDelta * (unitCost || 0),
        pay_method: 'ระบบคลังสินค้าใหม่',
        recorded_by: recordedBy || null,
        last_updated: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn('syncLegacyStock failed (non-fatal):', e);
  }
}
