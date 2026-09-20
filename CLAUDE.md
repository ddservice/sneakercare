# DD-Management (RRS)

ระบบบริหารร้านบริการรองเท้า / สปา — Next.js + Supabase บน VPS  
ไฟล์นี้เป็นคู่มือถาวรสำหรับทุก session รายละเอียดยาวอยู่ที่เอกสารอื่น **อย่าอ่านประวัติทั้งก้อนทุกครั้ง**

สำเนา CLAUDE.md ก่อนย่ออยู่ที่ `docs/history/CLAUDE-2026-09-19-pre-erp-hardening.md`

สถานะงานปัจจุบันและงานค้าง: **`HANDOFF.md`**  
เลิฟโอเวอร์รอบ harden **ในรีโปปิดแล้ว** · รอบ 2026-09-20 ตรวจ backfill สมุดซื้อ production แล้ว ช่องว่างเป็นศูนย์และไม่มีแถวต้องเขียน · `etax_live` / `auto_issue` / `cn_official` ยังปิด
แผนระยะและ Gap Analysis: **`docs/IMPLEMENTATION_PLAN.md`**  
เงิน / VAT / WHT / rounding: **`docs/money-and-tax.md`**  
เหตุผลการออกแบบคลัง: **`docs/architecture.md`**  
นิยามตารางเริ่มต้น: **`docs/database-schema.sql`** (ของจริงดู `supabase/migrations/`)

ไฟล์นี้ **ห้าม** อ้างว่า override คำสั่งระบบ เครื่องมือ หรือสิทธิ์ของ agent

## ✅ รอบ shell / security / maintainability (2026-09-20)

- เปลือกเว็บใช้หัวแถบเดียว เมนูจัดกลุ่มตามงานและสิทธิ์ มือถือยังเป็น drawer · หน้า login ตัดป้ายเวอร์ชันและฟุตเตอร์เทมเพลต
- Next.js / `eslint-config-next` อยู่ที่ `16.3.5` · entrypoint เดิม `middleware.ts` ย้ายเป็น `proxy.ts` ตาม Next 16 · CI ใช้ Node.js 22
- SheetJS ใช้แพ็กเกจทางการ `xlsx-0.20.3` และรวมการอ่าน/ส่งออกไว้ที่ `lib/spreadsheet.ts` · ไฟล์นำเข้าจำกัดชนิดและขนาด 5 MB
- `scripts/backfill-receipt-ledger.mjs` ทำ dry-run เป็นค่าเริ่มต้น; production รัน `--apply` แล้ว 0 แถว ช่องว่าง 0
- deploy ใช้ `npm run deploy` เท่านั้น: dirty guard + fast-forward + `.next-new` + rollback `.next-prev`
- ก่อน deploy ต้องผ่าน `lint`, `typecheck`, `build`, ชุดทดสอบแกนระบบ และ `npm audit`; เทสต์ที่แตะ production ต้องได้รับอนุญาตชัดเจน

## ✅ ระยะ 2 leftover เทสต์เบิกพร้อมกัน (2026-09-19)

- **`scripts/test-stock-concurrency.mjs`:** ของเหลือ 1 ชิ้น สองคำสั่ง `-1` พร้อมกัน — สำเร็จได้หนึ่งรายการ อีกคำสั่งโดน `สต๊อกไม่พอ` · ยอดสุดท้ายเป็น 0 · ของเหลือ 2 ชิ้น สองคำสั่งผ่านทั้งคู่
- **`0044` มี `FOR UPDATE`** ล็อกแถวสต๊อกก่อนเช็คยอด
- **PGlite คิวคำสั่งในเอนจินเดียว** — ไม่ใช่สอง session ของ Postgres จริง
- เทสต์: `npm run test:stock-concurrency` (รวมใน `test:migration` หลัง 0044)

## ✅ ระยะ 3 สะพานรับงาน → ยอดขาย (2026-09-19)

