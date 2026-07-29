import { useState } from 'react';
import { useSales } from '../lib/queries/sales';
import { useOpexSummaryInRange } from '../lib/queries/opexSummary';
import { useMaterialCostInRange } from '../lib/queries/materialCost';
import { useOverviewPayments } from '../lib/queries/overviewPayments';
import BreakdownBars, { type BarDatum } from './stats/BreakdownBars';

const fc = (v: number) => v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function Overview() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayIso());

  const { data: sales, isLoading: salesLoading } = useSales(from, to);
  const { data: opex, isLoading: opexLoading } = useOpexSummaryInRange(from, to);
  const { data: materialCost, isLoading: matLoading } = useMaterialCostInRange(from, to);
  const { data: payments, isLoading: paymentsLoading } = useOverviewPayments(from, to);

  const isLoading = salesLoading || opexLoading || matLoading || paymentsLoading;
  const rows = sales ?? [];
  const opexSummary = opex ?? { opexFixedAmt: 0, staffSalaryAmt: 0, taxAmt: 0, rentalIncomeAmt: 0 };
  const stockInAmt = materialCost ?? 0;
  const byDateAll = payments?.byDateAll ?? new Map<string, number>();
  const inRangeTotal = payments?.inRangeTotal ?? 0;

  const serviceRevenue = rows.reduce((s, r) => s + r.total_revenue, 0);
  const totalRevenue = serviceRevenue + opexSummary.rentalIncomeAmt;

  let totalCashCollected = 0;
  let totalOutstanding = 0;
  rows.forEach((s) => {
    const pStatus = s.payment_status || 'ชำระครบ';
    const receivedAtSaleTime = pStatus === 'ชำระครบ' ? s.total_revenue : Math.min(s.amount_paid || 0, s.total_revenue);
    totalCashCollected += receivedAtSaleTime;
    const laterCollected = byDateAll.get(s.date) || 0;
    totalOutstanding += Math.max(s.total_revenue - receivedAtSaleTime - laterCollected, 0);
  });
  totalCashCollected += inRangeTotal;

  const grandExpenses = stockInAmt + opexSummary.opexFixedAmt + opexSummary.staffSalaryAmt + opexSummary.taxAmt;
  const netProfit = totalCashCollected + opexSummary.rentalIncomeAmt - grandExpenses;

  const expenseBars: BarDatum[] = [
    { label: 'ต้นทุนวัสดุคลัง', value: stockInAmt, sublabel: `${fc(stockInAmt)} ฿`, color: '#f59e0b' },
    { label: 'ค่าดำเนินการร้าน', value: opexSummary.opexFixedAmt, sublabel: `${fc(opexSummary.opexFixedAmt)} ฿`, color: '#0284c7' },
    { label: 'ค่าแรงพนักงาน', value: opexSummary.staffSalaryAmt, sublabel: `${fc(opexSummary.staffSalaryAmt)} ฿`, color: '#7c3aed' },
    { label: 'ภาษี + ประกันสังคม', value: opexSummary.taxAmt, sublabel: `${fc(opexSummary.taxAmt)} ฿`, color: '#dc2626' },
  ].filter((b) => b.value > 0);

  return (
    <div>
      <div className="card">
        <div className="card-head">
          <h2>ภาพรวม</h2>
          <div className="date-range">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span>ถึง</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {isLoading ? (
          <p>กำลังโหลด...</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <div className="init-stock-fieldset">
              <legend>รายรับรวมสุทธิ</legend>
              <h3>{fc(totalRevenue)} ฿</h3>
              <p className="poc-note">(ยอดขาย+รายรับห้องเช่า ตามรอบบัญชี)</p>
            </div>
            <div className="init-stock-fieldset">
              <legend>ค่าใช้จ่ายรวม</legend>
              <h3>{fc(grandExpenses)} ฿</h3>
            </div>
            <div className="init-stock-fieldset">
              <legend>กำไรสุทธิ</legend>
              <h3 style={{ color: netProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>{fc(netProfit)} ฿</h3>
              <p className="poc-note">(คำนวณจากเงินที่ได้รับจริงในช่วงนี้)</p>
            </div>
            {totalOutstanding > 0 && (
              <div className="init-stock-fieldset">
                <legend>ค้างชำระ</legend>
                <h3 style={{ color: 'var(--red)' }}>{fc(totalOutstanding)} ฿</h3>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card section-gap">
        <h2>สัดส่วนค่าใช้จ่ายแยกหมวดหมู่</h2>
        <BreakdownBars data={expenseBars} emptyText="ยังไม่มีค่าใช้จ่ายในช่วงนี้" />
      </div>
    </div>
  );
}
