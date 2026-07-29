import { useState } from 'react';
import { useSales } from '../lib/queries/sales';
import { useBizSettings } from '../lib/queries/settings';
import BreakdownBars, { type BarDatum } from './stats/BreakdownBars';
import MaterialAnalysisTable from './stats/MaterialAnalysisTable';

const SIZE_COLOR = { s: '#0d9488', m: '#0284c7', l: '#7c3aed', xl: '#db2777' };
const EMP_COLORS = ['#0d9488', '#0284c7', '#7c3aed', '#db2777', '#f59e0b', '#10b981'];
const fc0 = (v: number) => v.toLocaleString('th-TH', { maximumFractionDigits: 0 });
const fc2 = (v: number) => v.toLocaleString('th-TH', { minimumFractionDigits: 2 });

const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function Stats() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayIso());
  const { data: sales, isLoading } = useSales(from, to);
  const { data: biz } = useBizSettings();
  const SIZE_PRICE = { s: biz?.price_s ?? 200, m: biz?.price_m ?? 400, l: biz?.price_l ?? 600, xl: biz?.price_xl ?? 800 };

  const rows = sales ?? [];
  const totalIncome = rows.reduce((s, r) => s + r.total_revenue, 0);
  const totalS = rows.reduce((s, r) => s + r.size_s, 0);
  const totalM = rows.reduce((s, r) => s + r.size_m, 0);
  const totalL = rows.reduce((s, r) => s + r.size_l, 0);
  const totalXl = rows.reduce((s, r) => s + r.size_xl, 0);
  const totalPairs = totalS + totalM + totalL + totalXl;
  const uniqueDays = new Set(rows.map((r) => r.date)).size || 1;
  const avgDaily = totalIncome / uniqueDays;
  const avgPerPair = totalPairs > 0 ? totalIncome / totalPairs : 0;

  const sizeData: BarDatum[] = (['s', 'm', 'l', 'xl'] as const).map((sz) => {
    const qty = { s: totalS, m: totalM, l: totalL, xl: totalXl }[sz];
    return { label: `Size ${sz.toUpperCase()} (${SIZE_PRICE[sz]}฿)`, value: qty, sublabel: `${fc0(qty)} คู่`, color: SIZE_COLOR[sz] };
  });

  const empMap = new Map<string, { pairs: number; income: number }>();
  rows.forEach((r) => {
    const key = r.recorded_by || '';
    if (!key) return;
    const cur = empMap.get(key) || { pairs: 0, income: 0 };
    cur.pairs += r.size_s + r.size_m + r.size_l + r.size_xl;
    cur.income += r.total_revenue;
    empMap.set(key, cur);
  });
  const empData: BarDatum[] = [...empMap.entries()]
    .sort((a, b) => b[1].pairs - a[1].pairs)
    .map(([name, d], i) => ({ label: name, value: d.pairs, sublabel: `${fc0(d.pairs)} คู่ · ${fc0(d.income)} ฿`, color: EMP_COLORS[i % EMP_COLORS.length] }));

  const payMap = new Map<string, number>();
  rows.forEach((r) => {
    // DB columns เป็นค่าที่สลับกันมาตั้งแต่เดิม: cash_amount = ยอดโอน(UI), transfer_amount = ยอดสด(UI)
    const transferAmt = r.cash_amount || 0;
    const cashAmt = r.transfer_amount || 0;
    const pm = transferAmt > 0 && cashAmt > 0 ? 'โอน+สด' : transferAmt > 0 ? 'โอน' : cashAmt > 0 ? 'สด' : 'อื่นๆ';
    payMap.set(pm, (payMap.get(pm) || 0) + r.total_revenue);
  });
  const totalPay = [...payMap.values()].reduce((a, b) => a + b, 0) || 1;
  const payColor: Record<string, string> = { สด: '#10b981', โอน: '#0284c7', 'โอน+สด': '#7c3aed' };
  const payData: BarDatum[] = [...payMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([pm, amt]) => ({ label: pm, value: amt, sublabel: `${fc0(amt)} ฿ · ${Math.round((amt / totalPay) * 100)}%`, color: payColor[pm] || '#f59e0b' }));

  const dayMap = new Map<string, number>();
  rows.forEach((r) => { dayMap.set(r.date, (dayMap.get(r.date) || 0) + r.total_revenue); });
  const dayData: BarDatum[] = [...dayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, amt]) => ({ label: date, value: amt, sublabel: `${fc0(amt)} ฿`, color: 'var(--c-primary)' }));

  return (
    <div>
      <div className="card">
        <div className="card-head">
          <h2>สถิติ</h2>
          <div className="date-range">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span>ถึง</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {isLoading ? (
          <p>กำลังโหลด...</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <div className="init-stock-fieldset"><legend>รายได้รวม</legend><h3>{fc0(totalIncome)} ฿</h3></div>
            <div className="init-stock-fieldset"><legend>จำนวนคู่รวม</legend><h3>{fc0(totalPairs)} คู่</h3></div>
            <div className="init-stock-fieldset"><legend>เฉลี่ย/วัน</legend><h3>{fc0(avgDaily)} ฿</h3></div>
            <div className="init-stock-fieldset"><legend>เฉลี่ย/คู่</legend><h3>{fc2(avgPerPair)} ฿</h3></div>
          </div>
        )}
      </div>

      <div className="card section-gap">
        <h2>สัดส่วนตามไซส์</h2>
        <BreakdownBars data={sizeData} emptyText="ไม่มีข้อมูลในช่วงที่เลือก" />
      </div>

      <div className="card section-gap">
        <h2>ยอดขายรายพนักงาน</h2>
        <BreakdownBars data={empData} emptyText="ไม่มีข้อมูลพนักงาน" />
      </div>

      <div className="card section-gap">
        <h2>ช่องทางชำระเงิน</h2>
        <BreakdownBars data={payData} emptyText="ไม่มีข้อมูล" />
      </div>

      <div className="card section-gap">
        <h2>แนวโน้มรายวัน</h2>
        <BreakdownBars data={dayData} emptyText="ไม่มีข้อมูลในช่วงที่เลือก" />
      </div>

      <div className="card section-gap">
        <h2>วิเคราะห์วัสดุสิ้นเปลือง</h2>
        <MaterialAnalysisTable />
      </div>
    </div>
  );
}
