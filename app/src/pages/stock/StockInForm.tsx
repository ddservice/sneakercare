import { useState, type FormEvent } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useItems } from '../../lib/queries/items';
import { useSuppliers } from '../../lib/queries/suppliers';
import { useSaveStockIn } from '../../lib/queries/stockTransactions';
import SupplierModal from './SupplierModal';

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function StockInForm() {
  const { auth } = useAuth();
  const { data: items } = useItems();
  const { data: suppliers } = useSuppliers();
  const save = useSaveStockIn();

  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState(1);
  const [total, setTotal] = useState(0);
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);

  const item = items?.find((i) => i.id === itemId) ?? null;
  const activeItems = (items ?? []).filter((i) => i.is_active);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!item) { setStatus({ text: 'กรุณาเลือกสินค้า', ok: false }); return; }
    if (qty <= 0) { setStatus({ text: 'กรุณากรอกจำนวนให้ถูกต้อง', ok: false }); return; }
    if (isNaN(total) || total < 0) { setStatus({ text: 'กรุณากรอกยอดที่จ่ายให้ถูกต้อง', ok: false }); return; }
    if (date > todayIso()) { setStatus({ text: 'วันที่รับของเข้าเป็นวันที่ในอนาคตไม่ได้', ok: false }); return; }

    setStatus({ text: 'กำลังบันทึก...', ok: true });
    try {
      await save.mutateAsync({
        item, purchaseQty: qty, totalCost: total, supplierId: supplierId || null,
        txnDate: date, note, performedBy: auth!.userId,
      });
      setStatus({ text: 'บันทึกรับของเข้าเรียบร้อย ✓', ok: true });
      setQty(1); setTotal(0); setSupplierId(''); setNote(''); setDate(todayIso());
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ text: 'ข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ'), ok: false });
    }
  };

  return (
    <div className="card section-gap">
      <h2>รับของเข้าคลัง</h2>
      <form onSubmit={submit}>
        <label>
          สินค้า
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">- เลือกสินค้า -</option>
            {activeItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        <label>
          จำนวน ({item ? item.purchase_unit : 'หน่วยซื้อ'})
          <input type="number" min={0.001} step={0.001} value={qty} onChange={(e) => setQty(+e.target.value)} />
        </label>
        <label>
          ยอดที่จ่ายจริงทั้งหมด (บาท)
          <input type="number" min={0} step={0.01} value={total} onChange={(e) => setTotal(+e.target.value)} />
        </label>
        <label>
          Supplier
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={{ flex: 1 }}>
              <option value="">- ไม่ระบุ -</option>
              {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button type="button" onClick={() => setSupplierModalOpen(true)}>+</button>
          </div>
        </label>
        <label>
          วันที่รับของเข้า
          <input type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          หมายเหตุ / เลขบิล
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {status && <p className={status.ok ? 'poc-note' : 'form-error'}>{status.text}</p>}
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? 'กำลังบันทึก...' : 'บันทึกรับของเข้า'}
        </button>
      </form>
      {supplierModalOpen && (
        <SupplierModal
          supplier={null}
          onClose={() => setSupplierModalOpen(false)}
          onSaved={(id) => setSupplierId(id)}
        />
      )}
    </div>
  );
}