- **`lib/checkout.ts`:** จ่ายตอนรับ = ยังไม่ลงบัญชี · เงินสด/โอน/บัตร = แผนขายหนึ่งแถว · คีย์กันซ้ำ = `service_orders.id` · บัตรลงช่องโอน
- **`createServiceOrder`:** หลังสร้างใบรับงาน เรียก `saveDailySale()` ตามแผน · กดซ้ำได้แถวขายเดียวเพราะ unique `client_request_id` (0044)
- **หน้าจอ:** `/pos` และยอดขายรายวันบอกไม่ให้กรอกงานที่ชำระแล้วซ้ำ
- **ยังไม่ตัดสต๊อกอัตโนมัติ** — มีสูตรหน่วยฐานที่ `/settings` (version / วันที่มีผล / อนุมัติ) แต่ `LIVE_AUTO_ISSUE_ALLOWED = false` · เบิกที่ `/stock-out`
- **`0045`:** คอลัมน์ `sc_sales.service_order_id` **apply production แล้ว 2026-09-19** · `/pos` ที่ชำระแล้วเขียนทั้ง `client_request_id` และ `service_order_id` · ยอดขายรายวันไม่ใส่คอลัมน์นี้ · ไม่แตะแถวขายเก่า
- แอประยะ 3–6 **deploy production แล้ว 2026-09-19** (`b265646`) — `/pos` ที่ชำระแล้วเขียน `service_order_id`
- เทสต์: `npm run test:checkout` · `scripts/test-migration-0045.mjs` · `npm run test:idempotency` · `npm run test:guards`
- **ไม่แตะสูตร dashboard / Excel** — ยังรวมแค่ `sc_sales` + `sc_payments`

## ✅ ระยะ 4 ลบ vs ยกเลิกเอกสาร (2026-09-19)

- **`lib/smartacc/lifecycle.ts`:** ร่าง QA/DO/INV/BL ที่ไม่มีคนอ้าง = ลบได้ · ใบกำกับ/ใบเสร็จ/แปลงแล้ว/ชำระแล้ว/ถูกอ้าง = ห้ามลบ ใช้ยกเลิก
- **`voidSmartAccDocument`:** ตั้งสถานะ `VOID` เก็บเลขที่ · เหตุผลต่อท้ายหมายเหตุ · **ไม่แตะ `sc_sales`**
- **หน้าเอกสาร:** ปุ่มลบเฉพาะที่ลบได้ · ปุ่มยกเลิก + แถบ «ยกเลิกแล้ว» ตอนพิมพ์ · รายงานภาษีไม่ดึงใบที่ยกเลิก
- เทสต์: `npm run test:docs` · `npm run test:guards`

## ✅ ระยะ 4 ใบลดหนี้ / เพิ่มหนี้ชั้นเอกสาร (2026-09-19)

- **`lib/smartacc/correction.ts`:** ต้นทางได้แค่ INV / TAX / REC ที่ยังไม่ยกเลิก · ลดหนี้หลายใบรวมไม่เกินต้นทาง + ใบเพิ่มหนี้ · ออก CN/DN แล้วต้นทางไม่ถูกตั้ง `CONVERTED`
- **สร้างเอกสาร:** ตรวจเพดานยอดก่อนออกเลข · ประวัติมีปุ่มใบลดหนี้/เพิ่มหนี้
- **ไม่แตะ `sc_sales` และไม่คืนสต๊อก** — แยกลดราคา/ชดเชยค่าบริการ กับรับคืนของ (`lib/correction-effects.ts`) · ยังไม่มี GL จึงห้ามอ้างว่ากลับบัญชีครบ
- เทสต์: `npm run test:docs` · `npm run test:vat`

## ✅ ระยะ 4 snapshot ผู้ขายบนเอกสาร (2026-09-19)

- **`lib/smartacc/snapshot.ts`:** เก็บชื่อ ที่อยู่ เลขผู้เสียภาษี โทร ผู้ลงนาม สาขา ตอนสร้างเอกสาร (ฝังใน `notes` ไม่ต้องมีคอลัมน์ใหม่)
- **พิมพ์:** หัวบิลใช้ภาพตอนออก ถ้าไม่มี (ใบเก่า) ค่อยใช้ร้านปัจจุบัน · โลโก้/ลายเซ็นยังเป็นไฟล์จากตั้งค่า
- เทสต์: `npm run test:docs` (รวม snapshot)

## ✅ ระยะ 4 ร่างไม่กินเลขทางการ (2026-09-19)

