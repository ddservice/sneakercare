import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useEmployees, type Employee } from '../../lib/queries/employees';
import { useSales } from '../../lib/queries/sales';
import { useBizSettings } from '../../lib/queries/settings';
import {
  computeCommission, computeNet, computeSso, computeWht, emptyDraft, loadEmployeeDraft, PCT_OPTIONS,
  sumDeductions, usePayrollMonth, useSavePayroll, type DeductItem, type EmployeePayrollDraft,
} from '../../lib/queries/payroll';
import { printPayslip } from '../../lib/printPayslip';
import { currentMonthValue, fc } from '../../lib/format';
import MonthPicker from '../../components/MonthPicker';

const toMonthKey = (val: string) => {
  const [y, mm] = val.split('-');
  return `${mm}/${y}`;
};
const monthRange = (val: string) => {
  const [y, mm] = val.split('-').map(Number);
  const from = `${y}-${String(mm).padStart(2, '0')}-01`;
  const to = new Date(y, mm, 0).toISOString().slice(0, 10);
  return { from, to };
};

const emptyDeduct = (): DeductItem => ({ type: 'ขาด', detail: '', minutes: 0, rate: 0, amount: 0 });

function DeductRow({ item, onChange, onRemove }: { item: DeductItem; onChange: (i: DeductItem) => void; onRemove: () => void }) {
  const isLate = item.type === 'มาสาย';
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
      <select value={item.type} onChange={(e) => {
        const type = e.target.value as DeductItem['type'];
        onChange(type === 'มาสาย' ? { ...item, type } : { ...item, type, minutes: 0, rate: 0 });
      }}>
        <option value="ขาด">ขาด</option>
        <option value="ลา">ลา</option>
        <option value="มาสาย">มาสาย</option>
        <option value="อื่นๆ">อื่นๆ</option>
      </select>
      <input placeholder="รายละเอียด" value={item.detail} onChange={(e) => onChange({ ...item, detail: e.target.value })} style={{ flex: 1 }} />
      {isLate && (
        <>
          <input type="number" placeholder="นาที" min={0} value={item.minutes} style={{ width: 64 }}
            onChange={(e) => { const minutes = +e.target.value; onChange({ ...item, minutes, amount: Math.round(minutes * item.rate) }); }} />
          <span>นาที ×</span>
          <input type="number" placeholder="฿/นาที" min={0} value={item.rate} style={{ width: 70 }}
            onChange={(e) => { const rate = +e.target.value; onChange({ ...item, rate, amount: Math.round(item.minutes * rate) }); }} />
        </>
      )}
      <input type="number" min={0} value={item.amount} style={{ width: 80 }}
        onChange={(e) => onChange({ ...item, amount: +e.target.value })} />
      <span>฿</span>
      <button type="button" onClick={onRemove}>✕</button>
    </div>
  );
}

function EmployeePanel({
  emp, draft, monthSales, monthKey, onChange, onPrint,
}: {
  emp: Employee;
  draft: EmployeePayrollDraft;
  monthSales: number;
  monthKey: string;
  onChange: (d: EmployeePayrollDraft) => void;
  onPrint: () => void;
}) {
  const commAmt = computeCommission(monthSales, draft.commPct);
  const sso = computeSso(emp.salary);
  const wht = computeWht(commAmt);
  const deductTotal = sumDeductions(draft.deductItems);
  const net = computeNet(emp.salary, commAmt, draft.diligence, draft.ot, deductTotal);

  return (
    <div className="init-stock-fieldset">
      <legend>{emp.name} {emp.nickname && `(${emp.nickname})`} — {emp.position}</legend>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <label>
          เงินเดือน
          <input type="number" value={emp.salary} readOnly />
        </label>
        <label>
          ค่าคอมมิชชัน (%)
          <select value={draft.commPct} onChange={(e) => onChange({ ...draft, commPct: +e.target.value })}>
            {PCT_OPTIONS.map((p) => <option key={p} value={p}>{p === 0 ? 'ไม่มี' : p + '%'}</option>)}
          </select>
          <p className="poc-note">คำนวณ: {fc(commAmt)} ฿ (ยอดขายเดือนนี้ {fc(monthSales)} ฿)</p>
        </label>
        <label>
          ค่าเบี้ยขยัน
          <input type="number" min={0} value={draft.diligence} onChange={(e) => onChange({ ...draft, diligence: +e.target.value })} />
        </label>
        <label>
          ค่าโอที (OT)
          <input type="number" min={0} value={draft.ot} onChange={(e) => onChange({ ...draft, ot: +e.target.value })} />
        </label>
      </div>

      <p className="poc-note">ประกันสังคม (ลูกจ้าง 5%): {fc(sso)} ฿ — ภาษีหัก ณ ที่จ่าย 3% (คอมมิชชัน): {fc(wht)} ฿</p>

      <div>
        {draft.deductItems.map((item, i) => (
          <DeductRow
            key={i}
            item={item}
            onChange={(next) => onChange({ ...draft, deductItems: draft.deductItems.map((d, idx) => (idx === i ? next : d)) })}
            onRemove={() => onChange({ ...draft, deductItems: draft.deductItems.filter((_, idx) => idx !== i) })}
          />
        ))}
        <button type="button" onClick={() => onChange({ ...draft, deductItems: [...draft.deductItems, emptyDeduct()] })}>
          + เพิ่มรายการหัก
        </button>
        <span className="poc-note"> รวมหัก (ไม่นับ ปกส.): {fc(deductTotal)} ฿</span>
      </div>

      <h3>สุทธิที่ต้องโอน: {fc(net)} ฿ <span className="poc-note">({emp.bank || '-'} {emp.account || '-'})</span></h3>
      <p className="poc-note">เดือน: {monthKey}</p>
      <button type="button" onClick={onPrint}>ใบจ่ายเงิน</button>
    </div>
  );
}

