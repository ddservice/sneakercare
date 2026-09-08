/**
 * ตัวช่วยอ่านข้อความจาก error ที่ `catch` มาได้อย่างปลอดภัย
 *
 * ⚠️ ทำไมต้องมี: TypeScript ให้ค่าที่ catch มาเป็น `unknown` (ถูกแล้ว — โยนอะไรก็ได้)
 * โค้ดเดิมทั่วโปรเจกต์จึงเขียน `catch (err: any)` แล้วอ่าน `err.message` ตรงๆ ซึ่ง
 * (1) ปิดตา TypeScript และ (2) พังเงียบเป็น "undefined" ทันทีที่สิ่งที่ถูกโยนไม่ใช่ Error
 * เช่น string จาก library หรือ object ของ PostgREST
 *
 * ใช้แทนได้ทุกที่: `catch (err) { toast.error(errorMessage(err, "บันทึกไม่สำเร็จ")) }`
 */
export function errorMessage(err: unknown, fallback = "เกิดข้อผิดพลาดที่ไม่รู้จัก"): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  // PostgREST/Supabase คืน object ธรรมดาที่มี message โดยไม่ได้เป็น Error instance
  const message = (err as { message?: unknown } | null)?.message;
  if (typeof message === "string" && message) return message;
  return fallback;
}
