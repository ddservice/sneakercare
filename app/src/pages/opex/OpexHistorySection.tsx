import { useState } from 'react';
import { useOpexHistory } from '../../lib/queries/opexHistory';
import { fc2 } from '../../lib/format';

const sumCat = (items: { category: string; amount: number }[], cat: string) =>
  items.filter((i) => i.category === cat).reduce((s, i) => s + i.amount, 0);

export default function OpexHistorySection() {
  const [monthFilter, setMonthFilter] = useState('');
  const monthKey = monthFilter ? (() => { const [y, mm] = monthFilter.split('-'); return `${mm}/${y}`; })() : null;
  const { data: rows, isLoading } = useOpexHistory(monthKey);

  return (
    <div className="card section-gap">
      <h2>ประวัติการแก้ไขค่าใช้จ่ายย้อนหลัง</h2>
      <p className="poc-note">
        ดูย้อนหลังได้อย่างเดียว — การ "คืนค่า" เวอร์ชันเก่ายังไม่ได้ย้ายมา (เสี่ยงทับข้อมูลปัจจุบันโดยไม่ตั้งใจ)
        ถ้าต้องการคืนค่าจริงๆ ใช้ระบบเดิมไปก่อน
      </p>
      <label>
        กรองเฉพาะเดือน (เว้นว่าง = ทั้งหมด)
        <input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} style={{ maxWidth: 180 }} />
      </label>
      {isLoading ? (
        <p>กำลังโหลด...</p>
      ) : !rows?.length ? (
        <p className="empty-row">ยังไม่มีประวัติการแก้ไข</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((h) => {
            const fixedAmt = sumCat(h.items, 'ค่าดำเนินการ');
            const staffAmt = sumCat(h.items, 'ค่าแรงพนักงาน');
            const taxAmt = sumCat(h.items, 'ภาษี');
            const grand = fixedAmt + staffAmt + taxAmt;
            return (
              <div key={h.id} className="init-stock-fieldset">
                <legend>เดือน {h.month} — v{h.version}</legend>
                <p className="poc-note">{h.saved_by} · {new Date(h.saved_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                {h.change_note && h.change_note !== '(ไม่มีหมายเหตุ)' && <p className="poc-note">หมายเหตุ: {h.change_note}</p>}
                <p>ค่าดำเนินการ {fc2(fixedAmt)} · ค่าแรง {fc2(staffAmt)} · ภาษี+ปกส {fc2(taxAmt)} · <strong>รวม {fc2(grand)} ฿</strong></p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
