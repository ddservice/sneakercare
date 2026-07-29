import { useEffect, useState } from 'react';
import { UI_PERM_FEATURES, useSaveUiPermissions, useUiPermissions, type PermRole } from '../../lib/queries/uiPermissions';

type Grid = Record<string, { coAdmin: boolean; manager: boolean }>;

export default function RolePermissionsSection() {
  const { data, isLoading } = useUiPermissions();
  const save = useSaveUiPermissions();
  const [grid, setGrid] = useState<Grid>({});
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!data) return;
    const next: Grid = {};
    UI_PERM_FEATURES.forEach((f) => {
      next[f.key] = { coAdmin: data.get(`co-admin:${f.key}`) ?? false, manager: data.get(`manager:${f.key}`) ?? false };
    });
    setGrid(next);
  }, [data]);

  const toggle = (key: string, role: 'coAdmin' | 'manager') => {
    setGrid((prev) => ({ ...prev, [key]: { ...prev[key], [role]: !prev[key]?.[role] } }));
  };

  const submit = async () => {
    setStatus({ text: 'กำลังบันทึก...', ok: true });
    const rows: { role: PermRole; feature_key: string; visible: boolean }[] = [];
    UI_PERM_FEATURES.forEach((f) => {
      rows.push({ role: 'co-admin', feature_key: f.key, visible: !!grid[f.key]?.coAdmin });
      rows.push({ role: 'manager', feature_key: f.key, visible: !!grid[f.key]?.manager });
    });
    try {
      await save.mutateAsync(rows);
      setStatus({ text: 'บันทึกสิทธิ์การมองเห็นเมนูสำเร็จ ✓ (มีผลกับผู้ใช้อื่นตอนล็อกอินครั้งถัดไป)', ok: true });
      setTimeout(() => setStatus(null), 4000);
    } catch (err) {
      setStatus({ text: 'ข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ'), ok: false });
    }
  };

  if (isLoading) return <div className="card section-gap"><p>กำลังโหลด...</p></div>;

  return (
    <div className="card section-gap">
      <h2>สิทธิ์การมองเห็นเมนู (Role Permissions)</h2>
      <p className="poc-note">
        Admin เห็นทุกอย่างเสมอ ตารางนี้คุมแค่ว่า Co-Admin / Staff จะเห็นเมนู/การ์ดไหนบ้าง — การบังคับสิทธิ์จริง
        (เขียน/อ่านข้อมูล) อยู่ที่ระดับฐานข้อมูล (RLS) เสมอ ไม่ใช่ที่ checkbox นี้
      </p>
      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr><th>เมนู/การ์ด</th><th>Co-Admin</th><th>Staff</th></tr>
        </thead>
        <tbody>
          {UI_PERM_FEATURES.map((f) => (
            <tr key={f.key}>
              <td>{f.label}</td>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={!!grid[f.key]?.coAdmin} onChange={() => toggle(f.key, 'coAdmin')} />
              </td>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={!!grid[f.key]?.manager} onChange={() => toggle(f.key, 'manager')} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {status && <p className={status.ok ? 'poc-note' : 'form-error'}>{status.text}</p>}
      <button type="button" onClick={submit} disabled={save.isPending}>
        {save.isPending ? 'กำลังบันทึก...' : 'บันทึกสิทธิ์'}
      </button>
    </div>
  );
}
