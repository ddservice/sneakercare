/** แปลง error จาก trigger กันเบิกเกินเป็นข้อความที่ฟอร์มคลังใช้ได้ */

export function stockWriteError(message: string): string {
  const text = String(message ?? "").trim();
  if (/สต๊อกไม่พอ|เบิกหรือปรับลดเกิน/.test(text)) {
    return text;
  }
  return text ? `บันทึกไม่สำเร็จ: ${text}` : "บันทึกไม่สำเร็จ";
}
