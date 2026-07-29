import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // ลิงก์รีเซ็ตรหัสผ่านจากอีเมลทำให้ Supabase ยิง event นี้ (หรือถ้าโหลดหน้าซ้ำหลัง session ตั้งแล้ว
    // ให้เช็ค session ตรงๆ เป็น fallback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setStatus({ text: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', ok: false }); return; }
    if (password !== confirm) { setStatus({ text: 'รหัสผ่านไม่ตรงกัน', ok: false }); return; }
    setBusy(true);
    setStatus(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setStatus({ text: 'ตั้งรหัสผ่านใหม่สำเร็จ ✓ กำลังพาไปหน้าล็อกอิน...', ok: true });
      await supabase.auth.signOut();
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      setStatus({ text: 'ข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'ไม่สำเร็จ'), ok: false });
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>ตั้งรหัสผ่านใหม่</h1>
          <p className="poc-note">กำลังตรวจสอบลิงก์... ถ้าค้างนานเกินไป ลิงก์อาจหมดอายุหรือเปิดมาไม่ถูกทาง กรุณาขอลิงก์ใหม่จากหน้าล็อกอิน</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <h1>ตั้งรหัสผ่านใหม่</h1>
        <label>
          รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </label>
        <label>
          ยืนยันรหัสผ่านใหม่
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {status && <p className={status.ok ? 'poc-note' : 'login-error'}>{status.text}</p>}
        <button type="submit" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}</button>
      </form>
    </div>
  );
}
