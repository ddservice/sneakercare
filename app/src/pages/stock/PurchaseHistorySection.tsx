import { useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useItems } from '../../lib/queries/items';
import { useSuppliers } from '../../lib/queries/suppliers';
import { type PurchaseHistoryRow, reductionStatusFor, usePurchaseHistory } from '../../lib/queries/purchaseHistory';
import CorrectPurchaseModal from './CorrectPurchaseModal';
import VoidPurchaseModal from './VoidPurchaseModal';

function reductionBadge(row: PurchaseHistoryRow, reduction: ReturnType<typeof reductionStatusFor>, reductionRaw: string | undefined) {
  if (row.reference_type === 'correction') {
    return <span className="badge badge-amber" style={{ fontSize: 10 }}>แก้ไขจากรายการเดิม</span>;
  }
  if (reduction === 'pending_approval') return <span className="badge badge-amber" style={{ fontSize: 10 }}>รออนุมัติการลบ/แก้ไข</span>;
  if (reduction === 'approved') return <span className="badge badge-red" style={{ fontSize: 10 }}>ถูกลบ/แก้ไขแล้ว</span>;
  if (reductionRaw === 'rejected') return <span className="badge badge-red" style={{ fontSize: 10 }}>คำขอลบ/แก้ไขถูกปฏิเสธ</span>;
  return null;
}

export default function PurchaseHistorySection() {
  const { auth } = useAuth();
  const { data, isLoading } = usePurchaseHistory();
  const { data: items } = useItems();
  const { data: suppliers } = useSuppliers();

  const [correctTarget, setCorrectTarget] = useState<PurchaseHistoryRow | null>(null);
  const [voidTarget, setVoidTarget] = useState<PurchaseHistoryRow | null>(null);

  const rows = data?.rows ?? [];
  const reductionsByTarget = data?.reductionsByTarget ?? new Map<string, string>();

  const itemFor = (id: string) => items?.find((i) => i.id === id);
  const supplierFor = (id: string | null) => (id ? suppliers?.find((s) => s.id === id) : undefined);

  return (
    <div className="card section-gap">
      <h2>ประวัติการซื้อเข้า</h2>
      {isLoading ? (
        <p>กำลังโหลด...</p>
      ) : !rows.length ? (
        <p className="empty-row">ยังไม่มีประวัติการซื้อเข้า</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>วันที่</th>
                <th>สินค้า</th>
                <th>จำนวน</th>
                <th>ต้นทุน/หน่วย</th>
                <th>รวม</th>
                <th>Supplier</th>
                <th>หมายเหตุ</th>
                <th>บันทึกโดย</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const item = itemFor(d.item_id);
                const supplier = supplierFor(d.supplier_id);
                const when = d.transaction_date
                  ? new Date(d.transaction_date + 'T00:00:00').toLocaleDateString('th-TH', { dateStyle: 'short' })
                  : new Date(d.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
                const unitCost = Number(d.unit_cost_snapshot || 0);
                const total = Number(d.total_cost || Number(d.quantity_delta || 0) * unitCost);
                const reductionRaw = reductionsByTarget.get(d.id);
                const reduction = reductionStatusFor(reductionsByTarget, d.id);
                const struckThrough = reduction === 'approved';

                return (
                  <tr key={d.id} style={struckThrough ? { opacity: 0.6, textDecoration: 'line-through' } : undefined}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{when}</td>
                    <td>{item ? item.name : '-'} {reductionBadge(d, reduction, reductionRaw)}</td>
                    <td style={{ textAlign: 'right' }}>{Number(d.quantity_delta || 0).toLocaleString('th-TH')} {item?.base_unit}</td>
                    <td style={{ textAlign: 'right' }}>{unitCost.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{total.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿</td>
                    <td style={{ fontSize: 12 }}>{supplier ? supplier.name : '-'}</td>
                    <td style={{ fontSize: 12 }}>{d.reference_note || '-'}</td>
                    <td style={{ fontSize: 12 }}>{d.performed_by === auth?.userId ? auth.displayName : d.performed_by || '-'}</td>
                    <td className="row-actions" style={{ whiteSpace: 'nowrap' }}>
                      {!reduction && item && (
                        <>
                          <button onClick={() => setCorrectTarget(d)}>แก้ไข</button>
                          <button onClick={() => setVoidTarget(d)}>ลบ</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {correctTarget && itemFor(correctTarget.item_id) && (
        <CorrectPurchaseModal
          row={correctTarget}
          item={itemFor(correctTarget.item_id)!}
          suppliers={suppliers ?? []}
          onClose={() => setCorrectTarget(null)}
        />
      )}
      {voidTarget && itemFor(voidTarget.item_id) && (
        <VoidPurchaseModal row={voidTarget} item={itemFor(voidTarget.item_id)!} onClose={() => setVoidTarget(null)} />
      )}
    </div>
  );
}