- **`lib/smartacc/issue.ts`:** QA/DO/INV/BL สร้างเป็น `DRAFT-วันที่-สุ่ม` · TAX/REC กินเลขตอนสร้าง · **CN/DN เป็นร่าง** จนกว่าจะเชื่อมผลต่อยอดขาย/ลูกหนี้/ภาษี (`CORRECTION_OFFICIAL_ISSUE_ALLOWED = false`)
- **`issueSmartAccDocument`:** เปลี่ยนเลขร่างเป็นเลข RPC ในก้าวเดียว · กดซ้ำได้เลขเดิม
- **ลบได้เฉพาะเลขร่าง** — ใบที่มีเลขทางการแล้วใช้ยกเลิก
- เทสต์: `npm run test:docs` (รวม issue)

## ✅ ระยะ 5 กระดาษทำงานภาษี (2026-09-19)

- **`lib/tax-recon.ts`:** เทียบยอดขาย `sc_sales` กับเอกสารที่ออกแล้ว (ไม่นับ VOID / เลขร่าง / แปลงแล้ว) หักใบลดหนี้ บวกใบเพิ่มหนี้ · ภาษีขายสุทธิหัก VAT ใบลดหนี้ · **`readyToFile` เป็น false เสมอ**
- **`lib/pp30-paper.ts`:** กระดาษทำงาน ภ.พ.30 ช่อง 1–12 ตามแบบกรมสรรพากร · สมุดขาย = ใบกำกับ + ใบเพิ่มหนี้ − ใบลดหนี้ · ช่อง 2–3 และ 10 เป็น 0 · **ยังไม่ใช่แบบยื่น**
- **`/tax-filing`:** การ์ดกระดาษทำงาน + รายการที่ยังบล็อกการยื่น
- เทสต์: `npm run test:tax-recon`
- **ภาษีซื้อ (2026-09-19):** นับจากใบหัก ณ ที่จ่ายฝั่งร้านที่มี VAT + ใบเสร็จที่กรอกเอง/`staging` ที่อนุมัติและยืนยันเครดิต · **ไม่นับ OCR ที่ยังไม่ตรวจ** · ยังไม่ใช่สมุดซื้อเต็ม · `readyToFile` ยังเป็น false
- **ปิดงวด (2026-09-19):** `sc_settings.closed_periods` · ค่าเริ่มต้นไม่ปิดงวดใด · ปิดแล้วห้ามแก้ `sc_sales` / `sc_payments` / `sc_opex` / สมุดซื้อที่กรอกเอง · ปิด/เปิดที่ `/tax-filing` (admin) · **ปิดแล้วก็ยังไม่พร้อมยื่น**
- **ยังไม่มี:** e-Tax ส่งจริง (มีคิว sandbox) · ภ.พ.30 ยื่นจากแอป (มีกระดาษทำงาน + บันทึกหลักฐานการยื่นภายนอก) · OCR ในแอป (รับวางผลภายนอกเข้า staging) · GL/journal

## ✅ ระยะ 6 สูตรภาพรวมล็อกแหล่งรายได้ (2026-09-19)

- **`lib/dashboard-books.ts`:** เกณฑ์เริ่มต้นเงินเข้าจริง · นับแค่ `sc_sales` + `sc_payments` (+ ค่าเช่าห้อง) · **ห้ามนับ `service_orders`**
- แถวขายที่มี `client_request_id` = ใบรับงานที่ชำระแล้ว (อยู่ใน `sc_sales` แล้ว ไม่นับซ้ำ)
- หน้า `/dashboard` ใช้สูตรนี้ตัวเดียว · โชว์แยกแหล่งใบรับงาน vs ยอดขายรายวัน
- ดึงขาย/รายจ่าย/รับชำระย้อน 14 เดือน (นับเดือนปัจจุบัน) ไม่ดึงทั้งตาราง
- **ไม่สลับค่าเริ่มต้นเกณฑ์** · ไม่แตะยอด Excel ที่ล็อกไว้
- เทสต์: `npm run test:dashboard`

## ✅ leftover 2026-09-20 ลงสมุดซื้อ + harden deploy/typecheck (โค้ดในรีโป)

