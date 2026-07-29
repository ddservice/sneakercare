import { useAuth } from '../../lib/AuthContext';
import { useItems } from '../../lib/queries/items';
import { useApproveAdjustment, usePendingAdjustments } from '../../lib/queries/pending';

export default function PendingApprovalsSection() {
  const { auth } = useAuth();
  const { data: pending, isLoading } = usePendingAdjustments();
  const { data: items } = useItems();
  const approve = useApproveAdjustment();

  return (
    <div className="card section-gap">
      <h2>รายการรออนุมัติ</h2>
      {isLoading ? (
        <p>กำลังโหลด...</p>
      ) : !pending?.length ? (
        <p className="empty-row">ไม่มีรายการรออนุมัติ</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>สินค้า</th>
              <th>ประเภท</th>
              <th>จำนวน</th>
              <th>เหตุผล</th>
              <th>ส่งโดย</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pending.map((r) => {
              const item = items?.find((i) => i.id === r.item_id);
              return (
                <tr key={r.id}>
                  <td>{item ? item.name : '-'}</td>
                  <td>{r.txn_type === 'adjustment_increase' ? 'ปรับเพิ่ม' : 'ปรับลด'}</td>
                  <td style={{ textAlign: 'right' }}>{Math.abs(r.quantity_delta)}</td>
                  <td>{r.reason || ''}</td>
                  <td>{r.performed_by === auth?.userId ? auth.displayName : r.performed_by}</td>
                  <td className="row-actions">
                    <button onClick={() => approve.mutate({ txnId: r.id, approve: true })}>อนุมัติ</button>
                    <button onClick={() => approve.mutate({ txnId: r.id, approve: false })}>ปฏิเสธ</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
