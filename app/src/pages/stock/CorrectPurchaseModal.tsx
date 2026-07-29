import { useState, type FormEvent } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { canManageStock } from '../../lib/types';
import { toPurchaseQty, type Item } from '../../lib/queries/items';
import type { Supplier } from '../../lib/queries/suppliers';
import { type PurchaseHistoryRow, useCorrectPurchase } from '../../lib/queries/purchaseHistory';
import { todayIso } from '../../lib/format';

export default function CorrectPurchaseModal({
  row,
  item,
  suppliers,
  onClose,
}: {
  row: PurchaseHistoryRow;
  item: Item;
  suppliers: Supplier[];
  onClose: () => void;
}) {
  const { auth } = useAuth();
  const isManager = canManageStock(auth?.role);
  const save = useCorrectPurchase();

  const origQty = toPurchaseQty(item, Number(row.quantity_delta || 0));
  const [qty, setQty] = useState(origQty);
  const [total, setTotal] = useState(Number(row.total_cost || 0));
  const [supplierId, setSupplierId] = useState(row.supplier_id || '');
  const [date, setDate] = useState(row.transaction_date || todayIso());
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (qty <= 0) { setError('กรุณากรอกจำนวนให้ถูกต้อง'); return; }
    if (isNaN(total) || total < 0) { setError('กรุณากรอกยอดที่จ่ายให้ถูกต้อง'); return; }
    if (!reason.trim()) { setError('กรุณาระบุเหตุผลที่แก้ไข (จำเป็นสำหรับตรวจสอบย้อนหลัง)'); return; }
    try {
      await save.mutateAsync({
        original: row, item, newPurchaseQty: qty, newTotal: total,
        newSupplierId: supplierId || null, newDate: date, reason: reason.trim(),
        canManageStock: isManager, performedBy: auth!.userId,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'แก้ไขไม่สำเร็จ');
    }
  };

  return (
    <div className="modal-overlay">
      <form className="modal-card" onSubmit={submit}>
        <h3>แก้ไขรายการซื้อเข้า</h3>
        <p className="poc-note">{item.name}</p>
        <p className="poc-note">
          รายการเดิม: {origQty.toLocaleString('th-TH')} {item.purchase_unit} รวม{' '}
          {Number(row.total_cost || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿
        </p>
        {!isManager && (
          <p className="poc-note">
            ขั้นตอนยกเลิกจำนวนเดิมต้องรอ Admin อนุมัติก่อนจึงจะมีผลกับยอดคงเหลือ
            (ส่วนรายการที่แก้ไขใหม่จะถูกบันทึกทันที)
          </p>
        )}
        <label>
          จำนวนที่ถูกต้อง ({item.purchase_unit})
          <input type="number" min={0.001} step={0.001} value={qty} onChange={(e) => setQty(+e.target.value)} />
        </label>
        <label>
          ยอดที่จ่ายจริง (บาท)
          <input type="number" min={0} step={0.01} value={total} onChange={(e) => setTotal(+e.target.value)} />
        </label>
        <label>
          Supplier
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">- ไม่ระบุ -</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>
          วันที่ซื้อจริง
          <input type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          เหตุผลที่แก้ไข
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>ยกเลิก</button>
          <button type="submit" disabled={save.isPending}>
            {save.isPending ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
          </button>
        </div>
      </form>
    </div>
  );
}
