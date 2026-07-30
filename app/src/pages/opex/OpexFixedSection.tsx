import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { type MiscItem, OPEX_ITEMS, useOpexMonth, useSaveOpexFixed } from '../../lib/queries/opex';
import { currentMonthValue, fc2 } from '../../lib/format';
import MonthPicker from '../../components/MonthPicker';
import { IconTrash } from '../../components/Icons';

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

            {miscItems.length > 0 && (
              <div className="flex flex-col gap-2 mb-3">
                {miscItems.map((m, i) => (
                  <div key={i} className="grid grid-cols-12 gap-3 items-center text-[13px]">
                    <span className="col-span-5 truncate">{m.name}</span>
                    <span className="col-span-3 text-right">{fc2(m.amount)} ฿</span>
                    <select
                      value={m.method} onChange={(e) => updateMiscMethod(i, e.target.value)}
                      className="col-span-3"
                    >
                      <option value="บัญชีร้าน">บัญชีร้าน (โอน)</option>
                      <option value="เงินสดร้าน">เงินสดร้าน</option>
                    </select>
                    <button
                      type="button" onClick={() => removeMisc(i)} aria-label="ลบรายการ"
                      className="col-span-1 !flex !justify-center !items-center !bg-transparent !text-red-500 hover:!text-red-700 !border-0 !shadow-none !p-1"
                    >
                      <IconTrash width={16} height={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-12 gap-3 items-end mt-2">
              <label className="col-span-12 sm:col-span-5 flex flex-col gap-1.5 !m-0">
                ชื่อรายการ
                <input placeholder="เช่น ค่าซ่อมอุปกรณ์" value={miscName} onChange={(e) => setMiscName(e.target.value)} />
              </label>
              <label className="col-span-6 sm:col-span-3 flex flex-col gap-1.5 !m-0">
                จำนวนเงิน
                <input type="number" placeholder="0" min={0} value={miscAmt} onChange={(e) => setMiscAmt(+e.target.value)} />
              </label>
              <label className="col-span-6 sm:col-span-3 flex flex-col gap-1.5 !m-0">
                ช่องทาง
                <select value={miscItemMethod} onChange={(e) => setMiscItemMethod(e.target.value)}>
                  <option value="บัญชีร้าน">บัญชีร้าน (โอน)</option>
                  <option value="เงินสดร้าน">เงินสดร้าน</option>
                </select>
              </label>
              <button
                type="button" onClick={addMisc}
                className="col-span-12 sm:col-span-1 !bg-indigo-50 !text-indigo-600 hover:!bg-indigo-100 !border-0 !shadow-none !px-4 !py-2.5"
              >
                + เพิ่ม
              </button>
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
