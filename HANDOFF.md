# HANDOFF

อัปเดต 2026-09-20 (deploy VPS ตรง origin) — อ่านคู่กับ `CLAUDE.md`

## สถานะรอบนี้ — แอปบน VPS = `d65cc9e` · ยังไม่ backfill

`origin/master` ตอนปล่อยแอป = `d65cc9e` · VPS HEAD ตรง origin · ไฟล์ tracked สะอาดหลังคืน `tsconfig.json` / `package-lock.json` ที่ Next/`npm install` เขียนทับ · `.next-prev/` เป็นชุดกู้คืน อยู่ใน `.gitignore` แล้ว

ตรวจหลัง deploy: `/login` local 200 · production `https://sneakercare.ddserviceth.com/login` ฟอร์มครบ · `/pos` `/dashboard` ไม่มีคุกกี้แล้ว 307 ไป login · PM2 `sneakercare` online · `LIVE_ETAX_SEND_ALLOWED` / `LIVE_AUTO_ISSUE_ALLOWED` / `CORRECTION_OFFICIAL_ISSUE_ALLOWED` = false · แอปเรียก `sc_fn_post_receipt`

**ยังไม่ทำ:** backfill แถวสมุดซื้อจาก JSON เข้า `sc_receipt_posts` · login/คลิก POS ด้วยบัญชีจริงทุก role · Chrome/มือถือจริงนอก Cursor

กู้คืนฉุกเฉินบน VPS: `mv .next-prev .next && git switch -C master 3df0766830fa0f96e497234e0482a852e07eaf9a && pm2 restart sneakercare`

### ผลเทสต์ระบบ (เครื่อง dev — ไม่แตะ production)

ผ่าน: `test:receipts` ทั้งชุด รวม `test-receipt-pg` — embedded Postgres 18 สอง session แข่ง `sc_fn_post_receipt` ใบเดียวกันได้หนึ่งแถว · `test:tax-recon` · `test:vat` · `test:wht` · `test:dashboard` · `test:period-close` · `test:usage` · `test:roster` · `test:expenses` · `test:reports` · `test:legacy` · `test:stock-concurrency` · `test:ui-contracts` (role-matrix + layout-slot + deploy-script) · `npm run build --webpack` ของโค้ดปัจจุบัน · `test:e2e-routes` บน `http://127.0.0.1:3005` (build ใหม่)

ไม่รัน (แตะ production / ไม่ได้อนุญาต): `test:staff` · `test:multi-tenant` · `check:money`

ยังไม่ได้ทดสอบและต้องป้ายแบบนี้: Chrome/Edge/Firefox/Safari จริง · มือถือ/แท็บเล็ตจริง · login ทุก role · คลิก POS/สต็อก/ลงสมุดบนเบราว์เซอร์ · refresh/เน็ตหลุด · backfill production

### เบราว์เซอร์ local (Cursor Chromium — ไม่ใช่ Chrome จริง)

- `http://127.0.0.1:3005/login` ฟอร์มครบ (ชื่อผู้ใช้ / รหัส / จดจำชื่อ / เข้าสู่ระบบ) · a11y เป็นไทยถูกต้อง
- viewport 390×844 และ 768×1024 ฟอร์มยังใช้ได้ ไม่ล้นจอ
- `/pos` และ `/dashboard` ไม่มีคุกกี้แล้วเด้ง `/login`
- อย่านับว่าตรวจ Chrome/มือถือจริง — ฟอนต์ไทยใน snapshot ของ IDE เคยเป็น tofu บน desktop แต่ a11y ยังอ่านไทยได้

### เทสต์สอง connection ของ Postgres

- `scripts/test-receipt-pg.mjs` ขึ้น embedded-postgres ถ้าไม่มี `TEST_DATABASE_URL` · ปฏิเสธ URL production (`supabase.co` / รหัสโปรเจกต์)
- ตัดคอมเมนต์ SQL ก่อน apply 0046 เพราะ Windows WIN874 รับ `·` ในคอมเมนต์ไม่ได้
- ไม่ห่อ `BEGIN` ค้างล็อก unique — ให้แต่ละ RPC เป็นธุรกรรมของตัวเอง ไม่เช่นนั้นสอง session จะรอกันจน timeout
- PGlite ใน `test-receipt-concurrency` ยังเป็นเอนจินเดียวตามเดิม

