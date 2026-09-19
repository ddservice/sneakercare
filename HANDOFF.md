# HANDOFF

อัปเดต 2026-09-19 — อ่านคู่กับ `CLAUDE.md` และ `docs/IMPLEMENTATION_PLAN.md`

**0044 apply production แล้ว 2026-09-19** ผ่าน SSH+psql — ยืนยันมี `fn_reject_stock_over_issue` / `fn_consume_stock_outflow` · trigger บน `inv_stock_transactions` · `client_request_id` + unique บน `sc_sales` / `sc_payments`

**ระยะ 3–6 แอปบน production แล้ว 2026-09-19** (`b265646`) — **`0045` apply แล้ว** และแอปเขียน `service_order_id` จาก `/pos` · กระดาษทำงาน ภ.พ.30 ช่อง 1–12 ยังไม่ใช่แบบยื่น

**ระยะ 3:** `/pos` ที่ชำระแล้วลง `sc_sales` หนึ่งแถวต่อใบ · คีย์กันซ้ำ = id ใบรับงาน · แอปเขียน `service_order_id` คู่กับคีย์กันซ้ำ (ยอดขายรายวันไม่ใส่)

**ระยะ 4:** ลบ vs ยกเลิก · ใบลดหนี้ชั้นเอกสาร · snapshot ผู้ขาย · ร่างไม่กินเลขทางการ

---

## สถานะปัจจุบัน

- แถบเมนูหัวเว็บใช้ชื่อสั้นชุดเดียว (ภาพรวม / งานบริการ / เอกสาร / คลัง / ค่าใช้จ่าย / ตารางงาน / ภาษี / สถิติ / ตั้งค่า) · ไอคอนโชว์ตั้งแต่ xl · ป้ายสาขา/ผู้ใช้เลิก `leading-tight` ที่ทับบรรทัด
- `/login` มีติ๊ก «จดจำชื่อผู้ใช้ในเครื่องนี้» (localStorage เท่านั้น ไม่เก็บรหัส)
- ระยะ 2 อยู่บน production: migration `0044` + `lib/idempotency.ts` + ฟอร์มขาย/รับชำระส่ง `clientRequestId` · เทสต์สองคำสั่งเบิกพร้อมกัน (`test:stock-concurrency`)
- ระยะ 3 บน production: `lib/checkout.ts` · `createServiceOrder` เรียก `saveDailySale` เมื่อเงินสด/โอน/บัตร · ข้อความบน `/pos` และยอดขายรายวันกันกรอกซ้ำ · **`0045` apply แล้ว** · `/pos` เขียน `service_order_id` (`d5411d5`)
- ระยะ 4 บน production: ลบ/ยกเลิก · ใบลดหนี้/เพิ่มหนี้ · snapshot ผู้ขาย · ร่าง `DRAFT-` แล้วค่อยออกเลข
- ระยะ 5 บน production: กระดาษทำงานภาษี + กระดาษทำงาน ภ.พ.30 ช่อง 1–12 + ภาษีซื้อจากใบหัก ณ ที่จ่ายและใบเสร็จที่กรอกเอง + ปิดงวดบัญชีร้าน — ยังไม่พร้อมยื่น
- ระยะ 6 บน production: สูตรภาพรวมล็อกเงินเข้าจริง · แยกแหล่งใบรับงาน vs ยอดขายรายวัน · ไม่นับ `service_orders` · ดึงย้อน 14 เดือน
- leftover บน production แล้ว (`6486912` / `a7af426`) · **`0046` apply แล้ว 2026-09-20** — `sc_receipt_posts` + `sc_fn_post_receipt` + `sc_fn_guard_live_feature` · คิวใบเสร็จยังมี CAS ใน `sc_settings` · e-Tax เป็นคิว sandbox · CN/DN เป็นร่าง · ตัดสต๊อกอัตโนมัติยังปิด

สำรวจจากโค้ด/schema — **ไม่ได้** ยึดข้อความ “แก้แล้ว” ในประวัติ

---

## ข้อเท็จจริงที่ต้องรู้ก่อนแก้ต่อ

