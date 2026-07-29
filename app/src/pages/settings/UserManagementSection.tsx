import { useState, type FormEvent } from 'react';
import { useAuth } from '../../lib/AuthContext';
import type { Role } from '../../lib/types';
import { useCreateUser, useDeleteUserProfile, useUsers, type UserRow } from '../../lib/queries/userMgmt';
import EditUserModal from './EditUserModal';

const ROLE_LABEL: Record<string, string> = { admin: 'Admin', 'co-admin': 'Co-Admin' };

export default function UserManagementSection() {
  const { auth } = useAuth();
  const { data: users, isLoading } = useUsers();
  const createUser = useCreateUser();
  const deleteUser = useDeleteUserProfile();

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  const [username, setUsername] = useState('');
  const [fullname, setFullname] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('manager');

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !fullname || !nickname || !password) {
      setStatus({ text: 'กรุณากรอกข้อมูลให้ครบถ้วน', ok: false });
      return;
    }
    if (password.length < 6) {
      setStatus({ text: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', ok: false });
      return;
    }
    setStatus({ text: 'กำลังสร้างผู้ใช้ใหม่...', ok: true });
    try {
      await createUser.mutateAsync({ username, fullname, nickname, password, role });
      setStatus({ text: 'สร้างผู้ใช้ใหม่สำเร็จ ✓', ok: true });
      setUsername(''); setFullname(''); setNickname(''); setPassword(''); setRole('manager');
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ text: 'ข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'สร้างไม่สำเร็จ'), ok: false });
    }
  };

  const resetPassword = (u: string) => {
    window.alert(`กรุณา Reset Password ของ "${u}" ใน Supabase Dashboard → Authentication → Users (ระบบนี้เปลี่ยนรหัสผ่านผู้ใช้อื่นจากฝั่งแอปไม่ได้ด้วยเหตุผลด้านความปลอดภัย)`);
  };

  const doDelete = async (u: string) => {
    if (!window.confirm(`คุณต้องการลบผู้ใช้งาน "${u}" ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`)) return;
    setStatus({ text: 'กำลังลบผู้ใช้งาน...', ok: true });
    try {
      await deleteUser.mutateAsync(u);
      setStatus({ text: 'ลบ Profile สำเร็จ ✓ (ต้องลบ Auth User ใน Supabase Dashboard เพิ่มด้วย มิฉะนั้นยังล็อกอินได้)', ok: true });
      setTimeout(() => setStatus(null), 5000);
    } catch (err) {
      setStatus({ text: 'ข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'ลบไม่สำเร็จ'), ok: false });
    }
  };

  return (
    <div className="card section-gap">
      <h2>จัดการผู้ใช้งานระบบ</h2>

      {isLoading ? (
        <p>กำลังโหลด...</p>
      ) : !users?.length ? (
        <p className="empty-row">ไม่พบข้อมูลผู้ใช้งาน</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Username</th><th>ชื่อ-นามสกุล</th><th>ชื่อเรียก</th><th>สิทธิ์</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.username}>
                  <td><strong>{u.username}</strong></td>
                  <td>{u.fullname || ''}</td>
                  <td>{u.nickname || ''}</td>
                  <td><span className={'role-chip' + (u.role === 'admin' ? ' admin' : u.role === 'co-admin' ? ' co-admin' : '')}>{ROLE_LABEL[u.role] || 'Manager'}</span></td>
                  <td className="row-actions">
                    <button onClick={() => setEditing(u)}>แก้ไข</button>
                    <button onClick={() => resetPassword(u.username)}>เปลี่ยนรหัสผ่าน</button>
                    <button onClick={() => doDelete(u.username)} disabled={u.username === auth?.username}>ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>เพิ่มผู้ใช้ใหม่</h3>
      <form onSubmit={submitCreate}>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          ชื่อ-นามสกุล
          <input value={fullname} onChange={(e) => setFullname(e.target.value)} />
        </label>
        <label>
          ชื่อเรียก
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </label>
        <label>
          รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          สิทธิ์
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="manager">Manager (กรอกเฉพาะข้อมูลประจำวัน)</option>
            <option value="co-admin">Co-Admin (สิทธิ์เต็ม ยกเว้นตั้งค่าพนักงาน)</option>
            <option value="admin">Admin (สิทธิ์สูงสุดจัดการพนักงานและบัญชี)</option>
          </select>
        </label>
        {status && <p className={status.ok ? 'poc-note' : 'form-error'}>{status.text}</p>}
        <button type="submit" disabled={createUser.isPending}>
          {createUser.isPending ? 'กำลังสร้าง...' : 'สร้างผู้ใช้ใหม่'}
        </button>
      </form>

      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
