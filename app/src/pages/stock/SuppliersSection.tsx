import { useState } from 'react';
import { type Supplier, useSuppliers, useToggleSupplierActive } from '../../lib/queries/suppliers';
import SupplierModal from './SupplierModal';

export default function SuppliersSection() {
  const { data: suppliers, isLoading } = useSuppliers();
  const toggleActive = useToggleSupplierActive();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (s: Supplier) => { setEditing(s); setModalOpen(true); };

  return (
    <div className="card section-gap">
      <div className="card-head">
        <h2>Suppliers</h2>
        <button onClick={openNew}>+ เพิ่ม Supplier</button>
      </div>
      {isLoading ? (
        <p>กำลังโหลด...</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>ชื่อ</th>
              <th>เบอร์โทร</th>
              <th>หมายเหตุ</th>
              <th>สถานะ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!suppliers?.length && (
              <tr><td colSpan={5} className="empty-row">ยังไม่มี Supplier กด "เพิ่ม Supplier" เพื่อเริ่มต้น</td></tr>
            )}
            {suppliers?.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.name}</strong></td>
                <td>{s.phone || '-'}</td>
                <td>{s.note || '-'}</td>
                <td>
                  <span className={'badge ' + (s.is_active ? 'badge-green' : 'badge-red')}>
                    {s.is_active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                  </span>
                </td>
                <td className="row-actions">
                  <button onClick={() => openEdit(s)}>แก้ไข</button>
                  <button onClick={() => toggleActive.mutate({ id: s.id, nextActive: !s.is_active })}>
                    {s.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {modalOpen && <SupplierModal supplier={editing} onClose={() => setModalOpen(false)} />}
    </div>
  );
}
