import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { type MiscItem, OPEX_ITEMS, useOpexMonth, useSaveOpexFixed } from '../../lib/queries/opex';
import { currentMonthValue, fc2 } from '../../lib/format';
import MonthPicker from '../../components/MonthPicker';

const toMonthKey = (val: string) => {
  const [y, mm] = val.split('-');
  return `${mm}/${y}`;
};

type FixedState = Record<string, { amount: number; method: string }>;

export default function OpexFixedSection() {
  const { auth } = useAuth();
  const [monthVal, setMonthVal] = useState(currentMonthValue());
  const monthKey = toMonthKey(monthVal);
  const { data: opexRows, isLoading } = useOpexMonth(monthKey);
  const save = useSaveOpexFixed();

  const [fixed, setFixed] = useState<FixedState>({});
  const [miscItems, setMiscItems] = useState<MiscItem[]>([]);
  const [miscName, setMiscName] = useState('');
  const [miscAmt, setMiscAmt] = useState(0);
  const [miscItemMethod, setMiscItemMethod] = useState('บัญชีร้าน');
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    const next: FixedState = {};
    OPEX_ITEMS.forEach((item) => {
      const saved = opexRows?.find((o) => o.key === item.key);
      next[item.key] = { amount: saved?.amount ?? 0, method: saved?.pay_method || 'บัญชีร้าน' };
    });
    setFixed(next);
    const miscJson = opexRows?.find((o) => o.key === 'misc_items_json');
    if (miscJson) {
      try {
        const parsed = JSON.parse(miscJson.name) || [];
        // ข้อมูลเก่าก่อนแยกช่องทางต่อรายการยังไม่มี method — ใส่ค่าเริ่มต้นให้เพื่อไม่ให้พัง
        setMiscItems(parsed.map((m: Partial<MiscItem>) => ({ name: m.name || '', amount: m.amount || 0, method: m.method || 'บัญชีร้าน' })));
      } catch { setMiscItems([]); }
    } else {
      setMiscItems([]);
    }
  }, [opexRows]);

  const fixedTotal = OPEX_ITEMS.reduce((s, item) => s + (fixed[item.key]?.amount || 0), 0);
  const miscTotal = miscItems.reduce((s, m) => s + m.amount, 0);
  const grandTotal = fixedTotal + miscTotal;

  const addMisc = () => {
    if (!miscName.trim() || miscAmt <= 0) return;
    setMiscItems((prev) => [...prev, { name: miscName.trim(), amount: miscAmt, method: miscItemMethod }]);
    setMiscName(''); setMiscAmt(0);
  };
  const removeMisc = (idx: number) => setMiscItems((prev) => prev.filter((_, i) => i !== idx));
  const updateMiscMethod = (idx: number, method: string) =>
    setMiscItems((prev) => prev.map((m, i) => (i === idx ? { ...m, method } : m)));

  const submit = async () => {
    const isEdit = (opexRows?.length ?? 0) > 0;
    if (isEdit && !window.confirm(`ข้อมูลเดือน ${monthKey} มีอยู่แล้ว ต้องการบันทึกทับหรือไม่?`)) return;
    setStatus({ text: 'กำลังบันทึก...', ok: true });
    try {
      await save.mutateAsync({
        monthKey, fixed, miscItems,
        recordedBy: auth?.displayName || auth?.username || 'Staff',
        username: auth?.username || '', role: auth?.role || '',
      });
      setStatus({ text: `บันทึกบัญชีเดือน ${monthKey} สำเร็จ ✓`, ok: true });
      setTimeout(() => setStatus(null), 4000);
    } catch (err) {
      setStatus({ text: 'ข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ'), ok: false });
    }
  };

  return (
    <div className="card section-gap">
      <h2>ค่าใช้จ่ายดำเนินการร้าน (รายเดือน)</h2>
      <label>
        เดือน
        <MonthPicker value={monthVal} onChange={setMonthVal} />
      </label>
      {isLoading ? (
        <p>กำลังโหลด...</p>
      ) : (
        <>
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>รายการ</th><th>ช่องทาง</th><th>จำนวนเงิน</th></tr>
            </thead>
            <tbody>
              {OPEX_ITEMS.map((item) => (
                <tr key={item.key}>
                  <td>{item.name}</td>
                  <td>
                    <select
                      value={fixed[item.key]?.method || 'บัญชีร้าน'}
                      onChange={(e) => setFixed((f) => ({ ...f, [item.key]: { ...f[item.key], method: e.target.value } }))}
                    >
                      <option value="บัญชีร้าน">บัญชีร้าน (เงินโอน)</option>
                      <option value="เงินสดร้าน">เงินสดร้าน</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number" min={0} style={{ width: 110 }}
                      value={fixed[item.key]?.amount || 0}
                      onChange={(e) => setFixed((f) => ({ ...f, [item.key]: { ...f[item.key], amount: +e.target.value } }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <div className="init-stock-fieldset">
            <legend>ค่าใช้จ่ายจิปาถะอื่นๆ</legend>
            {miscItems.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, fontSize: 13, padding: '4px 0', flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 120px' }}>{m.name}</span>
                <select value={m.method} onChange={(e) => updateMiscMethod(i, e.target.value)} style={{ maxWidth: 170 }}>
                  <option value="บัญชีร้าน">บัญชีร้าน (เงินโอน)</option>
                  <option value="เงินสดร้าน">เงินสดร้าน</option>
                </select>
                <span>{fc2(m.amount)} ฿ <button type="button" onClick={() => removeMisc(i)}>×</button></span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <input placeholder="ชื่อรายการ" value={miscName} onChange={(e) => setMiscName(e.target.value)} style={{ flex: '2 1 140px' }} />
              <input type="number" placeholder="จำนวนเงิน" min={0} value={miscAmt} onChange={(e) => setMiscAmt(+e.target.value)} style={{ flex: '1 1 90px' }} />
              <select value={miscItemMethod} onChange={(e) => setMiscItemMethod(e.target.value)} style={{ flex: '1 1 140px' }}>
                <option value="บัญชีร้าน">บัญชีร้าน (เงินโอน)</option>
                <option value="เงินสดร้าน">เงินสดร้าน</option>
              </select>
              <button type="button" onClick={addMisc}>+ เพิ่มรายการ</button>
            </div>
            <p className="poc-note">รวมจิปาถะ: {fc2(miscTotal)} ฿</p>
          </div>

          <h3>รวมค่าใช้จ่ายดำเนินการ: {fc2(grandTotal)} ฿</h3>
          {status && <p className={status.ok ? 'poc-note' : 'form-error'}>{status.text}</p>}
          <button type="button" onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'กำลังบันทึก...' : 'บันทึกค่าใช้จ่ายดำเนินการ'}
          </button>
        </>
      )}
    </div>
  );
}
