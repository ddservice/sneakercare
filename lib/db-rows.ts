/**
 * ตัวช่วยจัดการแถวที่อ่านมาจาก VIEW ของ Supabase
 *
 * ⚠️ ทำไมต้องมี: ตารางฝั่งคลังสินค้าถูกเข้าถึงผ่าน view alias (`items` → `inv_items`,
 * `item_stock` → `inv_item_stock`, `branches` → `inv_branches`, ...) และ PostgREST/Postgres
 * ถือว่า **ทุกคอลัมน์ของ view เป็น nullable เสมอ** แม้ตารางต้นทางจะเป็น NOT NULL ก็ตาม
 * เพราะ view อาจมี outer join หรือ expression ที่คืน null ได้ในทางทฤษฎี
 *
 * ผลคือพอ generate types จากฐานข้อมูลจริง (2026-09-06) โค้ดที่เคยเขียนว่า `id: string`
 * จะไม่ผ่าน type check ทันทีทั้งโปรเจกต์
 *
 * ทางแก้ที่ **ห้ามทำ** คือโปรย `as any` หรือ `as string` กลับเข้าไป เพราะจะกลับไปปิดตา
 * TypeScript แบบเดิม (ต้นเหตุของบั๊กที่พังเงียบหลายตัวที่เพิ่งเจอในวันเดียวกัน)
 * ทางแก้ที่ถูกคือ "จัดการ null จริงๆ" ซึ่งไฟล์นี้ทำให้เขียนสั้นและสม่ำเสมอทุกที่
 */

/**
 * กรองแถวที่ไม่มี id ทิ้ง แล้วคืนชนิดที่ id เป็น string แน่นอน
 *
 * ใช้กับ dropdown/ตารางที่ต้องใช้ id เป็น key — แถวที่ไม่มี id ใช้งานต่อไม่ได้อยู่แล้ว
 * (กดเลือกก็ส่งค่าว่างไป) การตัดทิ้งจึงตรงกับความเป็นจริงมากกว่าการ cast ให้ผ่านไปเฉยๆ
 */
export function withId<T extends { id: string | null }>(
  rows: readonly T[] | null | undefined
): (Omit<T, "id"> & { id: string })[] {
  return (rows ?? []).filter((r): r is T & { id: string } => typeof r.id === "string" && r.id.length > 0);
}

/** แปลงค่าที่อาจเป็น null ให้เป็นข้อความเสมอ (ค่าเริ่มต้นเป็นสตริงว่าง) */
export function text(value: string | null | undefined, fallback = ""): string {
  return value ?? fallback;
}

/** แปลงค่าที่อาจเป็น null ให้เป็นตัวเลขเสมอ */
export function num(value: number | string | null | undefined, fallback = 0): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

/** แปลงค่าที่อาจเป็น null ให้เป็น boolean เสมอ */
export function bool(value: boolean | null | undefined, fallback = false): boolean {
  return value ?? fallback;
}
