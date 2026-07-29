import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { EMAIL_DOMAIN, useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim()) { setStatus({ text: 'กรุณากรอกชื่อผู้ใช้', ok: false }); return; }
    setBusy(true);
    setStatus(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(username.trim() + EMAIL_DOMAIN, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setStatus({ text: 'ถ้าชื่อผู้ใช้นี้มีในระบบ จะมีอีเมลลิงก์ตั้งรหัสผ่านใหม่ส่งไปแล้ว', ok: true });
    } catch (err) {
      setStatus({ text: 'ข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'ส่งไม่สำเร็จ'), ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="login-card" onSubmit={submit}>
      <h1>ลืมรหัสผ่าน</h1>
      <label>
        ชื่อผู้ใช้
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
      </label>
      {status && <p className={status.ok ? 'poc-note' : 'login-error'}>{status.text}</p>}
      <button type="submit" disabled={busy}>{busy ? 'กำลังส่ง...' : 'ส่งลิงก์ตั้งรหัสผ่านใหม่'}</button>
      <button type="button" onClick={onBack} className="theme-toggle" style={{ width: '100%', marginTop: 8 }}>
        กลับไปหน้าล็อกอิน
      </button>
    </form>
  );
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await login(username, password);
      navigate('/', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'เชื่อมต่อไม่ได้';
      setError(message.includes('Invalid') ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' : message);
    } finally {
      setBusy(false);
    }
  };

  if (showForgot) {
    return (
      <div className="login-screen">
        <ForgotPasswordForm onBack={() => setShowForgot(false)} />
      </div>
    );
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <h1>SneakerCare</h1>
        <label>
          ชื่อผู้ใช้
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label>
          รหัสผ่าน
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="login-error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
        </button>
        <button
          type="button"
          onClick={() => setShowForgot(true)}
          className="theme-toggle"
          style={{ width: '100%', marginTop: 8, border: 'none' }}
        >
          ลืมรหัสผ่าน?
        </button>
      </form>
    </div>
  );
}
