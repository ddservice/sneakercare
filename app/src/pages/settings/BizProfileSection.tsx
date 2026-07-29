import { useEffect, useState } from 'react';
import { useBizSettings, useSaveSettings } from '../../lib/queries/settings';

export default function BizProfileSection() {
  const { data, isLoading } = useBizSettings();
  const save = useSaveSettings();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [taxId, setTaxId] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoError, setLogoError] = useState(false);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!data) return;
    setName(data.name); setPhone(data.phone); setAddress(data.address);
    setTaxId(data.tax_id); setLogoUrl(data.logo_url);
  }, [data]);

  const submit = async () => {
    setStatus({ text: 'กำลังบันทึก...', ok: true });
    try {
      await save.mutateAsync({ name, phone, address, tax_id: taxId, logo_url: logoUrl });
      setStatus({ text: 'บันทึกโปรไฟล์ร้านค้าสำเร็จเรียบร้อย ✓', ok: true });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ text: 'ข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ'), ok: false });
    }
  };

  if (isLoading) return <div className="card"><p>กำลังโหลด...</p></div>;

  return (
    <div className="card">
      <h2>โปรไฟล์ร้านค้า</h2>
      <label>
        ชื่อร้าน
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        เบอร์โทร
        <input value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label>
        ที่อยู่
        <input value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <label>
        เลขประจำตัวผู้เสียภาษี
        <input value={taxId} onChange={(e) => setTaxId(e.target.value)} />
      </label>
      <label>
        URL โลโก้ (อัปโหลดรูปแล้ววาง URL ที่ได้ตรงนี้)
        <input value={logoUrl} onChange={(e) => { setLogoUrl(e.target.value); setLogoError(false); }} />
      </label>
      {logoUrl.startsWith('http') && (
        logoError ? (
          <p className="form-error">โหลดรูปโลโก้ไม่สำเร็จ ตรวจสอบ URL อีกครั้ง</p>
        ) : (
          <img src={logoUrl} alt="โลโก้ร้าน" style={{ height: 60, marginBottom: 10 }} onError={() => setLogoError(true)} />
        )
      )}
      {status && <p className={status.ok ? 'poc-note' : 'form-error'}>{status.text}</p>}
      <button type="button" onClick={submit} disabled={save.isPending}>
        {save.isPending ? 'กำลังบันทึก...' : 'บันทึกโปรไฟล์ร้าน'}
      </button>
    </div>
  );
}