- **ลงสมุดใบเสร็จ:** แหล่งหลัก = `sc_receipt_posts` ผ่าน `sc_fn_post_receipt` · JSON ใน `sc_settings` เป็นคิว/ภาพฉาย · อ่านแล้ว merge จากตาราง · CAS/ภาษีซื้อพังหลัง RPC แล้วยังถือว่าลงสมุด ห้าม rollback ตาราง · กดซ้ำ = replay
- **typecheck:** `npm run typecheck` ใช้ `tsconfig.typecheck.json` ไม่ดึง `.next` (ไฟล์ generate ของ Next ชนกันเองเมื่อ `LayoutSlotMap["/"] = never`)
- **deploy script:** build ที่ `.next-new` ไม่ย้าย `.next` ระหว่าง compile · dirty/untracked หรือ VPS ahead หยุด · start ไม่ผ่านคืน `.next-prev` + commit เดิม
- **เทสต์สอง connection:** `scripts/test-receipt-pg.mjs` (embedded Postgres ถ้าไม่มี `TEST_DATABASE_URL`) แข่งลงใบเดียวกันได้หนึ่งแถว — คนละเรื่องกับ `test:stock-concurrency` ที่ยังเป็น PGlite เอนจินเดียว
- โค้ดอยู่ที่ `origin/master` และ VPS รันเปลือกใหม่นี้ตั้งแต่ `bd18b27` · **ยังไม่ backfill แถว JSON เก่า**
- เทสต์: `npm run test:receipts` · `npm run test:ui-contracts` · `npm run test:e2e-routes` (local/staging เท่านั้น)

## สถาปัตยกรรมที่ใช้งานจริง (ตรวจจากโค้ด 2026-09-20)

| ชั้น | ของจริง |
|---|---|
| แอป | Next.js App Router + TypeScript + Tailwind + shadcn — พอร์ต 3003 หลัง Nginx |
| ฐานข้อมูล | Supabase PostgreSQL โปรเจกต์เดียว `SneakerCareDB` (`mdlxogfkpwejnqpzhmoy`) |
| Hosting | VPS PM2 process `sneakercare` — **ไม่ใช้ Vercel** |
| คลัง | `inv_*` + view alias (`items`, `branches`, `item_stock`, …) ต้นทุนถัวเฉลี่ยเคลื่อนที่ใน trigger |
| การเงินร้าน | `sc_sales` / `sc_payments` / `sc_opex` — **คนละสายกับคลัง** |
| เอกสารขาย | `extension_layer.ext_*` (SmartAcc) — QA/DO/INV/BL เริ่มที่เลข `DRAFT-` · TAX/REC กินเลขตอนสร้าง · CN/DN เป็นร่างจนกว่าจะเชื่อมยอดขาย/ลูกหนี้/ภาษี · สถานะ `DRAFT` / `CONVERTED` / `PAID` / `VOID` |
| หลายกิจการ | `tenants` + `tenant_id` · สาขา = `inv_branches` |
| สิทธิ์ | `profiles.role` เป็นแหล่งเดียว · RLS + `requireModuleView/Write` · service_role ต้องกรอง `tenantFilter()` เอง |
| แจ้งเตือนสต๊อก | Telegram ผ่าน RPC เขียนอย่างเดียว · cron จริงคือ `inv-low-stock-alert` |

มี **สองเส้นทาง POS:**

1. `/pos` → `service_orders` (ใบรับงาน) — ถ้าเลือกเงินสด/โอน/บัตร ระบบลง `sc_sales` หนึ่งแถวต่อใบ (`client_request_id` = id ใบรับงาน) ผ่าน `lib/checkout.ts` + `saveDailySale()`
2. `/pos/daily-entry` → `sc_sales` + `sc_payments` (ยอดรวมรายวัน) — **ห้ามกรอกงานที่รับและชำระที่ `/pos` แล้วซ้ำ** จะนับรายได้สองครั้ง

การเบิกคลัง (`/stock-out`) **ยังไม่ตัดอัตโนมัติตอนรับงาน** — ไม่มีสูตรของใช้ต่องาน

หน้า UI หรือตารางที่มีอยู่ **ยังไม่แปลว่า workflow พร้อมใช้** — ดู Gap ใน `docs/IMPLEMENTATION_PLAN.md`

---

## เมื่อใดต้องอ่านเอกสารอื่น

| งาน | อ่าน |
|---|---|
| เงิน VAT WHT ปัดเศษ | `docs/money-and-tax.md` แล้วใช้ `lib/money.ts` |
| คลัง / ต้นทุน / audit คลัง | `docs/architecture.md` + กฎด้านล่าง |
| งานค้างรอบนี้ | `HANDOFF.md` — leftover โค้ดปิดแล้ว · ที่เหลือคืออนุมัติ deploy + backfill |
| แผนระยะถัดไป | `docs/IMPLEMENTATION_PLAN.md` |
| ประวัติ incident / deploy เก่า | `docs/history/` — อ่านเฉพาะตอนไล่บั๊กเก่า |
| schema เริ่มต้น | `docs/database-schema.sql` แล้วเทียบ migrations |

