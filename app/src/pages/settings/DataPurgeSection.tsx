import { useState } from 'react';
import { supabase } from '../../lib/supabase';

type Category = 'all' | 'sales' | 'opex';

const CAT_LABEL: Record<Category, string> = {
  all: 'ยอดขาย + ค่าใช้จ่ายรายเดือน ทั้งหมด',
  sales: 'ยอดขายรองเท้าเท่านั้น (sc_sales)',
  opex: 'ค่าใช้จ่ายรายเดือนเท่านั้น (sc_opex)',
};

export default function DataPurgeSection() {
  const [monthInput, setMonthInput] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!monthInput) { setStatus({ text: 'กรุณาระบุเดือนที่ต้องการลบ', ok: false }); return; }
    if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(monthInput)) {
      setStatus({ text: 'รูปแบบเดือนไม่ถูกต้อง กรุณาใช้รูปแบบ MM/YYYY เช่น 06/2026', ok: false });
      return;
    }
    const ok = window.confirm(
      `คำเตือน: คุณต้องการลบข้อมูลเดือน ${monthInput} ประเภท: "${CAT_LABEL[category]}" หรือไม่?\nข้อมูลจะถูกลบอย่างถาวรและไม่สามารถกู้คืนได้!`,
    );
    if (!ok) return;

    setBusy(true);
    setStatus({ text: 'กำลังลบข้อมูล...', ok: true });
    try {
      const [mm, yyyy] = monthInput.split('/');
      const firstDay = `${yyyy}-${mm.padStart(2, '0')}-01`;
      const lastDay = new Date(Number(yyyy), Number(mm), 0).toISOString().split('T')[0];

      if (category === 'all' || category === 'sales') {
        const { error } = await supabase.from('sc_sales').delete().gte('date', firstDay).lte('date', lastDay);
        if (error) throw error;
      }
      if (category === 'all' || category === 'opex') {
        const { error } = await supabase.from('sc_opex').delete().eq('month', monthInput);
        if (error) throw error;
      }
      setStatus({ text: 'ลบข้อมูลสำเร็จเรียบร้อย ✓', ok: true });
      setMonthInput('');
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ text: 'ข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'ลบข้อมูลไม่สำเร็จ'), ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card section-gap">
      <h2>ทำความสะอาดข้อมูล (Data Purge)</h2>
      <p className="poc-note">
        ลบข้อมูลถาวร ย้อนกลับไม่ได้ — ใช้เฉพาะกรณีข้อมูลผิดพลาดทั้งเดือนจริงๆ เท่านั้น
      </p>
      <p className="poc-note">
        <strong>หมายเหตุ:</strong> เครื่องมือนี้ไม่ลบข้อมูลคลังสินค้า (inv_stock_transactions) เพราะเป็น
        append-only ledger ตามกฎธุรกิจ ห้ามลบแถวเดิมเด็ดขาด — ถ้าข้อมูลสต๊อกผิด ให้ใช้ปุ่ม "แก้ไข"/"ลบ"
        ที่ตาราง "ประวัติการซื้อเข้า" ในแท็บคลังสินค้าแทน (จะสร้างรายการแก้ไขแบบมีเหตุผลอ้างอิงได้)
      </p>
      <label>
        เดือนที่ต้องการลบ (MM/YYYY)
        <input value={monthInput} onChange={(e) => setMonthInput(e.target.value)} placeholder="เช่น 06/2026" />
      </label>
      <label>
        ประเภทข้อมูล
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {(Object.keys(CAT_LABEL) as Category[]).map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
        </select>
      </label>
      {status && <p className={status.ok ? 'poc-note' : 'form-error'}>{status.text}</p>}
      <button type="button" onClick={submit} disabled={busy}>
        {busy ? 'กำลังลบ...' : 'ลบข้อมูล'}
      </button>
    </div>
  );
}
