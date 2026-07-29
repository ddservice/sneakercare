import { useAuth } from '../../lib/AuthContext';
import { useStockAuditLog } from '../../lib/queries/auditLog';
import { useItems } from '../../lib/queries/items';

const TYPE_LABEL: Record<string, string> = {
  stock_in: 'รับของเข้า', stock_out: 'เบิกใช้งาน', adjustment_increase: 'ปรับเพิ่ม', adjustment_decrease: 'ปรับลด', waste: 'ของเสีย',
};

export default function AuditLogSection() {
  const { auth } = useAuth();
  const { data: rows, isLoading } = useStockAuditLog();
  const { data: items } = useItems();

  return (
    <div className="card section-gap">
      <h2>ประวัติดิบทุกการเปลี่ยนแปลง (Audit log)</h2>
      <p className="poc-note">
        แสดงเฉพาะตอนเพิ่มรายการใหม่ (insert) เท่านั้น — ถ้ารายการถูกอนุมัติ/ปฏิเสธทีหลัง (เป็นการ update)
        จะไม่ปรากฏการเปลี่ยนแปลงตรงนี้ ให้ดูสถานะล่าสุดที่ตาราง "ประวัติการซื้อเข้า" แทน
      </p>
      {isLoading ? (
        <p>กำลังโหลด...</p>
      ) : !rows?.length ? (
        <p className="empty-row">ยังไม่มีประวัติ</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>เวลา</th><th>ประเภท</th><th>สินค้า</th><th>จำนวน</th><th>หมายเหตุ</th><th>โดย</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const d = row.after_data || {};
              const item = items?.find((i) => i.id === d.item_id);
              const when = row.performed_at ? new Date(row.performed_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '';
              return (
                <tr key={row.id}>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{when}</td>
                  <td>{(d.txn_type && TYPE_LABEL[d.txn_type]) || d.txn_type || ''}</td>
                  <td>{item ? item.name : '-'}</td>
                  <td style={{ textAlign: 'right' }}>{d.quantity_delta ?? ''}</td>
                  <td style={{ fontSize: 12 }}>{d.reason || d.reference_note || ''}</td>
                  <td style={{ fontSize: 12 }}>{row.performed_by === auth?.userId ? auth.displayName : row.performed_by || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