---

## กฎที่ห้ามละเมิด (บังคับด้วยโค้ด/DB ไม่ใช่แค่ UI)

1. **`inv_audit_logs` / view `audit_logs`** — ห้าม UPDATE/DELETE จากแอป แม้ admin · เขียนด้วย DB trigger เท่านั้น
2. **`sc_audit_logs`** — append-only ผ่าน `lib/audit.ts` · มี trigger กันแก้/ลบ (0011)
3. **`inv_stock_transactions`** — append-only ledger · แก้ผิดด้วยแถวใหม่ที่อ้าง `corrects_txn_id` · ห้ามแก้ `item_stock` ตรงๆ
4. **Adjustment ของ Co-Admin** ต้อง `pending_approval` จนกว่า Admin (หรือ super_admin) จะเรียก `inv_fn_approve_adjustment()`
5. **RBAC หลักอยู่ที่ RLS** · หน้าเว็บเป็นแค่การซ่อนปุ่ม · Server Action ต้องมี `requireModuleView/Write` หรือ `requireAdmin` (ด่าน `npm run test:guards`)
6. **Staff ห้ามได้ต้นทุนจาก API** — ใช้ staff-safe view ไม่ใช่แค่ซ่อนคอลัมน์
7. **ต้นทุน = moving average ใน DB trigger** — ห้ามสลับเป็น FIFO เอง
8. **ตัดสิ้นเปลืองเป็น `base_unit`** (ml/g) ไม่ใช่หน่วยซื้อ
9. **Bot Token** เขียนผ่าน `fn_set_integration_secret()` เท่านั้น ห้าม SELECT ค่าเต็มกลับไป UI
10. **`items` ≠ `item_stock`** — สต๊อกต่อสาขา ห้ามรวมยอดกลับเข้าแคตตาล็อก
11. **`profiles.branch_id`:** admin/super_admin ว่างได้ · co_admin/staff ต้องมีค่า
12. **คุกกี้ `sc_active_branch`:** ว่าง = ดูรวม (อ่านอย่างเดียว) · เบิก-รับ-ปรับต้องเลือกสาขา
13. **เชิญผู้ใช้ที่ `/admin/users` เท่านั้น** · `createAdminClient` ห้าม import จาก Client Component
14. **WHT ไม่ใช่รายจ่าย** — ห้ามลง `sc_opex` ซ้ำกับยอดเต็ม · สูตรที่ `lib/wht.ts` `settleWht()`
15. **เงินใหม่ต้องผ่าน `lib/money.ts`** (สตางค์ + สตริงทศนิยม) — ห้าม `parseFloat` คำนวณยอดในโมดูลใหม่
16. **ห้ามเพิ่ม `as any`** — type ไม่ตรงแปลว่าโค้ดผิด
17. **ทุก VIEW ใน public ที่ไม่มีตรรกะสิทธิ์ในตัว** ต้อง `security_invoker = on` หลัง `CREATE OR REPLACE`
    - **ข้อยกเว้นเจตนา (`0021`):** `inv_v_item_stock` / `inv_v_low_stock` เป็น staff-safe (ไม่มีคอลัมน์ต้นทุน + WHERE กรองสาขา/role) จึงเป็น SECURITY DEFINER — Advisor ขึ้น CRITICAL ตามจริง **ห้ามสลับเป็น invoker** เพราะ RLS ของ `inv_item_stock` กัน staff แล้วหน้าคลังจะเป็น 0
    - Multiple Permissive Policies บน `inv_stock_transactions` (insert แยก admin/co-admin/staff) และ select+ALL บนสาขา/สินค้า/ผู้ขายเป็นแบบแยกสิทธิ์ ไม่ใช่ประตูหลัง
    - `public.vector` และ Leaked Password Protection เป็นค่าแพลตฟอร์ม Auth/extension ไม่แก้ด้วย migration แอป
