import { useState, type ReactNode } from 'react';
import { type SaleRow, useSalePayments, useSales } from '../../lib/queries/sales';
import CollectPaymentModal from './CollectPaymentModal';

const fc = (v: number) => v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const todayIso = () => new Date().toISOString().slice(0, 10);

function statusFor(sale: SaleRow, extraReceived: number) {
  const pStatus = sale.payment_status || 'ชำระครบ';
  const totalReceived = (pStatus === 'ชำระครบ' ? sale.total_revenue : sale.amount_paid) + extraReceived;
  const outstanding = Math.max(sale.total_revenue - totalReceived, 0);
  return { pStatus, totalReceived, outstanding };
}

export default function SaleHistoryList() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayIso());
  const { data: sales, isLoading } = useSales(from, to);
  const { data: payments } = useSalePayments(from, to);
  const [collectTarget, setCollectTarget] = useState<{ date: string; outstanding: number; extra: number } | null>(null);

  const rows = sales ?? [];
  const totalPairs = rows.reduce((s, r) => s + r.size_s + r.size_m + r.size_l + r.size_xl, 0);
  const totalIncome = rows.reduce((s, r) => s + r.total_revenue, 0);
  let totalOutstanding = 0;

  return (
    <div className="card section-gap">
      <div className="card-head">
        <h2>ประวัติบันทึกรายรับประจำวัน</h2>
        <div className="date-range">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span>ถึง</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      {isLoading ? (
        <p>กำลังโหลด...</p>
      ) : !rows.length ? (
        <p className="empty-row">ยังไม่มีข้อมูลในช่วงนี้</p>
      ) : (
        <>
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>วันที่ / บันทึกโดย</th>
                <th>จำนวน / ขนาด</th>
                <th>ช่องทางชำระ</th>
                <th>ยอดรวม</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const extraReceived = payments?.byDate.get(r.date) || 0;
                const { pStatus, totalReceived, outstanding } = statusFor(r, extraReceived);
                totalOutstanding += outstanding;
                const pairs = r.size_s + r.size_m + r.size_l + r.size_xl;
                // DB columns are historically swapped: cash_amount holds the UI "transfer" figure, transfer_amount holds "cash"
                const transferAmt = r.cash_amount || 0;
                const cashAmt = r.transfer_amount || 0;

                let badge: ReactNode;
                if (outstanding <= 0 || pStatus === 'ชำระครบ') {
                  badge = <span className="badge badge-green">ชำระครบ</span>;
                } else {
                  badge = <span className="badge badge-amber">{pStatus === 'ค้างชำระ' ? 'ค้างชำระ' : 'ชำระบางส่วน'}</span>;
                }

                return (
                  <tr key={r.date}>
                    <td>
                      <strong>{r.date}</strong>
                      {r.recorded_by && <div className="poc-note">บันทึกโดย: {r.recorded_by}</div>}
                    </td>
                    <td>{pairs} คู่ (S{r.size_s} M{r.size_m} L{r.size_l} XL{r.size_xl})</td>
                    <td>
                      {transferAmt > 0 && <div><span className="badge badge-blue">โอน</span> {fc(transferAmt)} ฿</div>}
                      {cashAmt > 0 && <div><span className="badge badge-amber">สด</span> {fc(cashAmt)} ฿</div>}
                    </td>
                    <td>
                      {r.discount > 0 && <div className="poc-note" style={{ textDecoration: 'line-through' }}>{fc(r.grand_total)} ฿</div>}
                      <strong>{fc(r.total_revenue)} ฿</strong>
                      {(pStatus !== 'ชำระครบ' || extraReceived > 0) && (
                        <div className="poc-note">รับแล้ว {fc(totalReceived)} ฿</div>
                      )}
                    </td>
                    <td>
                      {badge}
                      {outstanding > 0 && (
                        <div>
                          <button onClick={() => setCollectTarget({ date: r.date, outstanding, extra: extraReceived })}>
                            รับชำระ ({fc(outstanding)} ฿)
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <p className="poc-note">
            {rows.length} วัน — {totalPairs.toLocaleString('th-TH')} คู่ — {fc(totalIncome)} ฿
            {totalOutstanding > 0 && ` — ค้าง ${fc(totalOutstanding)} ฿`}
          </p>
        </>
      )}
      {collectTarget && (
        <CollectPaymentModal
          saleDate={collectTarget.date}
          outstanding={collectTarget.outstanding}
          alreadyReceived={collectTarget.extra}
          onClose={() => setCollectTarget(null)}
        />
      )}
    </div>
  );
}