export default function PayrollSection() {
  const { auth } = useAuth();
  const [monthVal, setMonthVal] = useState(currentMonthValue());
  const monthKey = toMonthKey(monthVal);
  const { from, to } = monthRange(monthVal);

  const { data: employees } = useEmployees();
  const { data: opexRows, isLoading } = usePayrollMonth(monthKey);
  const { data: sales } = useSales(from, to);
  const { data: biz } = useBizSettings();
  const save = useSavePayroll();

  const monthSalesTotal = (sales ?? []).reduce((s, r) => s + r.total_revenue, 0);
  const activeEmployees = (employees ?? []).filter((e) => e.status !== 'Inactive');

  const [drafts, setDrafts] = useState<Record<string, EmployeePayrollDraft>>({});
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!opexRows || !activeEmployees.length) return;
    const next: Record<string, EmployeePayrollDraft> = {};
    activeEmployees.forEach((emp) => { next[emp.name] = loadEmployeeDraft(opexRows, emp.name); });
    setDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opexRows, employees, monthKey]);

  const submit = async () => {
    setStatus({ text: 'กำลังบันทึก...', ok: true });
    try {
      await save.mutateAsync({
        monthKey,
        employees: activeEmployees.map((emp) => {
          const d = drafts[emp.name] || emptyDraft();
          const commAmt = computeCommission(monthSalesTotal, d.commPct);
          return { employee: emp, commPct: d.commPct, commAmt, diligence: d.diligence, ot: d.ot, deductItems: d.deductItems };
        }),
        recordedBy: auth?.displayName || auth?.username || 'Staff',
        username: auth?.username || '', role: auth?.role || '',
      });
      setStatus({ text: `บันทึกเงินเดือนเดือน ${monthKey} สำเร็จ ✓`, ok: true });
      setTimeout(() => setStatus(null), 4000);
    } catch (err) {
      setStatus({ text: 'ข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ'), ok: false });
    }
  };

  const doPrint = (emp: Employee) => {
    const d = drafts[emp.name] || emptyDraft();
    const commAmt = computeCommission(monthSalesTotal, d.commPct);
    const deductTotal = sumDeductions(d.deductItems);
    const net = computeNet(emp.salary, commAmt, d.diligence, d.ot, deductTotal);
    printPayslip({
      employeeId: emp.id, employeeName: emp.name, bank: emp.bank, account: emp.account, monthKey,
      baseSal: emp.salary, comm: commAmt, commPct: d.commPct, diligence: d.diligence, ot: d.ot,
      sso: computeSso(emp.salary), wht: computeWht(commAmt), deductItems: d.deductItems, net,
      biz: biz ?? { name: 'Sneaker Care Shop', phone: '', address: '', tax_id: '', logo_url: '', price_s: 200, price_m: 400, price_l: 600, price_xl: 800 },
      payerName: auth?.fullName || auth?.displayName || auth?.username || biz?.name || 'Sneaker Care Shop',
    });
  };

  return (
    <div className="card section-gap">
      <h2>เงินเดือนพนักงาน</h2>
      <label>
        เดือน
        <MonthPicker value={monthVal} onChange={setMonthVal} />
      </label>
      {isLoading ? (
        <p>กำลังโหลด...</p>
      ) : !activeEmployees.length ? (
        <p className="empty-row">ยังไม่มีรายชื่อพนักงาน — เพิ่มที่หัวข้อ "รายชื่อพนักงาน" ด้านล่างก่อน</p>
      ) : (
        <>
          {activeEmployees.map((emp) => (
            <EmployeePanel
              key={emp.name}
              emp={emp}
              draft={drafts[emp.name] || emptyDraft()}
              monthSales={monthSalesTotal}
              monthKey={monthKey}
              onChange={(d) => setDrafts((prev) => ({ ...prev, [emp.name]: d }))}
              onPrint={() => doPrint(emp)}
            />
          ))}
          {status && <p className={status.ok ? 'poc-note' : 'form-error'}>{status.text}</p>}
          <button type="button" onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'กำลังบันทึก...' : 'บันทึกเงินเดือนพนักงานทั้งหมด'}
          </button>
        </>
      )}
    </div>
  );
}
