# HANDOFF

อัปเดต 2026-09-19 — อ่านคู่กับ `CLAUDE.md` และ `docs/IMPLEMENTATION_PLAN.md`

**รอบนี้ยังไม่ push / ไม่ deploy / ไม่ apply 0044 บน production**

---

## สถานะปัจจุบัน

- แถบเมนูหัวเว็บใช้ชื่อสั้นชุดเดียว (ภาพรวม / งานบริการ / เอกสาร / คลัง / ค่าใช้จ่าย / ตารางงาน / ภาษี / สถิติ / ตั้งค่า) · ไอคอนโชว์ตั้งแต่ xl · ป้ายสาขา/ผู้ใช้เลิก `leading-tight` ที่ทับบรรทัด
- `/login` มีติ๊ก «จดจำชื่อผู้ใช้ในเครื่องนี้» (localStorage เท่านั้น ไม่เก็บรหัส)
- ระยะ 2 เขียนใน repo แล้ว: migration `0044` + `lib/idempotency.ts` + ฟอร์มขาย/รับชำระส่ง `clientRequestId`

สำรวจจากโค้ด/schema — **ไม่ได้** ยึดข้อความ “แก้แล้ว” ในประวัติ

---

## ข้อเท็จจริงที่ต้องรู้ก่อนแก้ต่อ

1. POS ยังมีสองเส้นทางที่ไม่เชื่อมกัน: `/pos` (`service_orders`) กับ `/pos/daily-entry` (`sc_sales`)
2. เบิกคลังยังไม่ผูกบิลขาย
3. **กันเบิกเกินยังไม่ทำงานบน production** จนกว่าจะ apply `0044`
4. VAT เป็นค่าตั้งต่อสาขา · เลขผู้เสียภาษียังที่ tenant
5. ไม่มีลิ้นชัก · ไม่มีใบลดหนี้ · ไม่มี GL · ไม่มีปิดงวด
6. `service_role` ข้าม RLS — ทุก action ต้อง `tenantFilter()` / `requireTenantId()`

---

## ทำแล้วในรอบนี้

| ไฟล์ | ทำอะไร |
|---|---|
| `lib/permissions.ts` `components/main-nav.tsx` layout / branch-picker | แถบเมนูมาตรฐาน อ่านไม่ทับ |
| `app/login/login-form.tsx` | Remember ชื่อผู้ใช้ |
| `app/(app)/dashboard/dashboard-client.tsx` | ตัวกรองช่วงเวลาไม่เบียดกัน |
| `0044_reject_overissue_and_idempotency.sql` | ปฏิเสธเบิกเกิน + unique `client_request_id` |
| `lib/idempotency.ts` `lib/stock-errors.ts` | ตัวช่วยแอป |
| `daily-sales.ts` + ฟอร์มยอดขายรายวัน | ส่งคีย์กันกดซ้ำ |

---

## งานถัดไป

1. ถ้าจะให้กันเบิกเกินบนร้านจริง ต้อง **ถามแล้วค่อย apply 0044 + deploy**
2. อย่าไล่แทน `parseFloat` ทั้งแอป
3. ระยะ 3: เชื่อม POS–คลัง–รับชำระ — ยังไม่เริ่ม
4. ห้ามสร้างตาราง legal entity
5. ห้ามรัน `test:staff` / `test:multi-tenant` / `check:money` ถ้าไม่ได้รับอนุญาตแตะ production

---

## มติที่ตอบแล้ว (2026-09-19)

1. สาขา ≠ นิติบุคคลเสมอ
2. ยอดขายทางการ = `sc_sales` + `sc_payments`
3. เบิกเกิน = ปฏิเสธ (เขียนแล้วใน 0044 — ยังไม่ apply production)
4. DRAFT ที่ไม่มีคนอ้าง ลบได้ · บิลที่ออกแล้วใช้ void ทีหลัง
5. หน้า login **ควรมี Remember** — จดจำชื่อผู้ใช้ในเครื่องร้าน ไม่จดรหัสผ่าน

---

## กฎเหล็กสำหรับคนทำต่อ

- ห้าม push/deploy/apply production โดยไม่ถาม
- ห้ามแก้ migration ที่ apply แล้ว
- ห้ามลบแถบ "ประมาณการ" ใน legacy และห้ามถอด heartbeat สำรองข้อมูล
- ห้ามใส่ secret ในเอกสาร
- รายงานว่าเสร็จได้เฉพาะสิ่งที่รันเทสต์แล้วในรอบนั้น
