import { useState, type FormEvent } from 'react';
import { type Supplier, useSaveSupplier } from '../../lib/queries/suppliers';

export default function SupplierModal({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const [name, setName] = useState(supplier?.name ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [note, setNote] = useState(supplier?.note ?? '');
  const [error, setError] = useState('');
  const save = useSaveSupplier();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('กรุณากรอกชื่อ Supplier'); return; }
    try {
      const saved = await save.mutateAsync({
        id: supplier?.id ?? null,
        payload: { name: name.trim(), phone: phone.trim() || null, note: note.trim() || null },
      });
      const newId = supplier?.id ?? (saved as { id: string } | null)?.id;
      if (!supplier && newId && onSaved) onSaved(newId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    }
  };

  return (
    <div className="modal-overlay">
      <form className="modal-card" onSubmit={submit}>
        <h3>{supplier ? 'แก้ไข Supplier' : 'เพิ่ม Supplier ใหม่'}</h3>
        <label>
          ชื่อ Supplier
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          เบอร์โทร
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label>
          หมายเหตุ
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>ยกเลิก</button>
          <button type="submit" disabled={save.isPending}>
            {save.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </form>
    </div>
  );
}
