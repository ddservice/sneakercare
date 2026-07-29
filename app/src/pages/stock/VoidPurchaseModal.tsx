import { useState, type FormEvent } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { canManageStock } from '../../lib/types';
import type { Item } from '../../lib/queries/items';
import { type PurchaseHistoryRow, useVoidPurchase } from '../../lib/queries/purchaseHistory';

export default function VoidPurchaseModal({
  row,
  item,
  onClose,
}: {
  row: PurchaseHistoryRow;
  item: Item;
  onClose: () => void;
}) {
  const { auth } = useAuth();
  const isManager = canManageStock(auth?.role);
  const save = useVoidPurchase();

  const qty = Number(row.quantity_delta || 0) / item.purchase_unit_qty;
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) { setError('กรุณาระบุเหตุผลที่ลบรายการนี้ (จำเป็นสำหรับตรวจสอบย้อนหลัง)'); return; }
    try {
      await save.mutateAsync({ original: row, item, reason: reason.trim(), canManageStock: isManager, performedBy: auth!.userId });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ลบไม่สำเร็จ');
    }
  };

  return (
    <div className="modal-overlay">
      <form className="modal-card" onSubmit={submit}>
        <h3>ลบรายการซื้อเข้า</h3>
        <p className="poc-note">{item.name}</p>
        <p className="poc-note">
          จะลบรายการ: {qty.toLocaleString('th-TH')} {item.purchase_unit} รวม{' '}
          {Number(row.total_cost || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿
        </p>
        <p className="poc-note">
          {isManager ? 'ยอดคงเหลือและมูลค่าจะถูกหักออกทันที' : 'รายการนี้ต้องรอ Admin อนุมัติก่อน ยอดคงเหลือจะยังไม่ถูกหักออกจนกว่าจะอนุมัติ'}
        </p>
        <label>
          เหตุผลที่ลบ
          <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>ยกเลิก</button>
          <button type="submit" disabled={save.isPending}>
            {save.isPending ? 'กำลังลบ...' : 'ยืนยันลบ'}
          </button>
        </div>
      </form>
    </div>
  );
}
