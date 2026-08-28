// ตัวช่วยแบ่งหน้าสำหรับตารางที่ข้อมูลโตขึ้นเรื่อยๆ (ประวัติ, audit log, รายงาน)
//
// ทำไมต้องมี: ก่อนหน้านี้หน้าพวกนี้ใช้ .limit(100) ตายตัวโดยไม่บอกผู้ใช้ พอข้อมูลเกิน 100 แถว
// หน้าเว็บจะตัดของเก่าทิ้งเงียบๆ ผู้ใช้เห็นตารางเต็มจอเลยไม่มีทางรู้ว่ากำลังดูไม่ครบ —
// อันตรายที่สุดคือ Audit Log ที่ทั้งระบบออกแบบมาเพื่อ "ตรวจสอบย้อนหลังได้" แต่ย้อนได้แค่ 100 แถว

export const DEFAULT_PAGE_SIZE = 50;

/** อ่านเลขหน้าจาก searchParams อย่างปลอดภัย — ค่าที่พิมพ์มั่ว/ติดลบ/ไม่ใช่ตัวเลข ให้ตกกลับเป็นหน้า 1 */
export function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/** แปลงเลขหน้าเป็นช่วง index สำหรับ .range() ของ PostgREST (inclusive ทั้งสองฝั่ง) */
export function rangeFor(page: number, pageSize: number = DEFAULT_PAGE_SIZE) {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export type PageInfo = {
  page: number;
  pageSize: number;
  /** จำนวนแถวทั้งหมดจาก count: "exact" — null เมื่อ PostgREST ไม่ได้คืน count มา */
  total: number | null;
  /** จำนวนแถวที่แสดงอยู่จริงในหน้านี้ */
  shown: number;
};

export function pageInfo(
  page: number,
  pageSize: number,
  total: number | null,
  shown: number
): PageInfo {
  return { page, pageSize, total, shown };
}

export function totalPages(info: PageInfo): number | null {
  if (info.total === null) return null;
  return Math.max(1, Math.ceil(info.total / info.pageSize));
}

export function hasPrev(info: PageInfo): boolean {
  return info.page > 1;
}

/**
 * มีหน้าถัดไปไหม — ถ้ารู้ total ใช้ total ตัดสิน ถ้าไม่รู้ (count มาไม่ครบ) ให้เดาจากว่า
 * หน้านี้เต็มพอดีหรือเปล่า ซึ่งอาจพาไปเจอหน้าว่างได้ 1 ครั้ง แต่ดีกว่าซ่อนข้อมูลที่ยังมีอยู่
 */
export function hasNext(info: PageInfo): boolean {
  if (info.total !== null) return info.page * info.pageSize < info.total;
  return info.shown === info.pageSize;
}

/** ข้อความบอกช่วงที่กำลังดู เช่น "แสดง 51–100 จาก 342 รายการ" */
export function rangeLabel(info: PageInfo): string {
  if (info.shown === 0) return "ไม่มีรายการ";
  const first = (info.page - 1) * info.pageSize + 1;
  const last = first + info.shown - 1;
  const of = info.total !== null ? ` จาก ${info.total.toLocaleString("th-TH")} รายการ` : "";
  return `แสดง ${first.toLocaleString("th-TH")}–${last.toLocaleString("th-TH")}${of}`;
}
