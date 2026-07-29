import { useState } from 'react';
import { countItemTransactions, useDeleteItem, type Item } from '../../lib/queries/items';

export default function DeleteItemModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const del = useDeleteItem();

  const confirmDelete = async () => {
    try {
      const count = await countItemTransactions(item.id);
      if (count > 0) {
        setError(
          `ลบสินค้า "${item.name}" ไม่ได้ เพราะมีประวัติการเคลื่อนไหวสต๊อกอยู่แล้ว ${count} รายการ ` +
          `(ต้องเก็บไว้เพื่อตรวจสอบย้อนหลัง) — ถ้าต้องการเลิกใช้งานสินค้านี้ ให้กด "ปิดใช้งาน" แทน`,
        );
        return;
      }
      await del.mutateAsync(item.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ลบไม่สำเร็จ');
    }
  };

  const match = typed === item.name;

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h3>ลบสินค้าถาวร</h3>
        <p className="poc-note">
          พิมพ์ชื่อสินค้า <strong>{item.name}</strong> เพื่อยืนยันการลบถาวร (ทำได้เฉพาะสินค้าที่ไม่เคยมีประวัติเคลื่อนไหวสต๊อก)
        </p>
        <label>
          ชื่อสินค้า
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>ยกเลิก</button>
          <button type="button" disabled={!match || del.isPending} onClick={confirmDelete}>
            {del.isPending ? 'กำลังลบ...' : 'ลบถาวร'}
          </button>
        </div>
      </div>
    </div>
  );
}
