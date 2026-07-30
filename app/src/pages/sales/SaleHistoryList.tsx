import { useMemo, useState, type ReactNode } from 'react';
import { type SaleRow, useSalePayments, useSales } from '../../lib/queries/sales';
import { fc, firstOfMonthIso, todayIso } from '../../lib/format';
import CollectPaymentModal from './CollectPaymentModal';
import SortableHeader from '../../components/SortableHeader';
import { IconSearch } from '../../components/Icons';
import { SkeletonRows } from '../../components/Skeleton';

function statusFor(sale: SaleRow, extraReceived: number) {
  const pStatus = sale.payment_status || 'ชำระครบ';
  const totalReceived = (pStatus === 'ชำระครบ' ? sale.total_revenue : sale.amount_paid) + extraReceived;
  const outstanding = Math.max(sale.total_revenue - totalReceived, 0);
  return { pStatus, totalReceived, outstanding };
}

type SortKey = 'date' | 'pairs' | 'total' | 'status';

export default function SaleHistoryList() {
  const [from, setFrom] = useState(firstOfMonthIso());
  const [to, setTo] = useState(todayIso());
  const { data: sales, isLoading } = useSales(from, to);
  const { data: payments } = useSalePayments(from, to);
  const [collectTarget, setCollectTarget] = useState<{ date: string; outstanding: number; extra: number } | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); return; }
    setSortKey(key);
    setSortDir('desc');
  };

  const allRows = sales ?? [];
  const totalPairs = allRows.reduce((s, r) => s + r.size_s + r.size_m + r.size_l + r.size_xl, 0);
  const totalIncome = allRows.reduce((s, r) => s + r.total_revenue, 0);
  const totalOutstanding = allRows.reduce((s, r) => {
    const extraReceived = payments?.byDate.get(r.date) || 0;
    return s + statusFor(r, extraReceived).outstanding;
  }, 0);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const withDerived = allRows.map((r) => {
      const extraReceived = payments?.byDate.get(r.date) || 0;
      const { pStatus, outstanding } = statusFor(r, extraReceived);
      const pairs = r.size_s + r.size_m + r.size_l + r.size_xl;
      return { r, extraReceived, pStatus, outstanding, pairs };
    });
    const filtered = !q ? withDerived : withDerived.filter((x) =>
      x.r.date.includes(q) || (x.r.recorded_by ?? '').toLowerCase().includes(q) || x.pStatus.toLowerCase().includes(q),
    );
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') cmp = a.r.date.localeCompare(b.r.date);
      else if (sortKey === 'pairs') cmp = a.pairs - b.pairs;
      else if (sortKey === 'total') cmp = a.r.total_revenue - b.r.total_revenue;
      else if (sortKey === 'status') cmp = a.pStatus.localeCompare(b.pStatus);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, payments, search, sortKey, sortDir]);

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
        <SkeletonRows rows={5} />
      ) : !allRows.length ? (
        <p className="empty-row">ยังไม่มีข้อมูลในช่วงนี้</p>
      ) : (
        <>
          <div className="table-filter">
            <IconSearch />
            <input placeholder="ค้นหา วันที่ / ผู้บันทึก / สถานะ" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <SortableHeader label="วันที่ / บันทึกโดย" sortKey="date" active={sortKey === 'date'} dir={sortDir} onClick={toggleSort} />
                <SortableHeader label="จำนวน / ขนาด" sortKey="pairs" active={sortKey === 'pairs'} dir={sortDir} onClick={toggleSort} />
                <th>ช่องทางชำระ</th>
                <SortableHeader label="ยอดรวม" sortKey="total" active={sortKey === 'total'} dir={sortDir} onClick={toggleSort} />
                <SortableHeader label="สถานะ" sortKey="status" active={sortKey === 'status'} dir={sortDir} onClick={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="empty-row">ไม่พบรายการที่ตรงกับคำค้นหา</td></tr>
              ) : rows.map(({ r, extraReceived, pStatus, outstanding, pairs }) => {
                // DB columns are historically swapped: cash_amount holds the UI "transfer" figure, transfer_amount holds "cash"
                const transferAmt = r.cash_amount || 0;
                const cashAmt = r.transfer_amount || 0;
                const totalReceived = (pStatus === 'ชำระครบ' ? r.total_revenue : r.amount_paid) + extraReceived;

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
            {allRows.length} วัน — {totalPairs.toLocaleString('th-TH')} คู่ — {fc(totalIncome)} ฿
            {totalOutstanding > 0 && ` — ค้าง ${fc(totalOutstanding)} ฿`}
            {rows.length !== allRows.length && ` (แสดง ${rows.length} รายการที่ตรงกับคำค้นหา)`}
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