1. `/pos` ที่ชำระแล้วลงบัญชีที่ `sc_sales` — **ห้ามกรอกใบเดียวกันซ้ำที่ยอดขายรายวัน**
2. เบิกคลังยังไม่ตัดอัตโนมัติตอนรับงาน — มีสูตรหน่วยฐานที่ `/settings` แต่ `LIVE_AUTO_ISSUE_ALLOWED=false` · เบิกมือที่ `/stock-out`
3. **กันเบิกเกินทำงานบน production แล้ว** (`0044`) — เบิก/ปรับลดเกินโดนปฏิเสธที่ DB · `test:stock-concurrency` สองคำสั่งบน qty=1 สำเร็จได้หนึ่งรายการ (PGlite คิวคำสั่ง ไม่ใช่สอง session ของ Postgres)
4. VAT เป็นค่าตั้งต่อสาขา · เลขผู้เสียภาษียังที่ tenant
5. ไม่มีลิ้นชัก · ไม่มี GL · มีปิดงวดบัญชีร้านแล้ว (`sc_settings`) · มีใบลดหนี้ชั้นเอกสารแล้วแต่ยังไม่กลับรายการขาย/คลัง
6. `service_role` ข้าม RLS — ทุก action ต้อง `tenantFilter()` / `requireTenantId()`
8. Advisor CRITICAL ที่ `inv_v_item_stock` / `inv_v_low_stock` = staff-safe definer จาก `0021` — ห้ามเปิด `security_invoker` ทับ
9. `0045` apply แล้ว — `/pos` เขียน `service_order_id` คู่ `client_request_id` · ยอดขายรายวันไม่ใส่ · ไม่ backfill แถวเก่า

---

## ทำแล้วในรอบนี้

| ไฟล์ | ทำอะไร |
|---|---|
| `lib/permissions.ts` `components/main-nav.tsx` layout / branch-picker | แถบเมนูมาตรฐาน อ่านไม่ทับ |
| `app/login/login-form.tsx` | Remember ชื่อผู้ใช้ |
| `app/(app)/dashboard/dashboard-client.tsx` | ตัวกรองช่วงเวลาไม่เบียดกัน |
| `0044_reject_overissue_and_idempotency.sql` | ปฏิเสธเบิกเกิน + unique `client_request_id` |
| `scripts/test-stock-concurrency.mjs` | สองคำสั่งเบิก qty=1 พร้อมกัน — สำเร็จได้หนึ่งรายการ ยอดไม่ติดลบ |
| `lib/idempotency.ts` `lib/stock-errors.ts` | ตัวช่วยแอป |
| `daily-sales.ts` + ฟอร์มยอดขายรายวัน | ส่งคีย์กันกดซ้ำ |
| `lib/checkout.ts` `app/actions/pos.ts` | ระยะ 3: รับงานที่ชำระแล้วลง `sc_sales` |
| `0045_sales_service_order_link.sql` | คอลัมน์ลิงก์ใบรับงาน — apply production แล้ว 2026-09-19 |
| `lib/smartacc/lifecycle.ts` `voidSmartAccDocument` | ระยะ 4: ลบ vs ยกเลิก เก็บเลข |
| `lib/smartacc/correction.ts` + ประเภท CN/DN | ระยะ 4: ใบลดหนี้/เพิ่มหนี้ชั้นเอกสาร |
| `lib/smartacc/snapshot.ts` | ระยะ 4: หัวบิลใช้ภาพผู้ขายตอนออก |
| `lib/smartacc/issue.ts` `issueSmartAccDocument` | ระยะ 4: ร่างไม่กินเลขทางการ |
| `lib/pp30-paper.ts` `/tax-filing` | กระดาษทำงาน ภ.พ.30 ช่อง 1–12 ตามแบบกรมสรรพากร — ยังไม่ใช่แบบยื่น |
| `lib/input-vat.ts` | ระยะ 5: ภาษีซื้อจากใบ 50 ทวิ ยังไม่ใช่สมุดซื้อเต็ม |
| `lib/purchase-vat.ts` `/tax-filing` | ระยะ 5: สมุดซื้อจากใบเสร็จที่กรอกเอง ไม่นับ OCR · ยังไม่พร้อมยื่น |
| `lib/period-close.ts` `/tax-filing` | ระยะ 5: ปิดงวดแล้วห้ามแก้บัญชีร้าน · ค่าเริ่มต้นยังไม่ปิด · ปิดแล้วก็ยังไม่พร้อมยื่น |
| `lib/dashboard-books.ts` `/dashboard` | ระยะ 6: สูตรภาพรวมเงินเข้าจริง · แยกแหล่ง POS vs ยอดขายรายวัน · ไม่นับใบรับงานซ้ำ · ดึงย้อน 14 เดือน |
| `lib/etax-pipeline.ts` `/tax-filing` คิว sandbox | leftover: สร้าง XML/คิวได้ · ช่องทาง live ปิด · ห้ามป้ายส่งสำเร็จ |
| `lib/pp30-filing.ts` | leftover: เตรียมข้อมูล ≠ ยื่นแล้ว · ยื่นแล้วต้องมีผู้ยื่น/วัน/หลักฐาน |
| `lib/receipt-staging.ts` + CAS | leftover: ไม่เดายอด/ประเภท · ลงสมุดหลังอนุมัติ · unique ตาราง `0046` apply แล้ว |
| `lib/service-usage.ts` `/settings` | leftover: สูตร version/วันมีผล/อนุมัติ · `LIVE_AUTO_ISSUE_ALLOWED=false` |
| `lib/smartacc/issue.ts` + `correction-effects.ts` | leftover: CN/DN เป็นร่าง · ออกเลขถูกบล็อก · ลดราคา≠รับคืนของ |

