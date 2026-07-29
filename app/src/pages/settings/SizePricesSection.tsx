import { useEffect, useState } from 'react';
import { useBizSettings, useSaveSettings } from '../../lib/queries/settings';

export default function SizePricesSection() {
  const { data, isLoading } = useBizSettings();
  const save = useSaveSettings();
  const [prices, setPrices] = useState({ s: 200, m: 400, l: 600, xl: 800 });
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!data) return;
    setPrices({ s: data.price_s, m: data.price_m, l: data.price_l, xl: data.price_xl });
  }, [data]);

  const submit = async () => {
    setStatus({ text: 'กำลังบันทึกราคา...', ok: true });
    try {
      await save.mutateAsync({ price_s: prices.s, price_m: prices.m, price_l: prices.l, price_xl: prices.xl });
      setStatus({ text: 'บันทึกราคาสำเร็จ ✓', ok: true });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ text: 'ข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ'), ok: false });
    }
  };

  if (isLoading) return <div className="card section-gap"><p>กำลังโหลด...</p></div>;

  return (
    <div className="card section-gap">
      <h2>ราคาต่อไซส์ (บาท/คู่)</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
        {(['s', 'm', 'l', 'xl'] as const).map((sz) => (
          <label key={sz}>
            {sz.toUpperCase()}
            <input type="number" min={0} value={prices[sz]} onChange={(e) => setPrices((p) => ({ ...p, [sz]: +e.target.value }))} />
          </label>
        ))}
      </div>
      {status && <p className={status.ok ? 'poc-note' : 'form-error'}>{status.text}</p>}
      <button type="button" onClick={submit} disabled={save.isPending}>
        {save.isPending ? 'กำลังบันทึก...' : 'บันทึกราคา'}
      </button>
    </div>
  );
}