18. **ห้ามแก้ไฟล์ migration ที่ apply แล้ว** — เพิ่มไฟล์ลำดับถัดไปเท่านั้น
19. **`legacy/sneakercare_dashboard.html`** ยังเป็นหน้าการเงินที่เคยใช้จริง — ห้ามลบแถบเตือน "ประมาณการ"
20. **ฟอนต์:** จอ = Prompt · กระดาษ/`.printable-area` = IBM Plex Sans Thai — ห้ามลบ `ibmPlexSansThai` จาก `app/layout.tsx`
21. **`dev`/`build` คง `--webpack`** (network drive / UNC)
22. **ห้ามใส่ secrets หรือข้อมูลส่วนบุคคลลงเอกสาร / git**
23. **e-Tax:** ห้ามป้าย «ส่งสำเร็จ» จาก XML/PDF หรือ HTTP 200 — ต้องมีหลักฐานรับจากช่องทางที่เลือก · ช่องทาง live ปิดฝั่งเซิร์ฟเวอร์
24. **ภ.พ.30:** «เตรียมข้อมูลแล้ว» ≠ «ยื่นแล้ว» · แอปไม่ยื่นที่เว็บสรรพากร · ยื่นแล้วต้องมีผู้ยื่น วันยื่น และหลักฐาน
25. **สมุดซื้อ:** ใบเสร็จเข้า staging ก่อน · ห้ามเดายอด/ประเภท · ยอดซื้อ ≠ สิทธิใช้ภาษีซื้อ · ลงสมุดหลังอนุมัติและมีคีย์กันซ้ำ
26. **ตัดสต๊อกอัตโนมัติปิด** จนกว่าจะมีสูตรหน่วยฐานที่อนุมัติ จุดตัด และธุรกรรมกันซ้ำ — ห้ามเดาปริมาณจากชื่อบริการ · `LIVE_AUTO_ISSUE_ALLOWED=false` ฝั่งเซิร์ฟเวอร์
27. **ใบลดหนี้:** ลดมูลค่า/VAT แยกจากรับคืนของ · ไม่มี GL แล้วห้ามอ้างว่ากลับบัญชีครบ · ห้ามแก้ ledger เดิมและห้ามกลับซ้ำ · ออกเลขทางการไม่ได้จนกว่าจะเชื่อมยอดขาย/ลูกหนี้/ภาษี
28. **สมุดซื้อหลาย connection** unique ที่ตาราง `sc_receipt_posts` (`0046` apply แล้ว 2026-09-20) · แหล่งหลัก = `sc_fn_post_receipt` · JSON ใน `sc_settings` เป็นคิว/ภาพฉาย (CAS) · `sc_fn_guard_live_feature` บล็อก `etax_live` / `auto_issue` / `cn_official` ที่ DB · แอปเส้นนี้ขึ้น VPS แล้วตั้งแต่ `bd18b27` · **ยังไม่ backfill** แถว JSON เก่า

---

## มติ 2026-09-19 (จากหลักฐานใน repo — ยังไม่ย้ายข้อมูล)

| หัวข้อ | มติ | หลักฐาน | ยังห้ามทำ |
|---|---|---|---|
| สาขา vs นิติบุคคล | **tenant = กิจการในระบบ** (เช่น SneakerCare กับ LUXSU) · **สาขา ≠ นิติบุคคลโดยอัตโนมัติ** · ช่องจด VAT ต่อสาขาเป็นค่าตั้ง ไม่ใช่หลักฐานว่าทุกสาขาคนละนิติบุคคล · ชื่อ/เลขผู้เสียภาษีคงที่ tenant | `tenants` + `inv_branches.vat_registered` + `sc_settings` | ห้ามสร้าง legal_entity หรือย้ายเลขผู้เสียภาษีไปสาขาโดยไม่ได้ออกแบบ schema |
| ยอดขายทางการ | **บัญชี/กำไร/Excel = `sc_sales` + `sc_payments`** (+ รายรับค่าเช่าห้อง) · `/pos` `service_orders` เป็นใบรับงาน · งานที่ชำระแล้วลง `sc_sales` ให้ | dashboard / `test:reconcile` / `lib/checkout.ts` | ห้ามกรอกใบเดียวกันซ้ำที่ยอดขายรายวัน · ห้ามนับ `service_orders` เป็นรายได้บน dashboard |
| เบิกเกินสต๊อก | **ปฏิเสธที่ DB** (`0044` apply แล้ว 2026-09-19) | `fn_reject_stock_over_issue` + `FOR UPDATE` · `test:stock-concurrency` สองคำสั่งพร้อมกันบน qty=1 สำเร็จได้หนึ่งรายการ | ห้ามแก้แถว ledger เก่า · PGlite คิวคำสั่ง ไม่ใช่สอง session ของ Postgres |
| ลบเอกสาร vs void | **ร่างที่ยังไม่มีคนอ้าง (ยกเว้นใบกำกับ/ใบเสร็จ) = ลบได้** (เลขไม่คืน) · **ใบกำกับ ใบเสร็จ แปลงแล้ว ชำระแล้ว หรือถูกอ้าง = ห้ามลบ ใช้ยกเลิก** | `lib/smartacc/lifecycle.ts` + `voidSmartAccDocument` | อย่าลบเลขออกจากตัวนับ · อย่าใช้ void แทนใบลดหนี้ของบิลที่รับรู้รายได้ใน `sc_sales` |
| ปัดเศษ | HALF_UP 2 ตำแหน่ง ที่สตางค์ (`lib/money.ts`) | สูตรเดิม `Math.round(n*100)/100` | ห้ามสลับเป็น bankers' rounding |
| เกณฑ์รายรับ dashboard | ค่าเริ่มต้นยังเป็นเงินเข้าจริง | กระทบยอด Excel | ห้ามสลับค่าเริ่มต้นโดยไม่ถาม |