`etax_live` / `auto_issue` / `cn_official` ยังปิด · backfill สมุดซื้อบน production ยังต้องอนุมัติชุดเดียวกับ deploy

---

อัปเดต 2026-09-20 (รอบ receipt ledger + typecheck + deploy) — อ่านคู่กับ `CLAUDE.md`

## สถานะรอบก่อน — ยังไม่ deploy / ไม่ย้ายข้อมูล production

`origin/master` ก่อนรอบนั้น = `62d5435` · โค้ดเส้นทางลงสมุดใหม่ push แล้วที่ `7bac933`

### แก้แล้วในรีโป

- **ลงสมุดใบเสร็จ:** แหล่งหลัก = `sc_receipt_posts` ผ่าน `sc_fn_post_receipt` · JSON คิวเป็นภาพฉาย · อ่านคิวแล้ว merge จากตาราง · CAS/ภาษีซื้อพังหลัง RPC แล้วยังถือว่าลงสมุด ห้าม rollback ตาราง · กดซ้ำ = replay
- **typecheck:** ต้นเหตุคือไฟล์ generate ของ Next (`validator.ts` ใช้ `LayoutProps<Route>` เมื่อ `LayoutSlotMap["/"] = never` และ `app/layout.ts` ห้าม prop นอก children) ชนกับซอร์สเมื่อ `.next` ค้าง · `npm run typecheck` ใช้ `tsconfig.typecheck.json` ที่ไม่ดึง `.next` · `next-env.d.ts` ยังดึง `routes.d.ts`
- **deploy:** build ที่ `.next-new` ไม่ย้าย `.next` ระหว่าง compile · dirty/untracked หรือ VPS ahead หยุด · start ไม่ผ่านคืน `.next-prev` + commit เดิม แล้วรีสตาร์ต PM2

### แผน cutover สมุดซื้อ (ยังไม่ทำบน production)

1. นับ JSON ที่ `postedRequestId` มีค่า เทียบ `sc_receipt_posts` ต่อ tenant
2. backfill ด้วย RPC บนฐานทดสอบก่อน (สูตรใน `planBackfillLedgerFromQueue` + เทสต์ PGlite ผ่านแล้ว)
3. deploy แอปที่อ่าน merge + เขียน RPC — ผู้ใช้ที่เปิดค้างเห็นสถานะจากตารางเมื่อโหลดใหม่
4. กระทบยอด `reconReceiptBooks` จนช่องว่างเป็น 0
5. ห้ามเปิด `etax_live` / `auto_issue` / `cn_official`

ต้องอนุมัติเป็นชุดเดียว: deploy แอป + รัน backfill บน production (มี rollback 0046 อยู่แล้ว แต่ backfill ไม่ลบ JSON)

### ผลทดสอบรอบนี้

ผ่าน: `typecheck` (`tsconfig.typecheck.json`) · `test:receipts` (staging + ledger + cutover PGlite) · `test:ui-contracts` · `test:guards` (103 action รวม `postStagedReceipt`) · `test:checkout` · `test:money` · `test:docs` · `test:etax` · `test:idempotency` · `test:modals` · `test:deploy-vps`

ไม่ผ่าน / ไม่รัน: สอง connection Postgres จริง — ไม่มี `TEST_DATABASE_URL` / docker / psql บนเครื่องนี้ · `test:staff` / `test:multi-tenant` / `check:money` ไม่รัน (แตะ production)

ยังไม่ได้ทดสอบ: login/session จริงทุก role · POS/สต็อกบนเบราว์เซอร์ · Chrome/Edge/Firefox/Safari · มือถือ/แท็บเล็ตจริง · refresh/เน็ตหลุด/session หมดอายุแบบคลิก · `npm run build` รอบนี้ (build ที่เสิร์ฟ e2e เป็นชุดก่อนแก้ receipt ledger)

ผ่านเพิ่ม: `test:e2e-routes` บน `http://127.0.0.1:3004` — ไม่มีคุกกี้แล้ว `/tax-filing` `/settings` `/pos` `/invoicing` เด้ง login · `/login` เปิดได้ · snapshot Cursor browser (Chromium ใน IDE) เห็นฟอร์ม login ครบ แต่กลายเป็นตัวอักษรไทยไม่ขึ้น — ไม่นับว่าตรวจ Chrome/มือถือจริง

`etax_live` / `auto_issue` / `cn_official` ยังปิด

---

## รวมประวัติ Git (2026-09-20) — ยังไม่ deploy

