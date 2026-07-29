import { useState, type FormEvent } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useItemStock, useItems } from '../../lib/queries/items';
import { useSaveStockOut } from '../../lib/queries/stockTransactions';

export default function StockOutForm() {
  const { auth } = useAuth();
  const { data: items } = useItems();
  const { data: stock } = useItemStock();
  const save = useSaveStockOut();

  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  const item = items?.find((i) => i.id === itemId) ?? null;
  const activeItems = (items ?? []).filter((i) => i.is_active);
  const stockRow = stock?.find((s) => s.item_id === itemId) ?? null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!item) { setStatus({ text: 'กรุณาเลือกสินค้า', ok: false }); return; }
    if (qty <= 0) { setStatus({ text: 'กรุณากรอกจำนวนให้ถูกต้อง', ok: false }); return; }

    setStatus({ text: 'กำลังบันทึก...', ok: true });
    try {
      await save.mutateAsync({ item, qty, note, performedBy: auth!.userId });
      setStatus({ text: 'บันทึกการเบิกใช้งานเรียบร้อย ✓', ok: true });
      setQty(1); setNote('');
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ text: 'ข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ'), ok: false });
    }
  };

  return (
    <div className="card section-gap">
      <h2>เบิกใช้งาน</h2>
      <form onSubmit={submit}>
        <label>
          สินค้า
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">- เลือกสินค้า -</option>
            {activeItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        {stockRow && (
          <p className="poc-note">หน่วยเบิก: {stockRow.base_unit} (คงเหลือ {stockRow.current_qty})</p>
        )}
        <label>
          จำนวน ({item ? item.base_unit : 'หน่วยฐาน'})
          <input type="number" min={0.001} step={0.001} value={qty} onChange={(e) => setQty(+e.target.value)} />
        </label>
        <label>
          หมายเหตุ
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {status && <p className={status.ok ? 'poc-note' : 'form-error'}>{status.text}</p>}
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? 'กำลังบันทึก...' : 'บันทึกเบิกใช้งาน'}
        </button>
      </form>
    </div>
  );
}