---

## งานถัดไป

1. รออนุมัติแล้วค่อยทำ: e-Tax ส่งจริง · ภ.พ.30 ยื่นจากแอป · OCR ในแอป · ตัดสต๊อกอัตโนมัติ · CN กลับ `sc_sales`/คืนสต๊อก
2. ระยะ 5 ที่ยังไม่มีสูตร: แยกยอดขาย 0%/ยกเว้น · ภาษีชำระเกินยกมา
3. Advisor ที่เหลือ: Leaked Password Protection (ตั้งใน Auth dashboard) · `public.vector` (อย่าย้ายมั่ว) · Multiple Permissive Policies ของคลังเป็นแบบแยก role
4. อย่าไล่แทน `parseFloat` ทั้งแอป
5. ห้ามสร้างตาราง legal entity
6. ห้ามรัน `test:staff` / `test:multi-tenant` / `check:money` ถ้าไม่ได้รับอนุญาตแตะ production
7. `0046` apply แล้ว — อย่าเปิด `etax_live` / `auto_issue` / `cn_official` ที่ `sc_fn_guard_live_feature` โดยไม่มติ
8. ถ้าหน้า `/login` ค้างสปินเนอร์: ล้าง `.next` แล้ว build ใหม่ — เคยเจอ `TypeError: e[a] is not a function` ใน webpack-runtime หลัง leftover deploy

---

## มติที่ตอบแล้ว (2026-09-19)

1. สาขา ≠ นิติบุคคลเสมอ
2. ยอดขายทางการ = `sc_sales` + `sc_payments`
3. เบิกเกิน = ปฏิเสธ — apply `0044` บน production แล้ว 2026-09-19
4. ร่างที่ไม่มีคนอ้างลบได้ (ไม่รวมใบกำกับ/ใบเสร็จ) · ที่ออกแล้วใช้ยกเลิก เก็บเลข · void ≠ ใบลดหนี้
5. หน้า login **ควรมี Remember** — จดจำชื่อผู้ใช้ในเครื่องร้าน ไม่จดรหัสผ่าน

---

## กฎเหล็กสำหรับคนทำต่อ

- ห้าม push/deploy/apply production โดยไม่ถาม
- ห้ามแก้ migration ที่ apply แล้ว
- ห้ามลบแถบ "ประมาณการ" ใน legacy และห้ามถอด heartbeat สำรองข้อมูล
- ห้ามใส่ secret ในเอกสาร
- รายงานว่าเสร็จได้เฉพาะสิ่งที่รันเทสต์แล้วในรอบนั้น
