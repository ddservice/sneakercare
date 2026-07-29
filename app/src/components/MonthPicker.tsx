const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

/** เลือกเดือน/ปีแยกกัน (ค่า value/onChange เป็น "YYYY-MM" แบบเดียวกับ input type=month) แทนปฏิทิน
 *  พื้นเบราว์เซอร์ เพราะ picker บางเบราว์เซอร์/มือถือย้อนปีก่อนหน้าได้ยาก — ให้เลือกปีย้อนหลังได้ตรงๆ แทน */
export default function MonthPicker({
  value,
  onChange,
  yearsBack = 6,
}: {
  value: string; // "YYYY-MM"
  onChange: (next: string) => void;
  yearsBack?: number;
}) {
  const [yStr, mStr] = value.split('-');
  const y = Number(yStr) || new Date().getFullYear();
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: yearsBack + 1 }, (_, i) => thisYear - i);

  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <select value={mStr} onChange={(e) => onChange(`${yStr}-${e.target.value}`)}>
        {THAI_MONTHS.map((name, i) => {
          const mm = String(i + 1).padStart(2, '0');
          return <option key={mm} value={mm}>{name}</option>;
        })}
      </select>
      <select value={y} onChange={(e) => onChange(`${e.target.value}-${mStr}`)}>
        {years.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
      </select>
    </span>
  );
}