ตรวจล่าสุดก่อนรวม (read-only):

| จุด | HEAD | หมายเหตุ |
|---|---|---|
| merge-base | `a7af426` | leftover build fix |
| เครื่องทำงาน (ก่อน merge) | `fdb3d4c` | มี type fix ของ `service-usage.ts` |
| origin/master (ก่อน push) | `3df0766` | git am บน VPS แล้วถูก push |
| VPS | `3df0766` + dirty `app/actions/service-usage.ts` | blob `03d04358` ตรงกับ type fix ในเครื่อง — **ไม่ได้** เปลี่ยน checkout/restart ในรอบนี้ |

แพตช์ซ้ำจาก `git am`: `02f9e7b` ≡ `b20da5a` (import `isDraftNumber`) และ `8fe2fb7` ≡ `3df0766` (เอกสาร `0046`) — ต้นไม้ไฟล์เหมือนกัน ไม่ rebase ประวัติที่อยู่บน origin แล้ว

**วิธีรวม:** merge `origin/master` เข้า `master` ของเครื่อง (`ort`) ได้ `3770f68` · สำรองที่ `backup/local-master-2026-09-20` (`fdb3d4c`) และ `backup/origin-master-2026-09-20` (`3df0766`) · แพตช์อยู่ใน `.git/merge-backup-2026-09-20/` (ไม่เข้า git)

ผลลัพธ์มี leftover (`6486912`) + import `isDraftNumber` + เอกสาร `0046` + ตัวกรอง type ใน `fetchUsageCatalog`

**deploy script:** `scripts/deploy-vps.mjs` ไม่ใช้ `git reset --hard` / `git checkout -- .` / `git clean -fd` · dirty/untracked หรือ VPS ahead หยุด · build ที่ `.next-new` แล้วค่อยสลับ `.next` · start ไม่ผ่านคืน `.next-prev` + commit เดิม แล้วรีสตาร์ต PM2 · **ห้ามรัน deploy จนกว่าจะอนุมัติชุด**

**ก่อน deploy ครั้งหน้า:** บน VPS ตรวจ `git diff app/actions/service-usage.ts` — ถ้าเนื้อหาเดียวกับ origin หลัง push ค่อยเคลียร์ dirty ห้ามทิ้งงานที่ไม่ได้อยู่บน origin · อย่า `reset --hard` ทับ dirty นี้

---

## ช่องว่างสมุดซื้อ JSON+CAS vs `0046` (ยังไม่ย้ายข้อมูล / ไม่สลับเส้นเขียน)

แอป `postStagedReceipt` เรียก `sc_fn_post_receipt` เป็นแหล่งหลักแล้ว · JSON ใน `sc_settings` เป็นคิว/ภาพฉาย · unique ที่ตารางกันซ้ำเมื่อแอปเส้นทางนี้ขึ้น production · ใบที่ลงสมุดใน JSON ก่อนหน้านี้ยังไม่อยู่ในตารางจนกว่าจะ backfill

แผนที่เหลือ (ยังไม่ย้ายข้อมูล production):

1. นับแถว JSON ที่ `postedRequestId` มีค่า เทียบจำนวนแถว `sc_receipt_posts` ต่อ tenant
2. backfill ด้วย `sc_fn_post_receipt` บนฐานทดสอบแล้วค่อย production เมื่ออนุมัติ · replay ถ้ามีแถวแล้ว
3. กระทบยอด `reconReceiptBooks` จนช่องว่างเป็น 0
4. JSON เหลือเป็นคิว/ภาพฉาย — ตารางเป็นแหล่งหลักหลัง deploy

`etax_live` / `auto_issue` / `cn_official` ยังปิดฝั่งเซิร์ฟเวอร์และที่ `sc_fn_guard_live_feature`

**ผลเทสต์รอบก่อน push เดิม (เก็บไว้):** merge history + leftover · ดูหัวเอกสารรอบล่าสุดด้านบน

---

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
- leftover บน production แล้ว (`6486912` / `a7af426`) · **`0046` apply แล้ว 2026-09-20** — `sc_receipt_posts` + `sc_fn_post_receipt` + `sc_fn_guard_live_feature` · คิวยังเป็น JSON+CAS · โค้ดใหม่ลงสมุดผ่าน RPC หลัง deploy · e-Tax เป็นคิว sandbox · CN/DN เป็นร่าง · ตัดสต๊อกอัตโนมัติยังปิด

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