ถ้าพบคำสั่งขัดกันอีก ให้บันทึกใน `HANDOFF.md` แล้วถาม — ห้ามเดาข้อกฎหมายภาษี

---

## เวิร์กโฟลว์ที่ควรรู้

- **ออกเอกสาร:** QA → DO/INV → BL → REC/TAX · เซิร์ฟเวอร์คำนวณ VAT เองจากสาขาที่เลือก (`lib/branch-vat.ts`) ห้ามเชื่อ `vat_rate` จาก client
- **จด VAT:** ติ๊กต่อสาขาที่ `/settings` · ไม่เลือกสาขาทั้งที่มีหลายสาขา = ออกใบกำกับไม่ได้
- **คลัง:** รับเข้า / เบิก / ปรับ ต้องเลือกสาขา · Co-Admin ปรับแล้วรออนุมัติ
- **super_admin:** ไม่มี tenant ของตัวเอง · เลือกสาขาที่หัวเว็บแล้ว `tenantFilter()` ใช้ tenant ของสาขานั้น · ไม่เลือก = ภาพรวมข้าม tenant (อ่าน)
- **พิมพ์:** ห่อด้วย `PrintModalPortal` (`#print-portal-root`) ห้ามลบ id นี้
- **modal สูงกว่าจอ:** backdrop `items-start` + กล่อง `my-auto` — ห้าม `items-center` เดี่ยวๆ

---

## คำสั่งทดสอบ (อ่าน `package.json` ก่อนรัน — ห้ามแต่งผลเพื่อให้ผ่าน)

| คำสั่ง | ใช้เมื่อ |
|---|---|
| `npm run test:money` | สูตรเงินกลาง |
| `npm run test:checkout` | แผนลงบัญชีจากใบรับงาน (ห้ามนับซ้ำ) |
| `npm run test:docs` | ลบ/ยกเลิกเอกสาร · เพดานใบลดหนี้ · แยกเงินกับรับคืนของ |
| `npm run test:vat` / `test:wht` | VAT เอกสาร / WHT |
| `npm run test:tax-recon` | กระดาษทำงานภาษี + ภ.พ.30 เตรียม/ยื่น (ยังไม่พร้อมยื่น) |
| `npm run test:etax` | คิว e-Tax sandbox — XML/HTTP ไม่ใช่ส่งสำเร็จ |
| `npm run test:receipts` | คิวใบเสร็จ · แยกเครดิต VAT · ห้ามเดาแล้วลงสมุด · สอง connection Postgres จริง (`test-receipt-pg` / embedded-postgres ถ้าไม่มี `TEST_DATABASE_URL`) |
| `npm run test:usage` | สูตรของใช้ต่องาน · ตัดอัตโนมัติยังปิด |
| `npm run test:ui-contracts` | สิทธิ์โมดูล + ปิดเส้นทาง live ฝั่งเซิร์ฟเวอร์ — **ไม่ใช่คลิกเบราว์เซอร์** |
| `npm run test:e2e-routes` | GET หน้าหลักโดยไม่มีคุกกี้ต้องเด้ง login — รันเมื่อตั้ง `E2E_BASE_URL` เป็น local/staging เท่านั้น |
| `npm run test:period-close` | ปิดงวด — งวดเปิดแก้ได้ งวดปิดห้ามแก้ |
| `npm run test:dashboard` | สูตรภาพรวม — เงินเข้าจริง · ไม่นับใบรับงานซ้ำ |
| `npm run test:guards` | Server Action มีการ์ดสิทธิ์ |
| `npm run test:stock-concurrency` | สองคำสั่งเบิก qty=1 พร้อมกัน — สำเร็จได้หนึ่งรายการ ยอดไม่ติดลบ (PGlite คิวคำสั่ง) |
| `npm run test:migration` | SQL รันซ้ำได้บน PGlite (รวม concurrency หลัง 0044) |
| `npm run test:expenses` / `test:reports` / `test:tax` / `test:roster` | สูตรหน้างานนั้น |
| `npm run test:legacy` | แถบประมาณการในระบบเดิม |
| `npm run check:money` | ค่าเงินนอกช่วงในตารางเงิน (แตะ production — อย่ารันถ้าไม่ได้รับอนุญาต) |
| `npm run test:staff` / `test:multi-tenant` | แตะ production จริง — **อย่ารันในรอบ harden โดยไม่ได้รับอนุญาต** |
| `npm run typecheck` / `lint` / `build` | ตรวจโค้ด (`typecheck` ใช้ `tsconfig.typecheck.json` ไม่ดึง `.next`) |

