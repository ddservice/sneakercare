import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useRoomsConfig } from '../../lib/queries/rooms';
import { loadRoomReadings, useRentalIncomeMonth, useSaveRentalIncome, type RoomMonthReading } from '../../lib/queries/rentalIncome';

const fc = (v: number) => v.toLocaleString('th-TH', { minimumFractionDigits: 2 });
const currentMonthValue = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const toMonthKey = (val: string) => {
  const [y, mm] = val.split('-');
  return `${mm}/${y}`;
};

export default function RentalIncomeSection() {
  const { auth } = useAuth();
  const [monthVal, setMonthVal] = useState(currentMonthValue());
  const monthKey = toMonthKey(monthVal);

  const { data: rooms, isLoading: roomsLoading } = useRoomsConfig();
  const { data: opexRows, isLoading: opexLoading } = useRentalIncomeMonth(monthKey);
  const save = useSaveRentalIncome();

  const [readings, setReadings] = useState<RoomMonthReading[]>([]);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (rooms) setReadings(loadRoomReadings(opexRows, rooms));
  }, [rooms, opexRows]);

  const hasCfg = (rooms ?? []).some((r) => r.tenant || r.rent > 0);

  const submit = async () => {
    if (!rooms) return;
    setStatus({ text: 'กำลังบันทึก...', ok: true });
    try {
      await save.mutateAsync({ monthKey, rooms, readings, recordedBy: auth?.displayName || auth?.username || 'Staff' });
      setStatus({ text: 'บันทึกรายรับห้องเช่าเรียบร้อย ✓', ok: true });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ text: 'ข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ'), ok: false });
    }
  };

  if (roomsLoading || opexLoading) return <div className="card section-gap"><p>กำลังโหลด...</p></div>;

  if (!hasCfg) {
    return (
      <div className="card section-gap">
        <h2>รายรับห้องเช่า</h2>
        <p className="poc-note">ยังไม่ได้ตั้งค่าห้องเช่า — ไปที่แท็บตั้งค่า &gt; ตั้งค่าห้องเช่าก่อน</p>
      </div>
    );
  }

  return (
    <div className="card section-gap">
      <h2>รายรับห้องเช่า</h2>
      <label>
        เดือน
        <input type="month" value={monthVal} onChange={(e) => setMonthVal(e.target.value)} style={{ maxWidth: 180 }} />
      </label>
      {rooms!.map((room, i) => {
        const reading = readings[i] ?? { prev: 0, curr: 0, rent: room.rent };
        const units = Math.max(reading.curr - reading.prev, 0);
        const elecCost = units * room.elec_rate;
        const total = reading.rent + elecCost;
        return (
          <div key={i} className="init-stock-fieldset">
            <legend>{room.name} {room.tenant && `(ผู้เช่า: ${room.tenant})`} — รวม {fc(total)} ฿</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
              <label>
                ค่าเช่า/เดือน (฿)
                <input type="number" min={0} value={reading.rent}
                  onChange={(e) => setReadings((prev) => prev.map((r, idx) => (idx === i ? { ...r, rent: +e.target.value } : r)))} />
              </label>
              <label>
                มิเตอร์ก่อนหน้า
                <input type="number" min={0} value={reading.prev}
                  onChange={(e) => setReadings((prev) => prev.map((r, idx) => (idx === i ? { ...r, prev: +e.target.value } : r)))} />
              </label>
              <label>
                มิเตอร์ล่าสุด
                <input type="number" min={0} value={reading.curr}
                  onChange={(e) => setReadings((prev) => prev.map((r, idx) => (idx === i ? { ...r, curr: +e.target.value } : r)))} />
              </label>
            </div>
            <p className="poc-note">หน่วยที่ใช้: {units} × {room.elec_rate} ฿/หน่วย = ค่าไฟ {fc(elecCost)} ฿</p>
          </div>
        );
      })}
      {status && <p className={status.ok ? 'poc-note' : 'form-error'}>{status.text}</p>}
      <button type="button" onClick={submit} disabled={save.isPending}>
        {save.isPending ? 'กำลังบันทึก...' : 'บันทึกรายรับห้องเช่า'}
      </button>
    </div>
  );
}
