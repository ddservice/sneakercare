# HANDOFF

อัปเดต 2026-09-19 — ให้อ่านไฟล์นี้แล้วทำต่อได้โดยไม่ต้องไล่ประวัติแชท

อ่านคู่กับ `CLAUDE.md` (กฎ) และ `docs/IMPLEMENTATION_PLAN.md` (แผน+ช่องว่าง)  
ประวัติยาวอยู่ที่ `docs/history/`

**รอบนี้ยังไม่ push / ไม่ deploy / ไม่ apply production**

---

## สถานะปัจจุบัน

- branch `master` สะอาดตอนเริ่มสำรวจ (commit ล่าสุดก่อนงานนี้ `afbc468`)
- CLAUDE.md ถูกย่อแล้ว สำเนาเดิม: `docs/history/CLAUDE-2026-09-19-pre-erp-hardening.md`
- HANDOFF เดิม: `docs/history/HANDOFF-2026-09-19-pre-erp-hardening.md`
- ระยะ 1 เริ่มแล้ว: `lib/money.ts` + `scripts/test-money.mjs` + ห่อ `money()` / `settleDocumentVat`
- เทสต์ที่รันจริงรอบนี้ **ผ่าน:** `test:money` · `test:vat` · `test:wht` · `test:guards`

สำรวจจากโค้ด/schema — **ไม่ได้** ยึดข้อความ “แก้แล้ว” ในประวัติ

---

## ข้อเท็จจริงที่ต้องรู้ก่อนแก้ต่อ

1. POS มีสองเส้นทางที่ไม่เชื่อมกัน: `/pos` (`service_orders`) กับ `/pos/daily-entry` (`sc_sales`) — หน้ากำไรอ่านสายหลัง
2. เบิกคลังไม่ผูกบิลขาย · trigger สต๊อกใช้ `greatest(0, …)` ไม่ได้ปฏิเสธของไม่พอ
3. เอกสารขายออกเลขตอนสร้างแล้วเป็น `DRAFT` และลบได้ — ยังไม่มี VOID
4. VAT เป็นค่าตั้งต่อสาขา แต่สาขาไม่เท่ากับนิติบุคคลโดยอัตโนมัติ — ชื่อ/เลขผู้เสียภาษียังเป็นระดับ tenant (มติ 2026-09-19 ใน CLAUDE.md)
5. ไม่มีลิ้นชัก · ไม่มีใบลดหนี้ · ไม่มี GL · ไม่มีปิดงวด · e-Tax เป็นตัวอย่าง
6. `service_role` ข้าม RLS — ทุก action ต้อง `tenantFilter()` / `requireTenantId()`

---

## ทำแล้วในระยะ 1

| ไฟล์ | ทำอะไร |
|---|---|
| `CLAUDE.md` | คู่มือถาวรสั้น กฎ + จุดอ่านเอกสารอื่น + ข้อขัดกัน |
| `docs/history/CLAUDE-2026-09-19-pre-erp-hardening.md` | สำเนาเต็มก่อนย่อ |
| `docs/IMPLEMENTATION_PLAN.md` | Gap + ระยะ + ของที่ต้องอนุมัติ |
| `docs/money-and-tax.md` | นโยบายเงิน/ภาษีที่พบ |
| `lib/money.ts` | สตางค์ + สตริงทศนิยม HALF_UP |
| `lib/vat.ts` `lib/wht.ts` | ใช้ `lib/money.ts` ข้างใน ยังคืน number ให้ caller เดิม |
| `scripts/test-money.mjs` | ล็อก 1000×7% และ 18000×5% |
| `package.json` | `test:money` · `test:vat`/`test:wht` compile `money.ts` ด้วย |

---

## งานถัดไป (ระยะ 1 ให้จบ / ระยะ 2)

1. รัน `test:money` `test:vat` `test:wht` `test:guards` ถ้ารอบนี้ยังไม่ครบ
2. **อย่า** ไล่แทน `parseFloat` ทั้งแอปในครั้งเดียว
3. ระยะ 2: idempotency การขาย + ปฏิเสธเบิกเกินสต๊อกที่ DB (มติแล้ว — ยังไม่ลงมือ ห้าม apply production)
4. ห้ามสร้างตาราง legal entity หรือย้ายเลขผู้เสียภาษีไปสาขาในรอบนี้
5. ห้ามรัน `test:staff` / `test:multi-tenant` / `check:money` ถ้าไม่ได้รับอนุญาตแตะ production

---

## มติที่ตอบแล้ว (2026-09-19)

1. **สาขา ≠ นิติบุคคลเสมอ** — tenant แยกกิจการในระบบ · ช่องจด VAT ต่อสาขาเป็นค่าตั้ง · เลขผู้เสียภาษียังที่ tenant
2. **ยอดขายทางการ = `sc_sales` + `sc_payments`** — ใบรับงานเป็นปฏิบัติการ
3. **เบิกเกิน = ปฏิเสธ** (ยังไม่แก้ trigger ใน commit นี้)
4. **DRAFT ที่ไม่มีคนอ้าง ลบได้ · บิลที่แปลง/อ้าง/ออกใบกำกับแล้วใช้ void ทีหลัง** — ยังไม่สร้าง workflow void ใน commit นี้

---

## กฎเหล็กสำหรับคนทำต่อ

- ห้าม push/deploy/apply production โดยไม่ถาม
- ห้ามแก้ migration ที่ apply แล้ว
- ห้ามลบแถบ "ประมาณการ" ใน legacy และห้ามถอด heartbeat สำรองข้อมูล
- ห้ามใส่ secret ในเอกสาร
- รายงานว่าเสร็จได้เฉพาะสิ่งที่รันเทสต์แล้วในรอบนั้น
