import { useState, type FormEvent } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { canManageStock } from '../../lib/types';
import { useItems } from '../../lib/queries/items';
import { useSaveAdjustment } from '../../lib/queries/stockTransactions';

export default function AdjustmentForm() {
  const { auth } = useAuth();
  const { data: items } = useItems();
  const isManager = canManageStock(auth?.role);
  const save = useSaveAdjustment(isManager);

  const [itemId, setItemId] = useState('');
  const [direction, setDirection] = useState<'increase' | 'decrease'>('increase');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  const activeItems = (items ?? []).filter((i) => i.is_active);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!itemId) { setStatus({ text: 'กรุณาเลือกสินค้า', ok: false }); return; }
    if (qty <= 0) { setStatus({ text: 'กรุณากรอกจำนวนให้ถูกต้อง', ok: false }); return; }
    if (!reason.trim()) { setStatus({ text: 'กรุณากรอกเหตุผล', ok: false }); return; }

    setStatus({ text: 'กำลังบันทึก...', ok: true });
    try {
      await save.mutateAsync({ itemId, direction, qty, reason: reason.trim(), performedBy: auth!.userId });
      setStatus({
        text: isManager ? 'บันทึกการปรับปรุงสต๊อกเรียบร้อย ✓' : 'ส่งคำขอปรับปรุงสต๊อกไปรออนุมัติแล้ว ✓',
        ok: true,
      });
      setQty(1); setReason('');
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ text: 'ข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ'), ok: false });
    }
  };

  return (
    <div className="card section-gap">
      <h2>ปรับปรุงสต๊อก (จากตรวจนับ)</h2>
      {!isManager && (
        <p className="poc-note">รายการนี้จะถูกส่งไปรออนุมัติจาก Admin ก่อน ยอดคงเหลือจะยังไม่เปลี่ยนจนกว่าจะอนุมัติ</p>
      )}
      <form onSubmit={submit}>
        <label>
          สินค้า
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">- เลือกสินค้า -</option>
            {activeItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        <label>
          ทิศทาง
          <select value={direction} onChange={(e) => setDirection(e.target.value as 'increase' | 'decrease')}>
            <option value="increase">เพิ่ม (พบของเกิน)</option>
            <option value="decrease">ลด (พบของขาด/เสียหาย)</option>
          </select>
        </label>
        <label>
          จำนวน (หน่วยฐาน)
          <input type="number" min={0.001} step={0.001} value={qty} onChange={(e) => setQty(+e.target.value)} />
        </label>
        <label>
          เหตุผล
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {status && <p className={status.ok ? 'poc-note' : 'form-error'}>{status.text}</p>}
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? 'กำลังบันทึก...' : 'บันทึกการปรับปรุง'}
        </button>
      </form>
    </div>
  );
}