เพิ่มเทสต์คู่กับโค้ดที่แก้ **อย่า** เปลี่ยน assertion เพื่อให้ผ่าน

---

## สิ่งที่ยังไม่มีในโค้ด (อย่าเขียนในเอกสารว่ามีแล้ว)

`0044` อยู่บน production แล้ว (2026-09-19): ปฏิเสธเบิกเกินที่ DB · unique `client_request_id` ของขาย/รับชำระ · `test:stock-concurrency` ผ่านบน PGlite (ยังไม่ใช่สอง session ของ Postgres จริง)  

**ระยะ 3 (2026-09-19 แอปบน production · `0045` apply แล้ว):** `/pos` ที่ชำระแล้วลง `sc_sales` หนึ่งแถวต่อใบ · คีย์กันซ้ำ = `service_orders.id` · `service_order_id` สำหรับรายงาน (ยอดขายรายวันไม่ใส่) · คลังยังเบิกมือที่ `/stock-out`

**`0046` apply production แล้ว 2026-09-20** ผ่าน SSH+psql — มี `sc_receipt_posts` (unique ใบ/คีย์กันซ้ำ) · `sc_fn_post_receipt` · `sc_fn_guard_live_feature` · RLS เปิด · แอปบน VPS ตั้งแต่ `bd18b27` ลงสมุดผ่าน RPC เป็นแหล่งหลัก JSON ใน `sc_settings` เป็นคิว/ภาพฉาย — **ยังไม่ backfill แถว JSON เก่า**

ยังไม่มีทั้งระบบ: ลิ้นชักเงินสด · ตัดสต๊อกอัตโนมัติตอนรับงาน (มีหน้าสูตรแล้วเส้นตัดจริงยังปิด) · ใบลดหนี้ที่กลับรายการ `sc_sales` หรือคืนสต๊อก · VAT effective date · GL/journal · e-Tax ส่งจริง (มีคิว sandbox) · ภ.พ.30 ยื่นจากแอป (บันทึกการยื่นภายนอกได้) · OCR ในแอป / สมุดซื้ออัตโนมัติจากทุกใบโดยไม่ตรวจ

รายละเอียดและเกณฑ์รับงานอยู่ใน `docs/IMPLEMENTATION_PLAN.md`

---

## การทำงานของ agent ในรอบ harden นี้

รอบ 2026-09-20 leftover **โค้ดในรีโปปิดแล้ว** และ **deploy แอปแล้ว** ตั้งแต่ `bd18b27` · `0046` apply แล้ว · **ยังไม่ backfill** JSON เก่า  
ยังไม่อนุญาตถ้าไม่ได้สั่งรอบนั้น: เขียน/ลบข้อมูลร้านจริง · สร้างบิลหรือเก็บเงินจริง · ส่งเอกสารให้ลูกค้า · rotate credentials · เปลี่ยนนโยบายภาษี/ต้นทุนหรือย้ายข้อมูลย้อนหลัง · เปิด e-Tax live / ตัดสต๊อกอัตโนมัติ / ออกเลข CN ทางการ
