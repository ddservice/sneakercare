import { useState, type FormEvent } from 'react';
import type { Role } from '../../lib/types';
import { useUpdateUser, type UserRow } from '../../lib/queries/userMgmt';

export default function EditUserModal({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const update = useUpdateUser();
  const [fullname, setFullname] = useState(user.fullname || '');
  const [nickname, setNickname] = useState(user.nickname || '');
  const [role, setRole] = useState<Role>(user.role || 'manager');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fullname.trim() || !nickname.trim()) { setError('กรุณากรอกชื่อ-นามสกุล และชื่อเรียกให้ครบ'); return; }
    try {
      await update.mutateAsync({ username: user.username, fullname: fullname.trim(), nickname: nickname.trim(), role });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปเดตไม่สำเร็จ');
    }
  };

  return (
    <div className="modal-overlay">
      <form className="modal-card" onSubmit={submit}>
        <h3>แก้ไขผู้ใช้ "{user.username}"</h3>
        <label>
          ชื่อ-นามสกุล
          <input value={fullname} onChange={(e) => setFullname(e.target.value)} />
        </label>
        <label>
          ชื่อเรียก
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </label>
        <label>
          สิทธิ์
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="manager">Manager (กรอกเฉพาะข้อมูลประจำวัน)</option>
            <option value="co-admin">Co-Admin (สิทธิ์เต็ม ยกเว้นตั้งค่าพนักงาน)</option>
            <option value="admin">Admin (สิทธิ์สูงสุดจัดการพนักงานและบัญชี)</option>
            {role === 'staff' && <option value="staff">Staff (ค่าเก่า — แนะนำเปลี่ยนเป็น Manager)</option>}
          </select>
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>ยกเลิก</button>
          <button type="submit" disabled={update.isPending}>
            {update.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </form>
    </div>
  );
}
