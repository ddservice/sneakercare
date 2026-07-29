import { useEffect, useState } from 'react';
import { type Employee, useEmployees, useSaveEmployees } from '../../lib/queries/employees';

const emptyRow = (): Employee => ({
  name: '', nickname: '', salary: 12000, position: 'พนักงานซักรองเท้า', bank: 'กสิกรไทย', account: '', status: 'Active',
  sso_exempt: false,
});

export default function EmployeesSection() {
  const { data, isLoading } = useEmployees();
  const save = useSaveEmployees();
  const [rows, setRows] = useState<Employee[]>([]);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (data) setRows(data.length ? data : [emptyRow()]);
  }, [data]);

  const updateRow = (idx: number, patch: Partial<Employee>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const removeRow = (idx: number) => {
    if (!window.confirm('ยืนยันลบพนักงานคนนี้?')) return;
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const submit = async () => {
    const list = rows.filter((r) => r.name.trim());
    setStatus({ text: 'กำลังบันทึก...', ok: true });
    try {
      await save.mutateAsync(list);
      setStatus({ text: 'อัปเดตข้อมูลพนักงานสำเร็จเรียบร้อย ✓', ok: true });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ text: 'ข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ'), ok: false });
    }
  };

  if (isLoading) return <div className="card"><p>กำลังโหลด...</p></div>;

  return (
    <div className="card">
      <h2>รายชื่อพนักงาน</h2>
      {rows.map((r, i) => (
        <div key={i} className="init-stock-fieldset">
          <legend>พนักงานคนที่ {i + 1}</legend>
          <label>
            ชื่อจริง (ใช้ในสลิปเงินเดือน)
            <input value={r.name} onChange={(e) => updateRow(i, { name: e.target.value })} />
          </label>
          <label>
            ชื่อเล่น
            <input value={r.nickname} onChange={(e) => updateRow(i, { nickname: e.target.value })} />
          </label>
          <label>
            ตำแหน่ง
            <input value={r.position} onChange={(e) => updateRow(i, { position: e.target.value })} />
          </label>
          <label>
            เงินเดือนฐาน
            <input type="number" min={0} value={r.salary} onChange={(e) => updateRow(i, { salary: +e.target.value })} />
          </label>
          <label>
            ธนาคาร
            <input value={r.bank} onChange={(e) => updateRow(i, { bank: e.target.value })} />
          </label>
          <label>
            เลขบัญชี
            <input value={r.account} onChange={(e) => updateRow(i, { account: e.target.value })} />
          </label>
          <label>
            สถานะ
            <select value={r.status} onChange={(e) => updateRow(i, { status: e.target.value as Employee['status'] })}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox" style={{ width: 'auto' }}
              checked={r.sso_exempt} onChange={(e) => updateRow(i, { sso_exempt: e.target.checked })}
            />
            อยู่ระหว่างทดลองงาน — ยังไม่หักประกันสังคม
          </label>
          <button type="button" onClick={() => removeRow(i)}>ลบ</button>
        </div>
      ))}
      <button type="button" onClick={addRow}>+ เพิ่มพนักงาน</button>
      {status && <p className={status.ok ? 'poc-note' : 'form-error'}>{status.text}</p>}
      <div>
        <button type="button" onClick={submit} disabled={save.isPending}>
          {save.isPending ? 'กำลังบันทึก...' : 'บันทึกรายชื่อพนักงาน'}
        </button>
      </div>
    </div>
  );
}
