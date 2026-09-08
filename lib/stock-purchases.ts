/**
 * สูตรกลาง: "เงินที่จ่ายซื้อของเข้าคลังในเดือนหนึ่ง" คิดยังไง
 *
 * ⚠️ ทำไมต้องมี (2026-09-08): ระบบนี้มี ledger เงินสองสายที่แยกกันสนิท
 *   • `inv_stock_transactions` = ของเข้าคลัง (จำนวน + ต้นทุน) — หน้า /inventory, /stock-in
 *   • `sc_opex`                = เงินที่จ่ายออก — หน้า /expenses, /dashboard
 * และหน้าการเงิน **ไม่เคยอ่าน ledger คลังเลย** ⇒ ของที่ซื้อแล้วบันทึกแค่ฝั่งคลังจะหายไปจาก
 * ยอดค่าใช้จ่ายเงียบๆ ไม่มี error ให้เห็น (เจอจริง ก.พ.–ก.ค. 69 ขาดรวมกันเกือบ ฿21,000)
 *
 * ธรรมเนียมที่ใช้อยู่: ของที่ซื้อเข้าร้านต้องบันทึก **ทั้งสองที่** — ฝั่งคลังไว้ตัดสต๊อก/คิดต้นทุน
 * ฝั่ง `sc_opex` ไว้เป็นเงินที่จ่ายออกจริง (P&L นับจาก `sc_opex` ที่เดียว ไม่ได้นับซ้ำ)
 * ไฟล์นี้คือสูตรที่ใช้ "เทียบสองฝั่ง" ให้เหมือนกันทั้งในสคริปต์และในหน้าเว็บ
 */

/** แถวจาก `inv_stock_transactions` เท่าที่การคำนวณต้องใช้ */
export type StockTxnLike = {
  id?: string | null;
  transaction_date?: string | null;
  txn_type?: string | null;
  status?: string | null;
  corrects_txn_id?: string | null;
  total_cost?: number | string | null;
};

/**
 * หมวดใน `sc_opex` ที่ใช้บันทึก "ของที่ซื้อเข้าร้าน"
 * ⚠️ ถ้าเพิ่มหมวดใหม่สำหรับของใช้/วัสดุ ต้องมาเติมที่นี่ ไม่งั้นการเทียบสองฝั่งจะเตือนผิด
 */
export const SUPPLY_CATEGORIES: ReadonlySet<string> = new Set([
  "น้ำยา & วัสดุสิ้นเปลือง",
  "ดำเนินงาน & เบ็ดเตล็ด",
]);

/**
 * รวมเงินที่จ่ายซื้อของเข้าคลัง จากแถว ledger ที่ให้มา
 *
 * กติกา:
 *  - นับเฉพาะ `stock_in` ที่ไม่ถูก reject
 *  - **ข้ามแถวที่ถูกแก้ไขทับไปแล้ว** (มีแถวอื่นอ้าง `corrects_txn_id` มาที่มัน) — ledger เป็น
 *    append-only ตามกฎข้อ 2 การแก้ไขจึงสร้างแถวใหม่โดยที่แถวเดิมยังอยู่ ถ้าไม่ข้ามจะนับซ้ำ
 *
 * ⚠️ ข้อจำกัดที่ต้องรู้: การเช็ค "ถูกแก้ไขทับ" ดูจากแถวที่ส่งเข้ามาเท่านั้น ถ้าเรียกแบบราย
 * เดือน (ซึ่งเป็นวิธีที่ใช้จริงทั้งในหน้าเว็บและในสคริปต์) แล้วแถวแก้ไขไปอยู่คนละเดือนกับแถวเดิม
 * จะตรวจไม่เจอ — เป็นสาเหตุของส่วนต่าง `ก.พ. +2,000 / ก.ค. −2,000` ที่ค้างอยู่ตอนนี้:
 * `น้ำยาขจัดคราบสีฟ้า` ซื้อจริงเดือน ก.พ. แต่แถวแก้ไขจำนวนถูกสร้างวันที่ 29 ก.ค.
 * (ยอดรวมทั้งปีถูกต้อง แค่ตกอยู่คนละเดือนในมุมของคลัง — จงใจไม่แก้ ledger ตามกฎข้อ 2)
 */
export function sumStockPurchases(rows: readonly StockTxnLike[]): number {
  const superseded = new Set(
    rows.map((r) => r.corrects_txn_id).filter((id): id is string => typeof id === "string" && id.length > 0)
  );
  let total = 0;
  for (const r of rows) {
    if (r.txn_type !== "stock_in") continue;
    if (r.status === "rejected") continue;
    if (typeof r.id === "string" && superseded.has(r.id)) continue;
    const cost = Math.abs(Number(r.total_cost ?? 0));
    if (Number.isFinite(cost)) total += cost;
  }
  return Math.round(total * 100) / 100;
}

/** แปลงคีย์เดือนแบบ `MM/YYYY` (ที่ `sc_opex` ใช้) เป็นช่วงวันที่สำหรับ query ledger */
export function monthBounds(monthMY: string): { gte: string; lt: string } | null {
  const [mm, yyyy] = String(monthMY).split("/");
  const m = Number(mm);
  const y = Number(yyyy);
  if (!Number.isInteger(m) || !Number.isInteger(y) || m < 1 || m > 12) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return { gte: `${y}-${pad(m)}-01`, lt: `${nextY}-${pad(nextM)}-01` };
}
