import { useEffect, useState } from 'react';
import { useSaveTelegramSettings, useTelegramSettings } from '../../lib/queries/telegram';

export default function TelegramSection() {
  const { data, isLoading } = useTelegramSettings();
  const save = useSaveTelegramSettings();
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (data) setChatId(data.chatId);
  }, [data]);

  const submit = async () => {
    setStatus({ text: 'กำลังบันทึก...', ok: true });
    try {
      await save.mutateAsync({ token, chatId });
      setStatus({ text: 'บันทึกการตั้งค่าเรียบร้อย ✓', ok: true });
      setToken('');
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ text: 'ข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ'), ok: false });
    }
  };

  return (
    <div className="card section-gap">
      <h2>แจ้งเตือนสต๊อกต่ำผ่าน Telegram</h2>
      {isLoading ? (
        <p>กำลังโหลด...</p>
      ) : (
        <p className="poc-note">
          {data?.status.is_set
            ? `ตั้งค่าแล้ว (ลงท้าย ****${data.status.value_suffix}) แก้ไขล่าสุด ${data.status.updated_at ? new Date(data.status.updated_at).toLocaleString('th-TH') : '-'}`
            : 'ยังไม่ได้ตั้งค่า Bot Token'}
        </p>
      )}
      <label>
        Bot Token (กรอกเฉพาะตอนต้องการเปลี่ยน — เว้นว่างไว้ถ้าไม่เปลี่ยน)
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ค่าเดิมจะไม่ถูกแสดงกลับมาให้เห็น" />
      </label>
      <label>
        Chat ID กลุ่มพนักงาน
        <input value={chatId} onChange={(e) => setChatId(e.target.value)} />
      </label>
      {status && <p className={status.ok ? 'poc-note' : 'form-error'}>{status.text}</p>}
      <button type="button" onClick={submit} disabled={save.isPending}>
        {save.isPending ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า Telegram'}
      </button>
    </div>
  );
}
