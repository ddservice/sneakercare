import { useEffect, useState } from 'react';
import { ROOMS_COUNT, type RoomConfig, useRoomsConfig, useSaveRoomsConfig } from '../../lib/queries/rooms';

export default function RoomsConfigSection() {
  const { data, isLoading } = useRoomsConfig();
  const save = useSaveRoomsConfig();
  const [rooms, setRooms] = useState<RoomConfig[]>([]);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => { if (data) setRooms(data); }, [data]);

  const submit = async () => {
    const isExisting = rooms.some((r) => r.tenant || r.rent > 0);
    if (isExisting && !window.confirm('ยืนยันแก้ไขข้อมูลห้องเช่า?\n\nหากเปลี่ยนค่าเช่าหรือชื่อห้อง จะมีผลกับการคำนวณรายรับเดือนนี้ทันที')) return;
    setStatus({ text: 'กำลังบันทึก...', ok: true });
    try {
      await save.mutateAsync(rooms);
      setStatus({ text: 'บันทึกข้อมูลห้องเช่าเรียบร้อยแล้ว ✓', ok: true });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus({ text: 'ข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ'), ok: false });
    }
  };

  if (isLoading) return <div className="card section-gap"><p>กำลังโหลด...</p></div>;

  return (
    <div className="card section-gap">
      <h2>ตั้งค่าห้องเช่า</h2>
      {Array.from({ length: ROOMS_COUNT }).map((_, i) => {
        const r = rooms[i];
        if (!r) return null;
        return (
          <div key={i} className="init-stock-fieldset">
            <legend>ห้องที่ {i + 1}</legend>
            <label>
              ชื่อห้อง
              <input value={r.name} onChange={(e) => setRooms((prev) => prev.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))} />
            </label>
            <label>
              ชื่อผู้เช่า
              <input value={r.tenant} onChange={(e) => setRooms((prev) => prev.map((x, idx) => (idx === i ? { ...x, tenant: e.target.value } : x)))} />
            </label>
            <label>
              ค่าเช่า/เดือน (฿)
              <input type="number" min={0} value={r.rent} onChange={(e) => setRooms((prev) => prev.map((x, idx) => (idx === i ? { ...x, rent: +e.target.value } : x)))} />
            </label>
            <label>
              อัตราค่าไฟ (฿/หน่วย)
              <input type="number" min={0} step={0.01} value={r.elec_rate} onChange={(e) => setRooms((prev) => prev.map((x, idx) => (idx === i ? { ...x, elec_rate: +e.target.value } : x)))} />
            </label>
          </div>
        );
      })}
      {status && <p className={status.ok ? 'poc-note' : 'form-error'}>{status.text}</p>}
      <button type="button" onClick={submit} disabled={save.isPending}>
        {save.isPending ? 'กำลังบันทึก...' : 'บันทึกข้อมูลห้องเช่า'}
      </button>
    </div>
  );
}
