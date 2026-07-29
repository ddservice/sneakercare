import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { type MiscItem, OPEX_ITEMS, useOpexMonth, useSaveOpexFixed } from '../../lib/queries/opex';

const fc = (v: number) => v.toLocaleString('th-TH', { minimumFractionDigits: 2 });
const currentMonthValue = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
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
  const [miscMethod, setMiscMethod] = useState('บัญชีร้าน');
  const [miscName, setMiscName] = useState('');
  const [miscAmt, setMiscAmt] = useState(0);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    const next: FixedState = {};
    OPEX_ITEMS.forEach((item) => {
      const saved = opexRows?.find((o) => o.key === item.key);
      next[item.key] = { amount: saved?.amount ?? 0, method: saved?.pay_method || 'บัญชีร้าน' };
    });
    setFixed(next);
    const miscSaved = opexRows?.find((o) => o.key === 'misc');
    setMiscMethod(miscSaved?.pay_method || 'บัญชีร้าน');
    const miscJson = opexRows?.find((o) => o.key === 'misc_items_json');
    if (miscJson) {
      try { setMiscItems(JSON.parse(miscJson.name) || []); } catch { setMiscItems([]); }
    } else {
      setMiscItems([]);
    }
  }, [opexRows]);

  const fixedTotal = OPEX_ITEMS.reduce((s, item) => s + (fixed[item.key]?.amount || 0), 0);
  const miscTotal = miscItems.reduce((s, m) => s + m.amount, 0);
  const grandTotal = fixedTotal + miscTotal;

  const addMisc = () => {
    if (!miscName.trim() || miscAmt <= 0) return;
    setMiscItems((prev) => [...prev, { name: miscName.trim(), amount: miscAmt }]);
    setMiscName(''); setMiscAmt(0);
  };
  const removeMisc = (idx: number) => setMiscItems((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    const isEdit = (opexRows?.length ?? 0) > 0;
    if (isEdit && !window.confirm(`ข้อมูลเดือน ${monthKey} มีอยู่แล้ว ต้องการบันทึกทับหรือไม่?`)) return;
    setStatus({ text: 'กำลังบันทึก...', ok: true });
    try {
      await save.mutateAsync({
        monthKey, fixed, miscItems, miscMethod,
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
        <input type="month" value={monthVal} onChange={(e) => setMonthVal(e.target.value)} style={{ maxWidth: 180 }} />
      </label>
      {isLoading ? (
        <p>กำลังโหลด...</p>
      ) : (
        <>
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

          <div className="init-stock-fieldset">
            <legend>ค่าใช้จ่ายจิปาถะอื่นๆ</legend>
            <select value={miscMethod} onChange={(e) => setMiscMethod(e.target.value)} style={{ marginBottom: 8, maxWidth: 200 }}>
              <option value="บัญชีร้าน">บัญชีร้าน (เงินโอน)</option>
              <option value="เงินสดร้าน">เงินสดร้าน</option>
            </select>
            {miscItems.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                <span>{m.name}</span>
                <span>{fc(m.amount)} ฿ <button type="button" onClick={() => removeMisc(i)}>×</button></span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6 }}>
              <input placeholder="ชื่อรายการ" value={miscName} onChange={(e) => setMiscName(e.target.value)} />
              <input type="number" placeholder="จำนวนเงิน" min={0} value={miscAmt} onChange={(e) => setMiscAmt(+e.target.value)} style={{ maxWidth: 100 }} />
              <button type="button" onClick={addMisc}>+ เพิ่มรายการ</button>
            </div>
            <p className="poc-note">รวมจิปาถะ: {fc(miscTotal)} ฿</p>
          </div>

          <h3>รวมค่าใช้จ่ายดำเนินการ: {fc(grandTotal)} ฿</h3>
          {status && <p className={status.ok ? 'poc-note' : 'form-error'}>{status.text}</p>}
          <button type="button" onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'กำลังบันทึก...' : 'บันทึกค่าใช้จ่ายดำเนินการ'}
          </button>
        </>
      )}
    </div>
  );
}
