/** ตัวเลขเงิน — ทศนิยม 2 ตำแหน่งเป๊ะ (ใช้กับยอดขาย/ยอดจ่ายส่วนใหญ่) */
export const fc = (v: number) => v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ตัวเลขเงิน — อย่างน้อย 2 ตำแหน่ง แต่ไม่ปัดทศนิยมส่วนเกินทิ้ง (ใช้กับยอด opex ที่บางค่ามีทศนิยมมากกว่า 2) */
export const fc2 = (v: number) => v.toLocaleString('th-TH', { minimumFractionDigits: 2 });

/** ตัวเลขเงิน/จำนวน — ปัดเป็นจำนวนเต็ม ไม่มีทศนิยม */
export const fc0 = (v: number) => v.toLocaleString('th-TH', { maximumFractionDigits: 0 });

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const firstOfMonthIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

/** ค่า input[type=month] ของเดือนปัจจุบัน เช่น "2026-07" */
export const currentMonthValue = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
