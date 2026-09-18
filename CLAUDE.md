## ✅ เครื่องมือสำคัญหาเจอ + หัวหน้าชุดเดียวกันทั้งระบบ (2026-09-18)

- **รายรับค่าเช่าห้อง** อยู่บน `/expenses` ทันทีหลังเลือกงวด — ปุ่ม “รายรับค่าเช่าห้อง” ที่หัวหน้าเลื่อนไปการ์ดเขียว “กรอกตรงนี้” · เลือกชื่อพนักงานผู้จ่ายหรือกรอกเอง · ต้องเลือกเดือน ไม่ใช่ “รวมสะสมทุกงวด”
- **แถบย่อยเส้นใต้ชุดเดียว** (`UnderlineNav`) — งานบริการ (รับงาน / ยอดสรุปรายวัน) · ออกเอกสาร (ใหม่ / ประวัติ) · ภาษี (e-Filing / 50 ทวิ / XML) · ค่าใช้จ่าย (รวม / เงินเดือน / ค่าดำเนินการ) · ตั้งค่า (ร้าน / ผู้ใช้ / ประวัติการใช้งาน)
- **เลิกแบนเนอร์อังกฤษไล่สี teal** ที่ `/pos/daily-entry` `/invoicing` `/tax-filing` `/settings` `/statistics` — ใช้ `PageHeader` ภาษาไทยแบบคลัง
- **ตัวกรองเดือนที่ `/statistics`** ไม่ hardcode ส.ค. 69 อีกแล้ว คำนวณจากวันที่เครื่อง (`lib/thai-months.ts`)
- **ไม่แตะสูตรเงิน / ledger / RLS / เอกสารพิมพ์**

## ✅ ภาษีหัก ณ ที่จ่าย + ค่าเช่าอาคาร / รายได้ค่าเช่าห้อง (2026-09-18)

- **สูตรกลาง `lib/wht.ts` `settleWht()`:** ยอดลงบัญชี = ฐานก่อน VAT + VAT · ยอดโอนสุทธิ = ยอดลงบัญชี − WHT · WHT คิดจากฐานก่อน VAT (อัตรา 1/2/3/5%) · ค่าเช่าอาคารบังคับ 5% เป็นค่าเริ่มต้น
- **ห้ามนับ WHT เป็นรายจ่ายซ้ำ** — `sc_opex.amount` ยังเป็นยอดเต็ม (เช่น ค่าเช่าตึก ฿18,000) · ฿900 ที่หักไว้ไปอยู่ใน `sc_wht_certificates` เพื่อออก 50 ทวิ / ยื่น ภ.ง.ด. ไม่ใช่แถว opex ใหม่
- **หมวดใหม่ `building_rent`** ("ค่าเช่าอาคาร/สถานที่") แยกจากสาธารณูปโภค · แถวเก่าชื่อ "สาธารณูปโภค & ค่าเช่า" / "ค่าเช่าร้าน" ยังอยู่หมวดเดิม ไม่ถูกย้าย
- **รายได้ค่าเช่าห้อง** กรอกที่ `/expenses` การ์ดเขียวบนสุดหลังเลือกงวด (ปุ่ม “รายรับค่าเช่าห้อง” ที่หัวหน้า) เลือกชื่อพนักงานผู้จ่ายหรือกรอกเอง · ลงบัญชียังยอดเต็ม · ถ้าผู้เช่าหักภาษีร้านไว้ กรอกอัตราได้
- **`/tax-filing`** ใช้แถว `sc_wht_certificates` จริง (payable เท่านั้นสำหรับไฟล์ ภ.ง.ด.3/53 + พิมพ์ 50 ทวิ) เลิกเดา 3% จากรายจ่าย ≥ ฿1,000
- **แบบ 50 ทวิ:** `components/tawi50-certificate.tsx` ตามแบบ ภ.ง.ด.50 ทวิ ของกรมสรรพากร — ฉบับที่ 1/2 · ช่องเลขผู้เสียภาษี 13 หลัก + สาขาที่ · ตารางข้อ 1–6 (ค่าเช่า/ค่าบริการกรอกข้อ 5 มาตรา 3 เตรส) · รวมตัวอักษร · checkbox (1) หักภาษี ณ ที่จ่าย เป็นค่าเริ่มต้น · ลายเซ็นผู้หัก + ประทับตรานิติบุคคลจาก `/settings` · ไม่ใส่ $ บนยอดเงิน
- **สมุดคู่ค้าที่ `/expenses`:** ปุ่ม “สมุดคู่ค้า / ผู้รับเงิน” เพิ่ม/แก้ชื่อ เลข 13 หลัก ที่อยู่ ก่อนบันทึกจ่าย — ตอนจ่ายเลือกจากรายชื่อได้ · **ไม่ปนกับ `/invoicing`** เพราะหน้านั้นเป็นใบแจ้งหนี้ลูกค้า (Bill To) ไม่ใช่บิลซื้อจากซัพพลายเออร์
- **apply production แล้ว (2026-09-18):** `0042` ผ่าน SSH+psql — `sc_wht_payees` / `sc_wht_certificates` + RLS 4 policy + unique `(tenant_id, tax_id)` / `(tenant_id, certificate_number)` + คอลัมน์ `tenant_name`/`tenant_tax_id`/`wht_rate`/`wht_withheld` บน `sc_rental_records` + หมวด `building_rent` (รันซ้ำ idempotent)
- เทสต์: `npm run test:wht` · `scripts/test-migration-0042.mjs` · `npm run test:expenses` (เพิ่มเคส building_rent)

## ✅ Super Admin จัดการสาขาได้ + แยก SneakerCare/LUXSU + มือถือ + บริการต่อกิจการ + ตารางเวร + ชื่อลูกค้าบนใบเสนอราคา (2026-09-17)

- **Super Admin เพิ่ม/แก้สาขาเองได้ที่ `/settings`** (ชื่อ, ที่อยู่, โทร, เวลาเปิด-ปิด, เปิด/ปิดใช้งาน) และเปิดกิจการใหม่ได้ — ห้ามตั้งชื่อสาขาว่า SneakerCare ให้กิจการอื่น
- **ตัวเลือกสาขาที่หัวเว็บ** แสดงชื่อกิจการก่อน แล้วค่อยชื่อสาขา — SneakerCare ของกิจการแรกไม่ปนกับสาขา LUXSU แม้ชื่อสาขาซ้ำ
- **มือถือ:** viewport-fit + กันเนื้อหาดันกว้างเกินจอ (`overflow-x: clip`, padding แคบลง) เมนูแฮมเบอร์เกอร์กว้างไม่เกินจอ — ตารางเวรบนมือถือเป็นรายการรายวันแทนปฏิทิน 7 ช่องที่อ่านไม่ออก
- **งานบริการ:** แคตตาล็อกดึงจาก `services` ของกิจการที่เลือก ไม่ดึง Package S/M/L/XL ของสาขาแรกไปให้ LUXSU (กิจการแรกยังใช้ชุดเดิมได้ถ้ายังไม่ได้ตั้งในฐานข้อมูล)
- **ตารางเวร:** เวลาเปิด-ปิดต่อสาขา (migration `0041`) · จัดเวรอัตโนมัติจากจำนวนคน + คนอยู่ร้านต่อวัน · วันนักขัตฤกษ์จากปฏิทินกลาง `lib/thai-holidays.ts` · ผู้ใช้กำหนดวันทำงาน/วันหยุดรายคนได้เหมือนเดิม
- **ใบเสนอราคาไม่มีชื่อลูกค้า:** สาเหตุคือ `createSmartAccDocument()` ไม่เคย insert `ext_contacts` (contact_id เป็น null ตลอด) — ตอนนี้บันทึกลูกค้าก่อนออกเอกสาร หัวเอกสารเป็น Bill To ตามมาตรฐานบัญชี
- **apply production แล้ว (2026-09-17):** `0041` ผ่าน SSH+psql — `inv_branches.open_time`/`close_time` + unique `(tenant_id, code)` บน `services` (รันซ้ำ idempotent)
- **แคตตาล็อก LUXSU ว่างแล้ว** — `services`/`service_orders` = 0 แถว (กิจการแรกยังมีบริการ 7 รายการเหมือนเดิม) · ลบสินค้าทดสอบ `TEST LUXSU ITEM (ลบได้)` ทิ้ง
- เทสต์: `npm run test:roster` · `scripts/test-migration-0041.mjs`

## ✅ วันที่รับงาน + audit มาตรฐาน + ไฟล์ยื่น e-Filing (2026-09-17)

- **`/pos`** มีช่องวันที่รับงาน/กรอกข้อมูล (ค่าเริ่มต้นวันนี้ตามปฏิทินเครื่อง ไม่ใช้ UTC) เลขที่เอกสารและ `received_at` อิงวันที่นี้
- **`logAudit()`** เก็บบริบทมาตรฐานทุกแถว: ใคร · ทำอะไร · วันเวลา · IP · User-Agent · เบราว์เซอร์ · อุปกรณ์ · หน้า — คอลัมน์ใหม่ใน `sc_audit_logs` (`0040`) และสำเนาใน `detail` ถ้ายังไม่ apply migration
- **apply production แล้ว (2026-09-17):** `0039` + `0040` ผ่าน SSH+psql — ยืนยัน FK `ext_documents.branch_id` ชี้ `inv_branches` และ `sc_audit_logs` มี 5 คอลัมน์บริบทครบ (รันซ้ำ idempotent)
- บันทึกเพิ่ม: สร้าง/เปลี่ยนสถานะงานบริการ, ล็อกอิน/ออกจากระบบ, ส่งออกไฟล์ภาษี — ดูที่ `/admin/audit`
- **`/tax-filing`** กดดาวน์โหลดแล้วได้ไฟล์จริง (แปะ `<a>` ใน DOM) · ภ.ง.ด.3 ไม่ disable อีกต่อไป
- ไฟล์ ภ.ง.ด.3/53 เป็น FORMAT กลางกรมสรรพากร V2 (UTF-8, `|`, CR/LF, Header `H` + Detail `D`, ชื่อไฟล์ `PND53_NID_สาขา_ปีพศ_เดือน_00_00.txt`) สำหรับอัปโหลดที่ https://efiling.rd.go.th/ — ต้องมีเลขผู้เสียภาษีผู้หัก 13 หลักที่ `/settings` และเลขผู้รับเงิน 13 หลักในชื่อหรือหมายเหตุรายจ่าย
- **ภ.พ.30** บน e-Filing กรอกในเว็บ ไม่ใช่ไฟล์แนบแบบ ภ.ง.ด. — ปุ่มนั้นเป็นรายงานภาษีขายสำหรับอ้างอิง
- เทสต์: `npm run test:tax` · `scripts/test-migration-0040.mjs`

## ✅ /invoicing ออกเอกสารไม่ได้เพราะ FK สาขาคนละตาราง (2026-09-17)

กด "ออกเอกสาร" แล้วขึ้น overlay "An error occurred in the Server Components render"
(digest ใน PM2: `ext_documents_branch_id_fkey`) — `createSmartAccDocument()` ใส่
`profiles.branch_id` ซึ่งเป็น UUID ของ `inv_branches` แต่คอลัมน์ชี้ไป `ext_branches`
(ตารางว่างที่แอปไม่เคยใช้) จึง insert ไม่ได้ทุกครั้ง แล้ว `throw` ทำให้ Next โชว์ overlay
แทนข้อความไทย

แก้ด้วย migration `0039` ย้าย FK ไปสาขาจริงของแอป + ใส่สาขาจากคุกกี้หัวเว็บ
(`getSelectedBranchId`) และคืน `{ success: false, error }` แทน throw

**apply production แล้ว 2026-09-17** ผ่าน SSH+psql — `ext_documents_branch_id_fkey` ชี้ `inv_branches`

## ✅ รีดีไซน์โมดูลคลังให้เป็นชุดเดียวกัน (2026-09-17)

หน้า `/inventory` `/stock-in` `/stock-out` `/adjustments` `/history` ใช้ `InventoryShell`
ร่วมกันแล้ว — หัวข้อภาษาไทยล้วน + แถบนำทางเส้นใต้ (สต๊อก / รับเข้า / เบิกใช้ / ตรวจนับ / ประวัติ)
แทนแบนเนอร์ไล่สี teal และปุ่มกระโดดข้ามหน้าที่ซ้ำกับเมนู ฟอร์มรับ-เบิก-ปรับกว้างขึ้น ปุ่มสลับโหมด
เป็น segmented ขาวบนพื้นเทา ไม่ใช่ native select / ปุ่มเขียวทึบ ตารางสต๊อกเลิกตัวหนาทุกช่อง
แถบย่อยซ่อนเมนูที่ role นั้นเข้าไม่ได้ (พนักงานไม่เห็นรับเข้า/ตรวจนับ) และหน้าต่างแก้ไขสินค้า
ไม่โชว์ช่องต้นทุนให้พนักงาน — เดิมถ้าพนักงานกดบันทึกจะส่งต้นทุน 0 ทับของจริง

**ไม่แตะสูตรเงิน / ledger / RLS** — เปลี่ยนเฉพาะชั้นแสดงผล + กันไม่ให้ฟอร์มคลังเขียนทับต้นทุนของพนักงาน

## ✅ รอบเสถียร/ความเร็ว/โค้ดสะอาด (2026-09-17)

ต่อจากรีดีไซน์คลัง — ไม่รีดีไซน์ตารางการเงิน (เสี่ยงสูตรเงิน) และยังไม่ใส่ healthchecks CSV

- **CI lint:** `AuthGate` เลิก `setState` ใน effect — อ่าน URL ด้วย `useSyncExternalStore` แล้วเรียก `setSession` เฉพาะตอนมี token (หลัง await)
- **ความเร็ว:** หน้าภาพรวมเลิกดึง `service_orders` ทั้งตาราง + `items` ซ้อน `item_stock(*)` ทั้งก้อน ทั้งที่ UI ใช้แค่จำนวน; badge สต๊อกต่ำใช้ตัวนับร่วม `countLowStockAlerts()` (แถวที่ mute กรองที่ query, cache ต่อ request) หัวเว็บยิงสาขา/คุกกี้/นับสต๊อกขนานกัน `getSelectedBranchId`/`tenantFilter` ห่อ `cache()`
- **มือถือ:** ตัวเลือกสาขาย้ายเข้าเมนูแฮมเบอร์เกอร์ (จอ < lg)
- **แถบเมนูหลัก:** เส้นใต้แบบเดียวกับโมดูลคลัง เลิกปุ่มเขียวทึบ

## ✅ หัวข้อการเงินเบาลงแบบคลัง — ไม่แตะสูตร (2026-09-17)

`/dashboard` `/expenses` `/reports` เลิกแบนเนอร์ไล่สี teal + หัวข้ออังกฤษ ใช้ `PageHeader` ภาษาไทย
แบบเดียวกับคลัง ตัวเลข KPI/ตารางเลิก `font-black` ทุกช่อง (เหลือ `font-semibold tabular-nums`)
แท็บภาพรวม/นำเข้าเป็นเส้นใต้ ไม่ใช่ปุ่มเขียว-teal ทึบ ปุ่ม "งวดปัจจุบัน" บนภาพรวมเคย hardcode
`"2026-08-31"` — แก้ให้ใช้วันนี้จริง ป้าย "3 พนักงาน" บน `/reports` เป็น label ตายตัว เปลี่ยนเป็น
"ตารางเวร" **สูตรเงิน / ledger / เอกสารพิมพ์สลิปไม่แตะ**

สคริปต์ CSV รายเดือน (`backup-monthly-csv.sh`) ยังข้าม heartbeat ถ้าไม่มี `HEALTHCHECK_CSV_URL`
แต่ตอนนี้เขียนเตือนลง log ชัดเจน แทนเงียบ — ยังต้องมี URL จาก healthchecks.io (Period 1 month /
Grace 2 days คนละตัวกับ backup รายวัน) ถึงจะ ping จริง

## ⬜ ยังไม่ทำ

- **healthchecks ของ CSV รายเดือน** ยังไม่มี check ตัวที่สอง (`HEALTHCHECK_CSV_URL`) — ต้องมี URL จาก healthchecks.io ก่อน แล้วใส่ใน `/home/ddservice/sneakercare-backup.env` บน VPS
- **`npm run typecheck` บนเครื่อง dev** แดงจากไฟล์ที่ Next generate (`.next/types` กับ `.next/dev/types` ชน `LayoutProps`) ไม่ใช่ซอร์สแอป — `next build` บน VPS ผ่านตามปกติ

## ✅ เลือกสาขาที่หัวเว็บแล้วหน้าจอเปลี่ยนจริง (2026-09-17)

เจ้าของรายงานว่าเลือกสาขาแล้วไม่มีอะไรเกิดขึ้น — สาเหตุไม่ใช่ RLS/tenant filter ที่เพิ่งปิดไป
แต่เป็นชั้นคุกกี้: `setActiveBranch()` เขียน `sc_active_branch` ใน Server Action แล้ว
`revalidatePath("/", "layout")` — Next.js วาด RSC ในรอบเดียวกันยังอ่านคุกกี้ชุดเก่าอยู่
แถม `BranchPicker` เป็น `<select defaultValue>` แบบ uncontrolled จึงโชว์สาขาใหม่ทั้งที่ป้ายหัวเว็บ
และข้อมูลหน้ายังเป็น “ทุกสาขา”

แก้โดยให้ตัวเลือกเรียก action แล้ว `router.refresh()` (request ใหม่ที่แนบคุกกี้ใหม่จริง)
เปลี่ยนเป็น dropdown ของระบบแทน native select และใส่ `dynamic = "force-dynamic"` ที่ layout
ของหน้าในระบบ — `/stock-in` `/stock-out` `/adjustments` ตอนยังไม่เลือกสาขาขึ้น empty state
ที่บอกให้เลือกจากแถบด้านบนแทนข้อความเทาใน Card เปล่า

**หมายเหตุ:** หน้าภาพรวมของแอดมินปกติที่มีสาขาเดียวใน tenant ตัวเอง ตัวเลขยอดขายจะไม่ขยับ
ตอนสลับ “ทุกสาขา ↔ สาขานั้น” เพราะ `sc_sales` ไม่มี `branch_id` (เป็นระดับนิติบุคคล) —
สิ่งที่ต้องเปลี่ยนทันทีคือป้ายสาขาที่หัวเว็บ และหน้าคลัง/รับ-เบิกของ ถ้าเป็น super_admin
สลับข้าม tenant ตัวเลขหน้าภาพรวมต้องเปลี่ยนตาม tenant ของสาขาที่เลือก

## ✅ /login รองรับลิงก์เชิญ/ตั้งรหัสผ่านใหม่แล้วจริง — เทสต์ด้วยลิงก์จริงจบครบวงจร (2026-09-17)

ตั้งแต่สร้างระบบมา `/login` ไม่มี logic รองรับลิงก์เชิญ (invite) หรือลิงก์ตั้งรหัสผ่านใหม่
(recovery) ของ Supabase เลยสักบรรทัด — `inviteUser()`/`sendPasswordReset()` ใน
`app/actions/users.ts` ส่ง `redirectTo: ${siteUrl}/login` เหมือนกันทั้งคู่ แต่คลิกลิงก์แล้วเจอแค่
ฟอร์มล็อกอินธรรมดา ไม่มีทางตั้งรหัสผ่านได้เลย (เจอครั้งแรกตอนเชิญแอดมิน LUXSU) ที่ผ่านมาทุกบัญชีที่
เชิญเข้าระบบสำเร็จได้เพราะตั้งรหัสผ่านให้ตรงๆ ผ่าน `admin.auth.admin.updateUserById()` แทนเสมอ
ไม่เคยผ่านอีเมลจริงเลยสักครั้ง

**สร้าง `AuthGate` (`app/login/auth-gate.tsx`)** — client component ตรวจ URL ตอนโหลด `/login`
ว่ามี token ของ Supabase ปนมาไหม (ทั้งแบบ hash fragment `#access_token=...&type=recovery|invite`
และแบบ query string OTP `?token_hash=...&type=...` — ไม่ต้องรู้ล่วงหน้าว่าโปรเจกต์ตั้งค่าแบบไหน)
ถ้าใช่ → สลับไปแสดง `SetPasswordForm` (`app/login/set-password-form.tsx`) แทนฟอร์มล็อกอินปกติ
ไม่ถามรหัสผ่านเดิมเพราะการมีลิงก์ที่ยังไม่หมดอายุคือการยืนยันตัวตนอยู่แล้วในตัว (ต่างจาก `/account`
ที่ต้องกรอกรหัสผ่านเดิมเพราะเป็น session ปกติ)

**⚠️ ทำไมต้อง redirectTo ไปที่ `/login` เดิม ห้ามสร้าง route ใหม่แยก:** `middleware.ts` (ดู
`lib/supabase/middleware.ts`) จะ redirect ไปที่ `/login` ทันทีถ้าไม่มี session cookie ที่ถูกต้อง
**ยกเว้นกรณีเดียวคือ pathname ตรงกับ `/login` เป๊ะๆ อยู่แล้ว** ซึ่ง token ที่มากับ hash fragment
ไม่เคยถูกส่งไปที่ server เลย (fragment เป็นแค่ฝั่ง browser) ถ้า redirectTo ไปที่ path อื่น จะโดน
middleware เด้งกลับมา `/login` ก่อน ซึ่งความเสี่ยงคือ fragment อาจหายไปตอน redirect ข้าม path —
คงไว้ที่ `/login` เดิมจึงปลอดภัยที่สุด (ไม่มี redirect เกิดขึ้นเลยตั้งแต่ต้น)

**🔴 เจอบั๊กจริง 2 ชั้นระหว่างทดสอบด้วยลิงก์จริง (ไม่ใช่แค่เดาจากเอกสาร Supabase):**

1. **รอบแรกพึ่ง `detectSessionInUrl` (auto-detect ของ supabase-js) แล้วรอผลผ่าน `getSession()`
   — ทดสอบจริงแล้ว "ไม่ทำงาน" กับ `createBrowserClient()` ของ `@supabase/ssr`** (พฤติกรรม
   auto-detect ไม่แน่นอนเมื่อรวมกับ client ที่ sync session ผ่านคุกกี้แบบนี้) `getSession()`
   คืนค่าว่างตลอดทั้งที่ token ในลิงก์ยังไม่หมดอายุจริง ผู้ใช้เจอ "ลิงก์หมดอายุ" ทั้งที่ลิงก์ดีอยู่
   **แก้โดยแกะ `access_token`/`refresh_token` จาก hash fragment เองตรงๆ แล้วเรียก
   `setSession()` ตรงๆ** — deterministic กว่าและพิสูจน์แล้วว่าทำงานจริง
2. **หลังแก้ข้อ 1 แล้ว `updateUser({password})` สำเร็จจริง (ยืนยันแยกด้วย
   `scripts/test-login.mjs`) แต่ `window.location.href = "/dashboard"` ที่ยิงทันทีหลังจากนั้น
   โดน middleware เด้งกลับมา `/login` เฉยๆ ไม่มี error ให้เห็นเลย** — สาเหตุคือ cookie session
   ที่ `@supabase/ssr` เขียนให้ยังไม่ flush ทันเวลาที่ browser ยิง request ถัดไป (race ระหว่าง
   cookie write กับ navigation) แก้โดยรอ `getSession()` อีกรอบ (บังคับ sync) + หน่วงสั้นๆ ก่อน
   navigate และเพิ่มหน้าจอ "สำเร็จแล้ว + ปุ่มกดเอง" ไว้เป็น fallback กันผู้ใช้ค้างเจอหน้าเปล่า

**เครื่องมือทดสอบใหม่ที่ทำให้จับบั๊กทั้งสองข้อนี้ได้จริง — ไม่ต้องมีสิทธิ์เข้าอีเมล:**
`scripts/gen-test-recovery-link.mjs` — สร้างบัญชีทดสอบชั่วคราว + เรียก
`admin.auth.admin.generateLink({ type: "recovery", ... })` ตรงๆ ซึ่ง Supabase คืน `action_link`
จริงกลับมาในผลลัพธ์ API ทันที (ไม่ต้องส่งอีเมลเลย) เอาลิงก์นั้นไปเปิดในเบราว์เซอร์จริงผ่าน
claude-in-chrome ได้ทันที **นี่คือวิธีเดียวที่ยืนยันได้จริงว่าฟีเจอร์นี้ทำงาน** เพราะไม่มีทางเข้าถึง
inbox ของอีเมลจริงได้ — รันเองทุกครั้งที่แก้ auth flow อะไรที่เกี่ยวกับลิงก์อีเมล
(`node --env-file=.env.local scripts/gen-test-recovery-link.mjs` แล้วลบทิ้งด้วย
`--cleanup <uid>` เสมอหลังทดสอบเสร็จ)

**ยืนยันจบครบวงจรจริงบน production:** สร้างบัญชีทดสอบ + profile → ขอลิงก์ recovery จริง → เปิด
ลิงก์ในเบราว์เซอร์ (ล็อกเอาต์ก่อนเสมอ — ถ้ามี session ค้างอยู่ middleware จะเด้งไป `/dashboard`
ก่อนถึง AuthGate เพราะเช็ค "ล็อกอินอยู่แล้วเปิด /login" ก่อน ไม่ใช่บั๊กของ AuthGate) → เห็นฟอร์ม
"ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ" → กรอกรหัสผ่านใหม่ → เข้า `/dashboard` สำเร็จในฐานะผู้ใช้จริง
(เห็น badge "Staff · AuthGate Test" ที่หัวเว็บ) → ลบบัญชีทดสอบทิ้งหมดแล้ว

**นี่คือการใช้ `lib/supabase/client.ts` (browser client) ครั้งแรกในระบบ** — ทุก query อื่นในแอป
ผ่านเซิร์ฟเวอร์หรือ service_role ทั้งหมด แต่การอ่าน URL fragment ทำได้แค่ฝั่ง browser เท่านั้น
(fragment ไม่เคยถูกส่งไปที่ server เลยตามสเปก HTTP) จึงไม่มีทางทำผ่าน Server Component ได้

## ✅ ไล่ปิดช่องโหว่ tenantFilter()/RLS ทั้งระบบแล้ว + เจอบั๊กเขียนข้อมูลผิด tenant จริง 2 จุด (2026-09-17)

ต่อจากหัวข้อ "super_admin ใช้งานจริงได้ครบแล้ว" ด้านล่าง — ตอนนั้นแก้แค่ `/dashboard` เป็นเคสแรก
ที่เจอ เจ้าของสั่งให้ "ไล่แก้ให้ครบ พร้อมเทสระบบ" จึงไล่ตรวจทุกจุดที่เข้าข่ายเดียวกัน แบ่งเป็น
2 กลุ่มตามสถาปัตยกรรม:

**กลุ่ม 1 — `lib/tenant.ts`'s `tenantFilter()`/`requireTenantId()` (service_role):** เปลี่ยนจาก
sync เป็น **async** — เดิมคืน `null` (= ไม่กรอง) ให้ super_admin เสมอไม่สนใจสาขาที่เลือกไว้เลย
ตอนนี้ resolve จากสาขาที่เลือกไว้ (ผ่าน `getSelectedBranchId()`) แล้วหา tenant ของสาขานั้นให้
อัตโนมัติ — ไม่เลือกสาขา = ยังเห็นภาพรวมข้ามทุก tenant เหมือนเดิม (ตรงกับหลักการเดียวกับ badge
สต๊อกต่ำ) แก้ call site ทุกจุดให้ `await` (11 ไฟล์: `analytics.ts`, `daily-sales.ts`,
`expenses.ts`, `import-export.ts`, `inventory.ts`, `roster.ts`, `shop-settings.ts`,
`smartacc-documents.ts`, `smartacc-expenses.ts`, `users.ts`, `billing-notes/page.tsx`,
`(app)/layout.tsx`) — `admin/co-admin/staff` พฤติกรรมไม่เปลี่ยนเลยเพราะยังคืน `profile.tenant_id`
ตรงๆ เหมือนเดิม **ผลข้างเคียงที่ดี:** เอาบล็อก `inviteUser()` สำหรับ super_admin ที่เพิ่งใส่ไปก่อน
หน้านี้ออกได้เลย เพราะตอนนี้ resolve tenant จากสาขาที่เลือกได้เองแล้ว

**กลุ่ม 2 — หน้าที่ query ผ่าน session client (RLS) โดยไม่กรอง tenant เองเลย:** RLS ปกป้อง admin
ทั่วไปถูกต้องอยู่แล้ว (เห็นแค่ tenant ตัวเองเสมอ) แต่ super_admin's RLS อนุญาตทุก tenant เสมอไม่
สนใจสาขาที่เลือก — พิสูจน์จริงที่ `/reports`: เลือกสาขา LUXSU (0 แถวในทุกตาราง) แล้วหน้ายังโชว์
"306 รายการ" ของ tenant #1 อยู่ดี แก้ด้วย `tenantFilter()` (ตัวเดียวกับกลุ่ม 1) เติม
`.eq("tenant_id", ...)` เอง: `/reports` (sc_sales, items, sc_expenses), `/inventory`,
`/admin/items`, `/adjustments`, `/stock-in`, `/stock-out` (ทุกที่ที่ query `items` แคตตาล็อกกลาง)
— `/pos` และ `/history` ไม่ต้องแก้เพราะกรองด้วย `branch_id` อยู่แล้วซึ่งผูกกับ tenant เดียวเสมอ

**🔴 เจอบั๊กร้ายแรงกว่าที่คิดระหว่างไล่ — ไม่ใช่แค่ super_admin edge case แต่กระทบ LUXSU จริงตอนนี้:**
`items.ts`'s `createItem()` และ `stock.ts`'s `createStockIn()` (โหมด "+ เพิ่มสินค้าใหม่") **insert
เข้า `items` โดยไม่ระบุ `tenant_id` เลย** — migration 0028 ตั้ง DEFAULT เป็น tenant #1 ตายตัว ⇒
**แอดมิน LUXSU (หรือ tenant ไหนก็ตามที่ไม่ใช่ #1) เพิ่มสินค้าใหม่ตอนนี้ จะได้แถวไปโผล่ที่แคตตาล็อก
ของ tenant #1 แบบเงียบๆ ทุกครั้ง ไม่ใช่ของ tenant ตัวเอง** — แก้ `items.ts` ให้ใช้
`requireTenantId(profile)`, แก้ `stock.ts` ให้หา tenant จาก `branchId` ที่กำลังรับของเข้าจริงตรงๆ
(กันกรณี cookie สาขาที่เลือกไว้ไม่ตรงกับ branchId ของฟอร์ม) **ทดสอบจริงบน production:** สร้าง
"TEST LUXSU ITEM" ขณะเลือกสาขา LUXSU → โผล่ถูกต้องในแคตตาล็อก LUXSU → สลับไป tenant #1 →
**ไม่โผล่ในแคตตาล็อก tenant #1 เลย** (ยืนยันว่าบั๊กปิดจริง) → ปิดใช้งานทิ้งหลังทดสอบเสร็จ

**พบเพิ่ม: `/stock-in`'s fallback ตอนไม่ได้เลือกสาขา เสี่ยงเขียนผิดสาขา/ผิด tenant แบบเงียบๆ**
เดิม `if (!branchId) { หยิบสาขาแรกแบบไม่กรอง tenant (.limit(1).single()) หรือ hardcode UUID
ของสาขา tenant #1 }` — แก้เป็นบล็อกแล้วขอให้เลือกสาขาก่อนเสมอ (รูปแบบเดียวกับ `/stock-out` ที่ถูก
อยู่แล้ว และตรงกับกฎข้อ 12 ที่มีอยู่แล้วว่า "การเบิก-รับ-ปรับ-ของเสียต้องเลือกสาขาให้ชัดก่อน")

**ปิดช่องว่างที่ CLAUDE.md เองเคยบันทึกไว้ว่ายังไม่ได้แก้: `inv_fn_approve_adjustment()` ไม่รู้จัก
super_admin** — DB function เช็ค `inv_fn_current_role() not in ('admin', 'co-admin')` เขียนไว้
ก่อน super_admin จะมีอยู่จริง (ตรวจ prosrc บน production ตรงๆ ก่อนแก้) ⇒ super_admin กดอนุมัติ
adjustment ไม่ได้เลย ได้ exception ทันที ปิดด้วย **`0038_approve_adjustment_super_admin.sql`**
(เพิ่ม `'super_admin'` เข้า IN list — เงื่อนไขกันข้ามสาขาของ co-admin ไม่แตะ) คู่กับแก้
`stock.ts`'s `createAdjustment()` ให้ super_admin สร้างแล้วอนุมัติอัตโนมัติเหมือน admin (ไม่ใช่รอ
อนุมัติเหมือน co-admin/staff) และ `adjustments/page.tsx` ให้แสดงการ์ด "รายการรออนุมัติ" ให้
super_admin ด้วย **ทดสอบผ่าน PGlite ครบ (`test-migration-0038.mjs`)** จำลองพฤติกรรมก่อน/หลังแก้
+ admin/co-admin/staff เดิมไม่เปลี่ยน + rollback — apply ขึ้น production แล้วผ่าน SSH+psql

**ทดสอบทั้งชุดผ่าน browser จริงกับ production หลัง deploy:** `/reports`, `/inventory`,
`/admin/items`, `/stock-in`, `/stock-out`, `/adjustments` ทุกตัวโชว์ "0"/ว่างถูกต้องตอนเลือก
LUXSU และกลับมาถูกต้องเหมือนเดิมตอนสลับกลับ tenant #1 — `npm run typecheck`/`lint`/
`test:guards`/`test:migration` ผ่านครบทุกจุดก่อน deploy ทุกรอบ

**เก็บระหว่างทาง (ไม่ใช่บั๊กจริง แค่ label หลอก):** `stock-in-form.tsx` มี placeholder
"เลือกสินค้าจากรายการ 46 รายการ..." เขียนเป็น string ตายตัว ไม่ใช่ค่าจริง — แก้เป็น
`${items.length}` ให้ตรงของจริงเสมอ ส่วน `reports-client.tsx`'s badge "3 พนักงาน" ยังเป็น label
ตายตัวเหมือนกัน แต่ไม่ใช่ช่องโหว่ (ไม่มีข้อมูลจริงไหลออกมา) ยังไม่ได้แก้ เพราะอยู่นอกขอบเขตของรอบนี้

## ✅ super_admin ใช้งานจริงได้ครบแล้ว — เลือกสาขาข้าม tenant ได้, จัดการผู้ใช้ข้าม tenant ได้ (2026-09-17)

เจ้าของทดสอบบัญชี super_admin เองหลังสร้างเสร็จ (ดูหัวข้อ "/roster hardcode" ด้านล่างสำหรับที่มา)
แล้วเจอ 2 อาการจริง: (1) เลือกสาขาของ LUXSU (tenant ที่สอง) ไม่ได้ (2) เข้าเมนูจัดการผู้ใช้แล้ว
หา `waraphat.wpk@gmail.com` ไม่เจอ — พร้อมย้ำว่า **admin ปกติต้องยังจัดการได้แค่ tenant ตัวเองเท่านั้น
เหมือนเดิม ห้ามเปลี่ยน**

**สาเหตุ (1):** `lib/branch.ts` เช็คแค่ `role !== "admin"` ⇒ `super_admin` (ซึ่ง `branch_id`/
`tenant_id` เป็น `null` เสมอโดยตั้งใจ เพราะไม่ผูกกับ tenant ไหนเลย) ตกไปอยู่กลุ่มเดียวกับ
staff/co_admin ที่ "ต้องมี branch_id ตายตัว" ⇒ ได้ `null` กลับไปตลอด ไม่มีทางเลือกสาขาผ่านคุกกี้ได้
แก้ `getSelectedBranchId()`/`assertWritableBranch()` ให้เช็ค `role !== "admin" && role !== "super_admin"`
แทน และเปิด `BranchPicker` ให้ super_admin เห็นด้วย (`app/(app)/layout.tsx`) — สาขาที่แสดงต่อท้าย
ด้วยชื่อ tenant เจ้าของ (`SneakerCare — LUXSU`) เพราะสองสาขาชื่อซ้ำกันได้ (ทั้ง tenant เดิมและ
LUXSU ตั้งชื่อสาขาว่า "SneakerCare" เหมือนกัน)

**พบเพิ่มระหว่างแก้ (ไม่ได้อยู่ในสิ่งที่เจ้าของรายงาน): badge แจ้งเตือนสต๊อกต่ำที่หัวเว็บไม่กรอง
tenant เลย** ตอน "ดูทุกสาขา" (ค่าเริ่มต้น/สถานะที่พบบ่อยที่สุด) — ใช้ `createAdminClient()`
(service_role, ข้าม RLS) ไม่มี WHERE tenant เลย ⇒ ถ้ามีมากกว่า 1 tenant ที่มีข้อมูลจริง badge จะ
นับรวมของทุก tenant ปนกัน แก้ให้กรองด้วย tenant ของผู้เรียกเฉพาะ admin ปกติ (super_admin ยังเห็น
ภาพรวมข้ามทุก tenant ต่อไปตามที่ควรเป็นสำหรับมุมมองระดับแพลตฟอร์ม)

**🔴 พบบั๊กใหญ่กว่าที่คิดระหว่างพิสูจน์ว่าเลือกสาขาแล้วใช้งานได้จริง — ไม่ใช่แค่ UI ที่พังก่อนหน้า:**
`/dashboard` (หน้าแรกที่ทุกคนเห็น) query `sc_sales`/`sc_opex`/`sc_payments`/`service_orders`/
`items`/`sc_expense_entries`/`v_low_stock` ผ่าน session client **โดยไม่กรอง tenant/branch เอง
เลย พึ่ง RLS อย่างเดียว** — ใช้ได้ปกติกับ admin ทั่วไป (RLS บังคับเห็นแค่ tenant ตัวเองอยู่แล้ว
ไม่ว่าจะเลือกสาขาไหน) **แต่ RLS ของ super_admin อนุญาตให้เห็นทุก tenant เสมอโดยไม่สนใจ cookie
สาขาที่เลือก** ⇒ เลือกสาขา LUXSU ในตัวเลือกหัวเว็บแล้ว หน้า dashboard ยังโชว์ตัวเลขของ tenant #1
เหมือนเดิมทุกประการ (พิสูจน์กับ production จริง: `sc_sales` ของ LUXSU มี **0 แถว** แต่ dashboard
ยังโชว์ ฿48,534.86 ของ tenant #1 อยู่ดีตอนเลือก LUXSU) แก้โดยเพิ่มเงื่อนไข **เฉพาะ super_admin
ที่เลือกสาขาใดสาขาหนึ่งไว้ (ไม่ใช่ "ดูทุกสาขา")** ให้กรองทุก query ด้วย tenant_id ของสาขานั้น
(`v_low_stock` ไม่มีคอลัมน์ tenant_id เพราะเป็น view join item_stock/items — กรองผ่าน branch_id
ของทุกสาขาใน tenant นั้นแทน เหมือนวิธีที่ใช้กับ badge สต๊อกต่ำ) ไม่เลือกสาขา = ยังเห็นภาพรวม
ข้ามทุก tenant เหมือนเดิม (ตรงกับหลักการเดียวกับ badge) **admin/co-admin/staff ปกติไม่กระทบเลย**

**⚠️ ช่องโหว่ระดับเดียวกันน่าจะมีอยู่ในหน้าอื่นที่ใช้ pattern `tenantFilter(profile)`/
`requireTenantId(profile)` ผ่าน service_role เหมือนกัน** (grep เจอ 9 ไฟล์: `roster.ts`,
`users.ts`, `expenses.ts`, `smartacc-expenses.ts`, `smartacc-documents.ts`, `inventory.ts`,
`import-export.ts`, `daily-sales.ts`, `analytics.ts`) — `tenantFilter()` คืน `null` (= ไม่กรอง)
ให้ super_admin เสมอโดยไม่สนใจสาขาที่เลือกไว้ผ่านคุกกี้เลย เหมือนที่ `/dashboard` เคยเป็น
**ยังไม่ได้แก้ทุกไฟล์** (`/dashboard` แก้แล้วเพราะเป็นหน้าแรกที่ทดสอบเจอจริง) — ก่อนจะใช้
super_admin ดู `/pos`, `/statistics`, `/reports`, `/expenses`, `/inventory`, `/invoicing`,
`/tax-filing` ของ tenant ที่สองจริงจัง ต้องไล่แก้ให้ครบก่อน (รูปแบบเดียวกับที่ `/dashboard` ใช้:
ถ้า super_admin เลือกสาขาไว้ → หา tenant ของสาขานั้น → เติม `.eq("tenant_id", ...)` ในทุก query
ที่พึ่ง `tenantFilter()`/RLS อย่างเดียว)

**สาเหตุ (2) — ไม่ใช่บั๊กข้อมูล เป็นช่องว่างการแสดงผล:** `/admin/users` ไม่เคยแสดงคอลัมน์อีเมลเลย
ตั้งแต่สร้างมา (`profiles` ไม่มีคอลัมน์ email — อีเมลอยู่ใน Supabase Auth แยกต่างหาก) บัญชีของ
waraphat มีอยู่จริงในระบบ (เห็นได้ผ่าน RLS ปกติ ตรวจแล้ว) แค่แสดงเป็น "Admin LUXSU" / `luxsu_admin`
ไม่มีอีเมลให้เทียบ แก้โดยเพิ่มคอลัมน์ "อีเมล" ใน `app/(app)/admin/users/page.tsx` — ดึงจาก
`admin.auth.admin.listUsers()` (ต้อง service_role) แล้ว join ด้วย `id` เข้ากับแถว `profiles`
ที่ RLS กรองมาให้แล้ว (ไม่รั่วอีเมลข้าม tenant เพราะ join กับ id ที่กรองมาแล้วเท่านั้น ไม่ได้
เอา listUsers() ทั้งก้อนมาแสดง)

**เพิ่มด้วย: `app/actions/users.ts`'s `sendPasswordReset()`/`deleteUser()` เรียก
`requireTenantId(profile)` ซึ่ง throw ทันทีถ้าไม่มี tenant (กรณี super_admin)** — กดปุ่ม
"ส่งลิงก์ตั้งรหัสใหม่"/"ลบ" บนแถวของผู้ใช้ tenant ไหนก็ตามจะพังทันทีถ้าทำในฐานะ super_admin
แก้ให้ข้ามการเช็ค tenant-match เฉพาะ `role === "super_admin"` เท่านั้น (ยังคงบังคับ tenant-match
เข้มงวดเหมือนเดิมทุกประการสำหรับ admin ปกติ ตามที่เจ้าของย้ำ) — `inviteUser()` ยังต้องมี tenant
เสมอ (ยังไม่มี UI ให้ super_admin เลือกว่าจะเชิญเข้า tenant ไหน) จึงตอบ error สุภาพแทนที่จะ throw

**ทดสอบจริงผ่าน browser กับ production หลัง deploy:** login ด้วยบัญชี super_admin จริง →
เลือกสาขา LUXSU จาก dropdown ได้จริง (แสดงชื่อ tenant กำกับถูกต้อง) → `/dashboard` เปลี่ยนเป็น
฿0.00 ตามจริง (LUXSU ยังไม่มียอดขาย) → สลับกลับไป tenant เดิม → ตัวเลขกลับมาถูกต้องเหมือนเดิม →
`/admin/users` เห็นอีเมลครบทุกแถวรวม `waraphat.wpk@gmail.com` → กด "ส่งลิงก์ตั้งรหัสใหม่" บนแถว
ของ LUXSU admin (คนละ tenant กับ super_admin) สำเร็จ ไม่มี error

## 🔴🔴 [แก้ช่องโหว่จริงแล้ว] /roster hardcode ชื่อพนักงาน + /expenses seed เลขบัตร/บัญชีข้าม tenant (2026-09-17)

เจ้าของขอเปิด tenant ที่สอง (LUXSU — สาขา "SneakerCare" นิติบุคคลใหม่ ไม่ใช่ของเดิม) พร้อมฟีเจอร์
บันทึกขาด/ลา/มาสาย/OT รายวัน/โบนัสจากจำนวนคู่รองเท้า — ตรวจโค้ดก่อนสร้าง tenant จริงแล้วเจอ 2 เรื่อง
ที่ต้องแก้ก่อน ไม่ใช่แค่ฟีเจอร์ที่ขอเพิ่ม:

1. **`/roster` hardcode ชื่อ เชียง/มิ้ว/เจ (พนักงานของ tenant #1) ไว้ตรงในโค้ดทั้งไฟล์**
   (รายชื่อพนักงาน, ตารางกะรายสัปดาห์, วันหยุดประจำตัว, ประมาณการค่าจ้าง) — เปิดให้ tenant อื่นใช้
   `/roster` แล้วจะเห็นพนักงานผิดคนทันที ไม่ใช่แค่ไม่สมบูรณ์
2. **🔴 ร้ายแรงกว่า: `fetchAllExpensesData()` (`app/actions/expenses.ts`) seed ข้อมูลพนักงาน 3 คน
   นี้เข้า `staffMap` แบบไม่มีเงื่อนไขเลย พร้อมเลขบัตรประชาชนและเลขบัญชีธนาคาร** — ถ้าไม่แก้
   แอดมินของ LUXSU เปิดหน้า `/expenses` ครั้งแรกจะเห็น "พนักงาน" ของ tenant #1 ปนอยู่ในรายชื่อของ
   ตัวเอง พร้อมข้อมูลส่วนบุคคลที่ควรเป็นความลับ — เป็นทั้งบั๊กใช้งานและข้อมูลรั่วไหลข้าม tenant จริง
   ไม่ใช่แค่ทฤษฎี เจอจากการอ่านโค้ดก่อนสร้าง tenant จริง ไม่ใช่จากรายงานผู้ใช้

**แก้ `/roster` ด้วย migration `0037_roster_staff_stats.sql`:** เพิ่ม `default_shift`/
`default_day_off`/`bonus_per_pair` ให้ `sc_employees` แล้ว backfill ค่าจริงของ เชียง/มิ้ว/เจ
(⚠️ match ผิดรอบแรก — ชื่อเล่นอยู่คอลัมน์ `nickname` แยกต่างหาก ไม่ได้ฝังใน `name` แบบที่โค้ดเดิม
เขียนไว้ ตรวจกับ production จริงก่อนแก้จึงเจอ) และพบว่า **"เจ" ไม่เคยมีแถวใน `sc_employees` เลย**
(มีแค่ 3 แถวจริงคือ มิ้ว/เชียง/ไมโล) ทั้งที่ระบบ payroll อ้างถึงเธอทั่วทั้งไฟล์มาตลอด — สร้างแถวให้
ครบเป็นครั้งแรก `roster-client.tsx` เขียนใหม่ทั้งไฟล์ให้ดึงพนักงานจริงผ่าน `fetchRosterStaff()`
(`app/actions/roster.ts`) แทน `EMPLOYEES`/`WEEKLY_SHIFTS` ที่ hardcode เดิม พร้อมหน้าต่างตั้งค่า
กะ/วันหยุด/โบนัสต่อคู่ต่อพนักงาน (`updateEmployeeRosterDefaults`)

**แก้ช่องโหว่ `/expenses` โดยล้อม seed เดิมด้วย `if (!tenantId || tenantId === T1_ID)`** — ยังไม่ลบ
ทิ้งถาวรเพราะไม่กล้าเสี่ยงเปลี่ยนตัวเลขของเดือนเก่าที่กระทบยอดกับ Excel ไว้แล้วโดยไม่ตรวจทุกเดือนก่อน
แต่ปิดไม่ให้ leak ไปยัง tenant อื่นได้ทันที — ปลอดภัยเพราะ 3 คนนี้ (+ "เจ" ที่เพิ่งสร้างแถวให้) มีแถวจริง
ใน `sc_employees` ครบแล้ว เส้นทาง fallback ด้านล่าง (`dbEmployees.forEach`) จึงรับช่วงต่อให้ tenant
อื่นได้เองโดยไม่ต้องพึ่ง seed hardcode เลย

**เพิ่มตาราง `sc_staff_daily_stats` ใหม่** (บันทึกขาด/ลา/มาสาย/OT/จำนวนคู่ต่อพนักงานต่อวัน — ลูกค้า
LUXSU ขอมา) `unique (tenant_id, employee_name, stat_date)` RLS: staff อ่านได้ (ตรงกับโมดูล roster)
เขียนได้แค่ admin/co-admin — เชื่อมเข้า `fetchAllExpensesData()` แล้ว: **auto-fill OT ให้อัตโนมัติ
เฉพาะตอนยังไม่มีใครกรอกด้วยมือ** (`p.ot === 0`) กัน override ค่าเดิม + คำนวณ **โบนัสจำนวนคู่** เป็น
รายการแยกใน `netPay` (ไม่ปนกับ `commission` เดิมที่คิดจาก % ยอดขาย — คนละฐานคำนวณ) ค่าเริ่มต้น
`bonus_per_pair = 0` ทุกคน ⇒ **ไม่กระทบตัวเลขเดิมของ tenant #1 เลยจนกว่าจะมีคนตั้งอัตราเอง**

**ทดสอบผ่าน PGlite ครบ (`test-migration-0037.mjs`)** ครอบคลุม backfill ถูกต้อง (match nickname),
สร้างแถวเจอัตโนมัติ, unique constraint กันบันทึกซ้ำ, RLS ถูกต้องทั้ง admin/staff/super_admin,
rollback สะอาด — `npm run typecheck`/`npm run lint` ผ่านทั้งคู่หลังเขียนใหม่ทั้ง `roster-client.tsx`

**✅ [2026-09-17] ทดสอบกับ production จริงผ่านเบราว์เซอร์แล้ว (claude-in-chrome)** — เหตุผลที่ต้อง
ใช้เบราว์เซอร์จริงแทน `test:multi-tenant`: `fetchAllExpensesData()`/`fetchRosterStaff()` เป็น
Next.js Server Action ที่พึ่ง request context (cookies) เรียกจากสคริปต์ Node ธรรมดานอกเฟรมเวิร์ก
ไม่ได้ สร้างบัญชีทดสอบชั่วคราว 2 ชุด (tenant #1 จริง + tenant ปลอมใหม่) ล็อกอินจริงทีละคน:

- **บัญชีทดสอบของ tenant #1 (ของจริง):** `/roster` แสดง "พนักงาน (4 คน)" ครบทั้งมิ้ว (หยุดอาทิตย์),
  เชียง (หยุดพุธ), ไมโล (ยังไม่ได้ตั้งค่า — ถูกต้อง เพราะไม่ใช่ 1 ใน 3 คนเดิม), และ **เจ (หยุดศุกร์,
  ทดลองงาน 350฿/วัน, เดือนนี้ทำงาน 26 วัน = ประมาณการ ฿9,100)** — พิสูจน์ว่าแถว `sc_employees`
  ที่ 0037 สร้างให้เจอัตโนมัติทำงานถูกต้องสมบูรณ์ · `/expenses` แสดง "บัญชีเงินเดือนพนักงาน (4)"
  ตรงกัน ไม่มี regression จากการล้อม seed เดิมด้วยเงื่อนไข tenant
- **บัญชีทดสอบของ tenant ปลอมใหม่ (จำลอง LUXSU):** `/roster` แสดง **"พนักงาน (0 คน)"** พร้อม
  ข้อความ "ยังไม่มีพนักงานในระบบ — เพิ่มพนักงานได้ที่หน้า /expenses ก่อน" · `/expenses` แสดง
  **"พนักงาน 0 ท่าน" · "บันทึกค่าใช้จ่าย 0 รายการ"** — ยืนยันว่าช่องโหว่ leak เลขบัตร/บัญชีของ
  เชียง/มิ้ว/เจ ปิดสนิทแล้วจริง ไม่ใช่แค่ในทางทฤษฎี

ลบบัญชีทดสอบทั้งสองชุด + tenant ปลอมทิ้งหมดแล้วหลังตรวจเสร็จ — **ตอนนี้พร้อมสร้าง tenant LUXSU
จริงแล้ว**

## ✅ ทดสอบ tenant boundary กับ production จริงแล้ว (2026-09-16) — ด่านสุดท้ายก่อนเปิดสาขาที่ 2 ผ่าน

หลัง migration 0028–0032 (schema + super_admin + RLS enforcement) และการแก้ 10 ไฟล์ server action
ที่ใช้ `service_role` ให้กรอง `tenant_id` เองแล้ว ยังไม่เคยพิสูจน์กับ production จริงเลยสักครั้ง
(มีแต่ PGlite จำลอง) — ตอนนี้ทดสอบแล้วด้วย **`npm run test:multi-tenant`**
(`scripts/test-multi-tenant.mjs`) ซึ่งสร้าง tenant ปลอม + บัญชี admin จริง 2 บัญชี (คนละ tenant)
บน production จริง ล็อกอินจริงผ่าน `signInWithPassword`, ยิง query จริงข้าม tenant, แล้วลบทิ้งหมด

**ผลผ่านครบทุกข้อ:** admin ของแต่ละ tenant มองไม่เห็นข้อมูล (`sc_sales`/`sc_opex`/`items`/
`profiles`) ของอีก tenant เลย, ยังเห็นข้อมูลจริงของตัวเองได้ปกติ (ไม่ได้บล็อกเกินจริง), insert
ข้าม tenant ถูก RLS ปฏิเสธจริง (`new row violates row-level security policy`), และ cleanup ลบ
ทุกอย่างสะอาด (tenant ทดสอบ + บัญชี Auth ทั้งสอง + profiles + ข้อมูลทดสอบทุกตาราง)

**ข้อควรระวังเวลาเขียนเทสต์แบบนี้ (เจอบั๊กในตัวเทสต์เอง ไม่ใช่บั๊กจริง):** ข้อมูลทดสอบที่ seed ไว้
ให้ tenant ของตัวเอง (เช่น 1 แถว `sc_sales` ของ T2) จะทำให้เช็ค "ต้องเห็น 0 แถว" ผิดเสมอ เพราะ
tenant นั้น**ควร**เห็นข้อมูลของตัวเอง 1 แถว — ต้องเช็คว่า `tenant_id` ของทุกแถวที่มองเห็นเป็นของ
ตัวเองเท่านั้น ไม่ใช่เช็คจำนวนแถวเป็น 0 เจอจากรันจริงครั้งแรกที่ทดสอบนี้ขึ้นว่า "T2 เห็นข้อมูลของ
T1 รั่ว! T2 เห็น 1 แถว" ซึ่งพอไล่ดูแล้วเป็นแถวทดสอบของ T2 เองที่ seed ไว้ตอนต้น ไม่ใช่ช่องโหว่จริง

**ข้อมูลทดสอบ insert ผ่าน `service_role` เท่านั้น ไม่ผ่าน session ของบัญชีทดสอบ** — กันไม่ให้
trigger เขียน `inv_audit_logs`/`sc_audit_logs` ผูก `performed_by` กับบัญชีทดสอบ (เหมือนที่เคยเกิด
กับบัญชี `rlsverify35...` ที่ลบไม่ได้ติด FK ถาวร) บัญชีทดสอบใช้แค่อ่าน (SELECT) ผ่าน session จริง
เท่านั้น จึงลบตัวเองทิ้งได้สะอาดทุกครั้ง — เช่นเดียวกับหลักการที่ `test:staff` ใช้อยู่แล้ว

**`npm run test:multi-tenant` ไม่อยู่ใน CI** (แตะ production จริง) — รันเองทุกครั้งที่แก้ RLS/
tenant filtering หรือก่อนเชิญนิติบุคคลที่สองเข้าระบบจริง เหมือน `test:staff`

**⬜ ยังเหลือก่อนเชิญนิติบุคคลที่สองเข้าระบบได้จริง:** โมดูล `ext_*` (บิล/ภาษี — `/invoicing`,
`/tax-filing`) ยังไม่มีคอลัมน์ `tenant_id` เลย (ดูคำเตือนบนหัวไฟล์ `smartacc-documents.ts`/
`smartacc-expenses.ts`) และ Telegram bot token (`integration_secrets`) ยังเป็นค่าเดียวใช้ร่วมกัน
ทุก tenant — ทั้งสองจุดนี้ **ห้ามเปิดให้ tenant ที่สองใช้** จนกว่าจะเพิ่ม `tenant_id` ให้ครบก่อน

## 🔴🔴🔴 [ปิดฉุกเฉินแล้ว] เปิด Exposed schemas ให้ extension_layer แล้วเจอช่องโหว่ทันที (2026-09-17)

**เจ้าของกด Save เพิ่ม `extension_layer` เข้า Exposed schemas ตามที่แนะนำในหัวข้อถัดไปแล้ว** —
พอเช็คซ้ำทันทีพบว่า GRANT เดิมของ `0009_smartacc_extension_layer.sql`
(`GRANT SELECT ... TO anon` + `GRANT ALL ... TO authenticated` ทั้ง 17 ตาราง) **ที่ไม่เคยมีผล
อะไรเลยมาตลอดเพราะ REST เข้า schema นี้ไม่ถึง** กลับมามีผลจริงทันทีที่ schema ถูก expose — และ
**ไม่มี RLS มากันเลยสักตาราง** (`relrowsecurity = false` ทุกตาราง ตรวจกับ production จริง)

**ผลกระทบจริง:** ตารางว่างทั้งหมด (0 แถวทุกตัว) ฝั่งอ่านจึงยังไม่รั่วข้อมูลจริง แต่
**พนักงานคนไหนก็ได้ที่ล็อกอินอยู่ (`authenticated` ไม่แยก role) ยิง REST ตรงไปที่ตารางกลุ่มนี้แล้ว
INSERT/UPDATE/DELETE/TRUNCATE ได้เลย ข้าม `requireModuleWrite()` ของแอปทั้งหมด** — เจอและปิด
ภายในไม่กี่นาทีหลังเปิด ไม่มีหลักฐานว่าถูกใช้ก่อนที่จะปิด

**ปิดด้วย `0035_extension_layer_lockdown.sql`** — เปิด RLS ทุกตารางแบบ **0 policy = deny-all**
สำหรับ `authenticated` (รูปแบบเดียวกับ `inv_integration_secrets` ที่ 0033 พิสูจน์แล้วว่าใช้ได้จริง
เพราะแอปเข้าตารางกลุ่มนี้ผ่าน `createAdminClient()`/service_role เท่านั้น ไม่มีจุดไหนใช้ session
ผู้ใช้ตรงๆ เลย — grep ยืนยันแล้ว) + `revoke all ... from anon` ทุกตาราง (เหมือน 0016)

**ยืนยันด้วยการยิง REST จริง 3 แบบ:** `anon` SELECT → 401 permission denied ·
`authenticated` (login จริง มี session จริง) SELECT แถวที่มีอยู่จริง → เห็น 0 แถว (RLS บล็อกจริง
ไม่ใช่ตารางว่างจริง) · `authenticated` INSERT → 403 row-level security policy · `service_role`
ยังอ่าน/เขียนได้ปกติ (แอปไม่พัง)

**⚠️ บทเรียนสำคัญที่สุดของช่วงนี้:** GRANT ที่ดูเหมือน "ไม่มีผลเพราะเข้าไม่ถึงอยู่แล้ว" ไม่ใช่
GRANT ที่ปลอดภัย — มันแค่รอทางเข้าใหม่โผล่มาเท่านั้น ตรงกับสิ่งที่ 0016 เคยสอนไว้กับ SECURITY
DEFINER View ในฝั่ง public schema ทุกประการ **ทุกครั้งที่เปิด schema ใหม่ให้ PostgREST เข้าถึงได้
(Exposed schemas) ต้องเช็ค RLS + GRANT ของทุกตารางในนั้นทันทีก่อนอื่นใด ไม่ใช่แค่เช็คว่าแอปใช้
งานได้** — เฟสถัดไป (เพิ่ม `tenant_id` ให้ตารางที่แอปใช้จริง) ยังต้องทำต่อ แต่ตอนนี้ปลอดภัยจาก
การเข้าถึงจากภายนอกแล้วระหว่างที่ยังทำไม่เสร็จ

## ✅🔴🔴 [แก้ครบแล้ว] โมดูล SmartAcc (`ext_*`) ใช้งานกับ production จริงไม่ได้เลย ตั้งแต่สร้างขึ้นมา (พบ+ปิด 2026-09-17)

**ไม่เกี่ยวกับ multi-tenant — เป็นบั๊กพื้นฐานที่ทำให้ `/invoicing`, `/tax-filing`, `/billing-notes`,
`/expenses-ocr` ใช้งานไม่ได้เลยสักครั้งเดียว ไม่ว่า tenant ไหนก็ตาม:**

PostgREST (ชั้น REST API ของ Supabase) ตั้งค่า **Exposed schemas** ไว้แค่ `public, graphql_public`
— schema `extension_layer` (ที่เก็บตาราง `ext_*` ทั้ง 13 ตัวจาก `0009_smartacc_extension_layer.sql`)
ไม่เคยถูกเพิ่มเข้ารายการนี้เลย ⇒ ทุกครั้งที่แอปเรียก `.schema("extension_layer")` (ทั้งใน
`smartacc-documents.ts`, `smartacc-expenses.ts`, `billing-notes/page.tsx`) จะพังด้วย
`PGRST106: Invalid schema` **ไม่ว่าจะใช้ credential ไหนก็ตาม รวมถึง service_role**

**ยืนยันด้วยการ query production จริงแบบอ่านอย่างเดียว (ไม่ใช่แค่เดาจากโค้ด):** `ext_documents`,
`ext_contacts`, `ext_staged_expenses`, `ext_wht_records` มี **0 แถวทุกตัว ตั้งแต่สร้างมา** — ไม่เคยมี
ใบแจ้งหนี้/เอกสารภาษี/ใบเสร็จ OCR ถูกบันทึกสำเร็จแม้แต่ครั้งเดียว

**วิธีแก้ต้องกดที่ Supabase Dashboard เท่านั้น (ทำผ่าน SQL/API ไม่ได้ — ไม่ใช่ค่าระดับ role/GUC
ของฐานข้อมูล ตรวจแล้วว่า `authenticator` role ไม่มี `pgrst.db_schemas` ตั้งไว้เลย เป็น config
ของ platform ล้วนๆ):** Dashboard → Settings → API → **Data API Settings** → ช่อง
**"Exposed schemas"** → เพิ่ม `extension_layer` เข้าไปในรายการที่มี `public, graphql_public` อยู่แล้ว

**✅ [2026-09-17] เจ้าของกด Save เพิ่ม `extension_layer` เข้า Exposed schemas แล้ว** — ดูหัวข้อ
"ปิดฉุกเฉินแล้ว" ด้านล่างสำหรับช่องโหว่ที่เจอทันทีหลังเปิด (RLS ไม่มีเลยสักตาราง) และหัวข้อ
"เพิ่ม tenant_id ให้ ext_*" สำหรับงานที่ทำต่อจนจบ — `/invoicing`, `/tax-filing`,
`/billing-notes`, `/expenses-ocr` ใช้งานได้จริงแล้ว (พิสูจน์ด้วยการเขียนจริงผ่าน
`npm run test:multi-tenant` ส่วน [8] — insert เข้า `ext_documents` สำเร็จเป็นครั้งแรกในประวัติ
ของตารางนี้)

## ✅ เพิ่ม tenant_id ให้ ext_* ที่แอปใช้จริงแล้ว + แก้บั๊กเลขที่เอกสารชนกันข้าม tenant (2026-09-17)

**`0036_ext_tenant_id.sql`** — เพิ่ม `tenant_id` ให้ 6 ตารางที่แอปใช้งานจริง (ตรวจด้วย grep
`.from("ext_` ทั่ว `app/` ก่อนเขียน — อีก 11 ตารางใน `extension_layer` ยังไม่มีโค้ดแอปแตะเลย
สักจุด จึงยังไม่ใส่ tenant_id ให้ตามหลัก "ไม่เพิ่ม abstraction เกินกว่าที่ต้องใช้จริง"):
`ext_contacts`, `ext_documents`, `ext_document_items`, `ext_billing_references`,
`ext_staged_expenses`, `ext_numbering_sequences`

**🔴 เจอบั๊กจริงระหว่างตรวจ constraint ก่อนเขียน migration:** `ext_documents.doc_number` และ
`ext_numbering_sequences (doc_type, prefix, year_month)` เป็น **UNIQUE เดี่ยวทั้งระบบ** — ถ้าไม่
แก้ สอง tenant จะ**ชนเลขที่เอกสารกันจริง** (ตัวนับใช้รูปแบบวันที่+เลขรันจึงมีโอกาสชนสูงมาก ไม่ใช่
edge case หายาก) และตัวนับจะสานต่อกันข้าม tenant (tenant 2 ออกใบแรกได้เลข 0048 ต่อจาก tenant 1
แทนที่จะเป็น 0001) แก้เป็น `UNIQUE (tenant_id, doc_number)` และ
`UNIQUE (tenant_id, doc_type, prefix, year_month)` ตามลำดับ — เหมือนบั๊กเดียวกับที่ 0032 เจอกับ
`sc_settings.key`

**`fn_generate_document_number()` เปลี่ยน signature เป็น 4 พารามิเตอร์** (เพิ่ม `p_tenant_id`)
— ฟังก์ชันนี้เรียกผ่าน `service_role` (ไม่มี session ผู้ใช้ให้ derive tenant จาก `auth.uid()`
ได้) จึงต้องรับ tenant_id ตรงๆ เหมือนที่ `lib/tenant.ts` ทำกับไฟล์ server action อื่นทั้ง 10 ไฟล์
ที่แก้ไปก่อนหน้านี้ในเซสชันนี้ — `lib/smartacc/numbering.ts`
(`generateDocumentNumber(docType, tenantId, date)`) และจุดเรียกเดียวใน
`smartacc-documents.ts` แก้ตามแล้ว

**RLS แทนที่ deny-all ฉุกเฉินของ 0035 ด้วย policy ที่กรอง tenant จริง** — นิยาม role ตรงกับ
`lib/permissions.ts`: `ext_contacts`/`ext_documents`/`ext_document_items`/
`ext_billing_references`/`ext_numbering_sequences` (โมดูล `invoicing`) = admin/co-admin เท่านั้น
· `ext_staged_expenses` (โมดูล `expenses`) = staff อ่านได้ แต่เขียนได้แค่ admin/co-admin ·
`super_admin` ข้ามได้ทุกจุด (ผ่าน `inv_fn_current_role()`/`fn_current_tenant()` ตัวเดียวกับที่
0031/0033 ใช้ทั้งระบบแล้ว ไม่สร้างฟังก์ชันซ้ำ)

**ทดสอบผ่าน PGlite ครบ (`test-migration-0036.mjs`)** ครอบคลุม: tenant_id ครบ 6 ตาราง,
doc_number ไม่ชนข้าม tenant, ตัวนับแยกต่อ tenant จริง (สอง tenant ได้เลข 0001 เหมือนกันไม่สานต่อ),
RLS กรอง tenant ถูกต้องทั้ง admin/staff/super_admin, rollback สะอาด

**ยืนยันกับ production จริงด้วย `npm run test:multi-tenant` ส่วน [8]** — เรียก
`fn_generate_document_number()` จริงผ่าน session ของ admin คนละ tenant (ยืนยันเลขไม่สานต่อกัน),
insert เข้า `ext_documents` จริงเป็นครั้งแรกในประวัติของตารางนี้ (0 แถวมาตลอดตามที่บันทึกไว้ข้างบน),
พิสูจน์ว่า T2 อ่านเอกสารของ T1 โดยรู้ `id` ตรงๆ ไม่ได้เลย — รันซ้ำ 2 รอบติดกันพิสูจน์ idempotent
+ cleanup สะอาด (ตาราง `ext_documents`/`ext_document_items`/`ext_billing_references`/
`ext_numbering_sequences` ไม่มี trigger เขียน audit log เลย ตรวจกับ production แล้ว — บัญชี
ทดสอบที่ใช้ในส่วนนี้จึงลบทิ้งได้สะอาดปกติ ไม่ติด FK แบบบัญชี fixture ของส่วน [7] Telegram)

**app code ที่แก้ครบ:** `smartacc-documents.ts` (`lookupDbdCompany`, `fetchSmartAccDocuments`,
`createSmartAccDocument`, `convertDocument`, `fetchPendingDeliveryOrders`, `fetchTaxFilingData` —
รวมตาราง `expenses` ที่ query คู่กันใน `fetchTaxFilingData` ด้วย), `smartacc-expenses.ts`
(`parseAndStageReceiptOcr`, `approveStagedExpense`, `fetchStagedExpenses`),
`lib/smartacc/numbering.ts`, `app/(app)/billing-notes/page.tsx`

## ✅ Telegram bot token ต่อ tenant แล้ว + เจอ/ปิดช่องโหว่ FK เดิมที่กว้างกว่าที่คิด (2026-09-17)

**สิ่งที่ตั้งใจทำ:** `0033_integration_secrets_per_tenant.sql` — เปลี่ยน `inv_integration_secrets`
จาก PK `(key)` เดี่ยว (token เดียวใช้ร่วมกันทุก tenant) เป็น PK `(tenant_id, key)` composite
(เหมือน 0032 ที่ทำกับ `sc_settings` ไปแล้ว) พร้อมแก้ `inv_fn_set_integration_secret()`/
`inv_fn_integration_secret_status()`/`fn_integration_secret_status()` ให้กรอง/เขียนตาม
`fn_current_tenant()` ของผู้เรียกเสมอ **เจอบั๊กจริงเพิ่มระหว่างแก้ (ไม่เคยมีการเช็คสิทธิ์เลย):**
`fn_integration_secret_status` (alias ไร้ prefix ที่หน้า `/settings`/`/admin/settings` เรียกจริง)
**ไม่เช็ค role อะไรเลย** ⇒ staff คนไหนก็เรียก RPC นี้ตรงๆ แล้วเห็น 4 ตัวท้ายของ bot token ได้มาตลอด
(ไม่ใช่ค่าเต็ม แต่ก็ไม่ควรเห็นเลยตามกฎข้อ 9) — เพิ่มเช็คสิทธิ์ให้ตรงกับ `inv_fn_` เวอร์ชันแล้ว

**🔴 เจอปัญหาใหญ่กว่าตอนทดสอบเขียนจริงกับ production (`npm run test:multi-tenant` ส่วน [7]):**
สร้างบัญชี admin ทดสอบใหม่ (จำลอง "แอดมินคนแรกของ tenant ที่สอง") แล้วเรียก
`inv_fn_set_integration_secret()` ชนทันที — **ไม่ใช่บั๊กของ 0033 เอง** แต่เป็นเพราะ
`inv_integration_secrets.updated_by` ยังมี FK เก่าชี้ไป **`sc_users(user_id)`** (ตาราง deprecated
ตามกฎ "profiles คือตารางเดียวที่ใช้ตัดสินสิทธิ์" — ดูหัวข้อ `npm run test:staff` ด้านล่าง) บัญชี
ทดสอบใหม่ไม่มีแถวใน `sc_users` เลย (เหมือนทุกบัญชีที่เชิญเข้าระบบตั้งแต่ `0023` เป็นต้นมา — ไม่มีใคร
เขียน `sc_users` อีกแล้ว) ⇒ insert ชน FK ทันที

**ไล่ตรวจต่อพบว่า FK แบบเดียวกันกว้างกว่าที่คิดมาก — มีอีก 3 จุดชี้ไป `sc_users` เหมือนกัน:**
`inv_audit_logs.performed_by`, `inv_stock_transactions.performed_by`/`approved_by`,
`ui_permissions.updated_by` **⇒ บัญชีใดก็ตามที่ไม่มีแถวใน `sc_users` (คือทุกบัญชีเชิญใหม่ตั้งแต่
`0023`) รับ-เบิก-ปรับสต๊อกไม่ได้เลยสักครั้ง ทันทีที่ DB trigger (`inv_fn_write_audit_log`) พยายาม
เขียน audit log แล้วชน FK นี้** — ยังไม่เคยมีใครเจอเพราะปัจจุบันมีแค่ 2 บัญชีจริง (`admin`, `milo`)
และทั้งคู่เป็นบัญชีเก่าที่มีแถวใน `sc_users` อยู่แล้ว **แต่จะระเบิดทันทีที่เชิญพนักงาน/แอดมินคนใหม่
คนแรก ไม่ว่าจะเป็นของ tenant 1 เพิ่มคน หรือ tenant 2 ทั้งหมด** — เจอเพราะทดสอบด้วยบัญชีทดสอบใหม่
จริงๆ เท่านั้น ไม่มีทางเจอถ้าทดสอบด้วยบัญชี `admin`/`milo` เดิม (ตรงกับบทเรียนเดิมของ
`npm run test:staff` ที่เจอบั๊กคลาสเดียวกันมาก่อน)

**แก้ด้วย `0034_retire_sc_users_fk_dependency.sql`** — ย้าย FK ทั้ง 4 จุดไปชี้ `profiles(id)` แทน
`inv_stock_transactions`/`ui_permissions` ใช้ FK แบบ validate เต็ม (ตรวจแล้ว 0 แถวหลุด) ส่วน
`inv_audit_logs` ต้องใช้ **`NOT VALID`** เพราะมีแถวเก่าจริง 2 แถว (id 354/355 — บัญชีทดสอบ
`rlsverify35...` ที่ไม่เคยมี `profiles` row เลย) ที่ `performed_by` ไม่มีใน `profiles` — ตามกฎข้อ 1
(audit log ห้าม UPDATE/DELETE แม้แต่แถวเก่า) จึงใช้ `NOT VALID` เพื่อไม่ต้องแตะแถวเก่าเลย แต่ยังบังคับ
กับแถวใหม่ที่จะ insert ต่อจากนี้ครบทุกแถว (พิสูจน์แล้วด้วยเทสต์: insert ใหม่ด้วยบัญชี "ผี" ที่ไม่มีทั้งใน
`sc_users` และ `profiles` ยังถูกปฏิเสธอยู่)

**ทดสอบผ่าน PGlite ครบทั้ง 0033 (`test-migration-0033.mjs`) และ 0034 (`test-migration-0034.mjs`)**
รวมเข้า `npm run test:migration` แล้ว — จำลองรูปร่างตารางจริงจาก production ก่อนเขียนไฟล์เสมอ
(`inv_integration_secrets` ไม่เคย track ใน migrations เลยเหมือน `sc_*` ก่อน 0012)

**apply ขึ้น production แล้วผ่าน SSH+psql โดยตรง (ไม่ผ่าน SQL Editor)** — ระหว่างเซสชันนี้ค้นพบว่า
VPS มี `psql` + `SUPABASE_DB_URL` (ตัวเดียวกับที่ `backup-db-to-r2.sh`/`gen-types-via-vps.mjs` ใช้)
เข้าถึงฐานข้อมูล production ได้โดยตรง ⇒ **ตั้งแต่นี้ไป migration SQL ใหม่ apply ผ่าน
`cat migration.sql | ssh ... psql "$SUPABASE_DB_URL"` ได้เลย ไม่ต้องให้เจ้าของ paste ทีละไฟล์ใน
SQL Editor เหมือนที่ 0028–0032 เคยทำ** (ยังคง `npm run gen:types`/verify หลัง apply ทุกครั้งเหมือนเดิม)

**ยืนยันด้วย `npm run test:multi-tenant` ส่วน [7] ผ่านครบกับ production จริง** (รันซ้ำ 2 รอบติดกัน
พิสูจน์ idempotent) — บัญชี admin คนละ tenant ตั้ง/อ่านสถานะ Telegram bot token แยกกันได้จริง,
staff เรียกไม่ได้, super_admin ตั้งเองไม่ได้ (ไม่มี tenant ของตัวเอง)

**⚠️ ข้อจำกัดที่ค้นพบระหว่างเขียนเทสต์ (สำคัญกับเทสต์ที่เขียน RPC มีผลข้างเคียงเป็น audit log
ในอนาคตทุกตัว):** RPC ที่ trigger เขียน audit log (`inv_fn_set_integration_secret` เขียนผ่าน
`inv_trg_audit_integration_secrets`) จะทำให้บัญชีที่เรียก **ลบไม่ได้อีกเลยถาวร** (ติด FK เดียวกับ
`rlsverify35`) — สร้างบัญชีทดสอบใหม่ทุกรอบจึงเป็นขยะสะสมเพิ่มเรื่อยๆ `test-multi-tenant.mjs` จึงใช้
**บัญชี fixture ตายตัวซ้ำทุกรอบ** (`BOT_TEST_TENANT`/`BOT_TEST_USER` ในไฟล์ — รีเซ็ตรหัสผ่านใหม่
ทุกครั้งที่รันแทนสร้างบัญชีใหม่) เฉพาะส่วนที่ต้องเรียก RPC เขียนเท่านั้น ส่วนอื่นของเทสต์ (sections
[1]-[6]) ยังใช้ tenant/บัญชีสุ่มใหม่ทุกรอบแล้วลบทิ้งสะอาดตามเดิมได้ (ไม่ผ่าน RPC ที่เขียน audit)

**Edge Function `inv-low-stock-alert` แก้ให้รู้จัก tenant แล้วเช่นกัน** — ซอร์สไม่เคยอยู่ใน repo นี้
มาก่อน (deploy จากที่อื่นมาก่อน repo จะมี) ดึงเข้ามาครั้งแรกผ่าน `supabase functions download`
(ใช้ Personal Access Token ที่เจ้าของสร้างให้ชั่วคราว) เก็บไว้ที่
`supabase/functions/inv-low-stock-alert/index.ts` แล้ว **แก้จาก "อ่าน bot token ตัวเดียวใช้ร่วมกัน
ทุกสาขา/ทุก tenant" เป็น "โหลด token ของทุก tenant เป็น map แล้วเลือกใช้ตาม tenant_id ของแต่ละ
สาขา"** deploy ขึ้นจริงแล้วผ่าน CLI เดียวกัน **ยืนยันด้วยการยิงเรียกจริง 1 ครั้ง** (ปลอดภัยเพราะ
รายการที่ต่ำกว่าขั้นต่ำอยู่ตอนนี้ถูก mute ไว้หมด — ไม่มีข้อความหลุดเข้ากลุ่มพนักงานจากการทดสอบ):
`{"status":"ok","results":[{"branch":"SneakerCare","sent":0}]}` ตรงกับพฤติกรรมเดิมทุกประการ
**⚠️ ห้ามแก้ `supabase/functions/low-stock-alert/` (ไม่มี prefix `inv-`) แล้วคิดว่ามีผลกับ cron จริง
— คนละไฟล์กัน ตัวนั้นไม่ได้ deploy อยู่ (ดูหัวข้อ "cron สองตัว" ด้านล่าง)**

## ภาพรวมโปรเจกต์

ระบบนี้กำลังทยอยแทนที่ระบบเดิมที่เขียนด้วย Google Apps Script + Google Sheets + HTML ไฟล์เดียว (อยู่ที่ `legacy/`)

**สถานะจริงของ `legacy/` (แก้ให้ตรงความจริง 2026-08-28):** ส่วน**คลังสินค้า**ย้ายมาระบบใหม่แล้ว แต่ส่วน
**การเงิน/ยอดขาย/กำไร/ค่าใช้จ่าย/payroll** (แท็บภาพรวมใน `legacy/sneakercare_dashboard.html`) **ยังใช้งาน
จริงอยู่ทุกวัน** เพราะระบบใหม่ยังไม่มีหน้าพวกนี้ (ดู "งานที่จงใจยังไม่ทำ") ดังนั้น:
- `legacy/sneakercare_dashboard.html` = **production ที่ยังมีชีวิต** แก้ได้เมื่อเจอบั๊กที่กระทบตัวเลขเงิน
  แต่ต้องแก้อย่างระวังและอธิบายเหตุผลไว้ในคอมเมนต์เสมอ
- `legacy/SneakerCare_GAS.js`, `legacy/sneakercare_gas_backend.js` = โค้ดฝั่ง Apps Script ที่ deploy อยู่จริง
  **ห้ามแก้จาก repo นี้** เพราะ repo ไม่ใช่ source of truth ของมัน (ตัวจริงอยู่ในโปรเจกต์ Apps Script)
- เมื่อระบบใหม่มีหน้าการเงินครบแล้ว ค่อยกลับมาปิดสวิตช์ทั้งโฟลเดอร์นี้เป็น "อ้างอิงอย่างเดียว"

⚠️ **ตัวเลขในแท็บภาพรวมของ legacy มี fallback ที่ "เดา" จาก config ปัจจุบัน** เมื่อเดือนที่เลือกยังบันทึก
opex ไม่ครบ (ค่าเช่าห้อง + ประกันสังคม) — ตั้งแต่ 2026-08-28 fallback พวกนี้จะขึ้นแถบเตือน "ประมาณการ"
สีเหลืองใต้การ์ดกำไรสุทธิแล้ว **ห้ามลบแถบเตือนนี้ออก** เคยทำให้ยอดกำไรสุทธิผิดไป 250 บาทโดยไม่มีใครรู้มาแล้ว

อ่านบริบทการตัดสินใจทั้งหมดที่ `docs/architecture.md` ก่อนเริ่มงานทุกครั้งที่ไม่แน่ใจว่า "ทำไมถึงออกแบบแบบนี้"
และดู schema เต็มที่ `docs/database-schema.sql`

## Stack

- Frontend: Next.js (App Router, TypeScript) + Tailwind CSS + shadcn/ui
- Backend/DB: Supabase (PostgreSQL + Auth + Row Level Security + Edge Functions)
- Hosting: **VPS** (PM2 + Nginx + Let's Encrypt, เครื่องเดียวกับเว็บร้านอื่น) + Supabase Cloud — **ไม่ใช้ Vercel**

## Supabase project ที่ใช้งานจริง

- Project `SneakerCareDB` (ref `mdlxogfkpwejnqpzhmoy`) — มีข้อมูลขายจริง (`sc_sales`, `sc_payments`, ...) และตารางคลังสินค้าจริง (`inv_items`, `inv_item_stock`, `inv_stock_transactions`, `inv_branches`, `inv_audit_logs`)
- มี branch แรกในระบบแล้ว: "SneakerCare สาขาหลัก" และมี Admin account เดียว
- **⚠️ ผลการตรวจสอบ schema `inv_` ใน `SneakerCareDB` (2026-08-28):** รัน `inspect-inv-schema.sql` แล้วพบว่า
  (1) `sc_users` มี FK `sc_users_branch_id_fkey` โยงไป `inv_branches(id)`
  (2) มี FK จาก `inv_audit_logs`, `inv_stock_transactions`, `inv_integration_secrets` โยงไป `sc_users(user_id)`
  (3) ตาราง `inv_*` มีข้อมูลจริง (items 46 แถว, stock_transactions 108 แถว, audit_logs 393 แถว)
  **ข้อสรุป: ห้าม DROP ตาราง `inv_*` แบบสุ่มสี่สุ่มห้า หรือ CASCADE เด็ดขาด เพราะจะกระทบ `sc_users`**
- **[แก้ไขความเข้าใจผิด 2026-09-01] มี Supabase โปรเจกต์เดียว ไม่ใช่สองโปรเจกต์อย่างที่เอกสารก่อนหน้าเข้าใจ**
  ยืนยันด้วย `supabase projects list` (CLI login ค้างไว้อยู่แล้ว) — บัญชีนี้เหลือ `SneakerCareDB`
  (`mdlxogfkpwejnqpzhmoy`) โปรเจกต์เดียว `shoe-care-inventory` (`tecrcoienazmtbynuqpg`) ที่เอกสาร
  รุ่นก่อนอ้างถึงไม่มีอยู่แล้ว (DNS resolve ไม่ได้) ทุกอย่าง — แอป, VPS backup, migration ใหม่ — ต้องชี้
  มาที่ `mdlxogfkpwejnqpzhmoy` ที่เดียว ไม่ต้องเช็คสองโปรเจกต์อีกต่อไป
- **[แก้ไขข้อสรุปผิดของตัวเองอีกที 2026-09-01] migration `0002` ในโค้ด repo นี้ไม่ใช่ cron จริงที่ใช้งานอยู่**
  ตรวจ `cron.job` ตรงๆ บนฐานข้อมูลจริงแล้วพบว่า cron job ที่รันจริงชื่อ
  `inv-low-stock-alert-daily-9am-th` (วันละครั้ง 9 โมงเช้าไทย ไม่ใช่ทุก 30 นาทีตามที่เอกสารเก่าเข้าใจ)
  เรียก Edge Function **`inv-low-stock-alert`** (คนละตัวกับ `low-stock-alert` ในโฟลเดอร์
  `supabase/functions/` ของ repo นี้) — ฟังก์ชันนี้ deploy อยู่บน `mdlxogfkpwejnqpzhmoy` ถูกต้อง
  ตั้งแต่ 2026-07-10 แล้ว และ `cron.job_run_details` ยืนยันว่า**รันสำเร็จทุกวันไม่เคยขาด** รวมถึงวันนี้

  **⚠️ [แก้ข้อสรุปที่ยังไม่ครบ 2026-09-06] มี cron **สองตัว** ที่ active ไม่ใช่ตัวเดียว**
  ตรวจ `cron.job` จริงอีกครั้งพบว่านอกจาก `inv-low-stock-alert-daily-9am-th` (jobid 3) ยังมี
  `low-stock-alert-30min` (jobid 4, `*/30 * * * *`, `active = true`) ที่ยิงไปที่ Edge Function
  `low-stock-alert` — ตัวที่ถูกลบออกจากโปรเจกต์ไปเมื่อ 2026-09-01 **จึงได้ HTTP 404 ทุกครั้ง วันละ 48 ครั้ง**
  (`{"code":"NOT_FOUND","message":"Requested function was not found"}` ใน `net._http_response`)
  ที่เอกสารเก่าสรุปว่า "cron ทุก 30 นาทีไม่มีอยู่จริง" **ผิด** — มันมีอยู่จริงและยังทำงานอยู่
  หมายเหตุ: `cron.job_run_details` ขึ้น `succeeded` ก็จริง แต่มันแปลว่า "สั่งยิงสำเร็จ" เท่านั้น
  (pg_net เป็น async) **ต้องดู `net._http_response` เสมอ** จึงจะรู้ว่า HTTP สำเร็จจริงหรือไม่
  **ลบไปแล้ว 2026-09-06** (เจ้าของอนุมัติ) ด้วย `select cron.unschedule('low-stock-alert-30min');`
  เหลือ job เดียวคือ `inv-low-stock-alert-daily-9am-th` และมี `0013_unschedule_dead_low_stock_cron.sql`
  กำกับไว้ให้ repo ตรงกับของจริง
  **กระทบตอน rotate key:** Authorization header ของ cron อ่าน service_role key จาก **Supabase Vault**
  (`vault.decrypted_secrets` ชื่อ `inv_service_role_key`) — ถ้า rotate key แล้วไม่อัปเดต Vault
  ด้วย แจ้งเตือนสต๊อกต่ำจะหยุดทำงานเงียบๆ โดยไม่มีใครรู้
  — **ไม่เคยมี outage จริง** สิ่งที่เข้าใจผิดคือ `inv_notification_log` ไม่มีแถวใหม่ตั้งแต่ 2026-08-27
  เพราะ 4 รายการที่ต่ำกว่าขั้นต่ำอยู่ตอนนี้ถูกตั้ง `alert_muted = true` ไว้ (ของปกติ ไม่ใช่บั๊ก) ฟังก์ชัน
  `inv-low-stock-alert` เช็คแฟล็กนี้ถูกต้องจึงไม่ส่ง ส่วน `low-stock-alert` (ซอร์สใน repo นี้) **ไม่เช็ค
  `alert_muted` เลย** — ได้ลบ Edge Function `low-stock-alert` ที่เผลอ deploy ทับไปแล้วออกจากโปรเจกต์
  (ไม่เคยถูก cron เรียกใช้ก็จริง แต่ทิ้งไว้จะสับสนกับตัวจริงในอนาคต) และไม่ได้แก้ pg_cron ใดๆ เพราะของเดิม
  ถูกต้องอยู่แล้ว **ผลข้างเคียงที่เกิดขึ้นจริง:** ตอนทดสอบด้วยมือ ฟังก์ชัน `low-stock-alert` ที่ deploy ผิด
  ส่งข้อความ Telegram แจ้ง 4 รายการที่ถูก mute ไว้เข้ากลุ่มพนักงานไปจริง 1 ครั้ง (ข้อความเดียว ไม่ใช่การ
  แจ้งซ้ำต่อเนื่อง) — ถ้าเป็นปัญหาให้แจ้งพนักงานว่าเป็นข้อความทดสอบที่คลาดเคลื่อน
  **ซอร์สของ `inv-low-stock-alert` ไม่ได้อยู่ใน repo นี้** (deploy จากที่อื่นมาก่อน repo นี้จะมีอยู่)
  ถ้าจะแก้ต่อต้อง `supabase functions download inv-low-stock-alert --project-ref mdlxogfkpwejnqpzhmoy`
  มาดูก่อน — ห้ามแก้ `supabase/functions/low-stock-alert/` ของ repo นี้แล้วคิดว่าจะมีผลกับ cron จริง

## กฎทางธุรกิจที่ต้องไม่ละเมิด (Non-negotiable business rules)

1. **`audit_logs` / `inv_audit_logs` ห้ามมี UPDATE/DELETE จากโค้ดแอปเด็ดขาด แม้แต่ endpoint ที่ role เป็น admin**
   การเขียน log เกิดจาก DB trigger เท่านั้น (`fn_write_audit_log`) — อย่าสร้าง API route หรือ Supabase RPC
   ที่ไปแก้ไขตาราง `audit_logs` ตรงๆ ไม่ว่ากรณีใด

   **⚠️ สำคัญ (2026-09-01): ในฐานข้อมูลจริง `audit_logs` ไม่ใช่ตาราง แต่เป็น VIEW ที่ชี้ไป
   `inv_audit_logs`** (สร้างโดย `scripts/apply-aliases-and-unified-schema.sql`) ระบบจึงมี audit **สองสาย**
   ที่แยกกันโดยเจตนา ห้ามรวมเข้าด้วยกัน:
   - `audit_logs` → `inv_audit_logs` : ledger ของ**คลังสินค้า** เขียนโดย DB trigger เท่านั้น
   - `sc_audit_logs` : audit ระดับ**แอปฝั่งการเงิน/ยอดขาย/เงินเดือน** เขียนผ่าน `lib/audit.ts`
     (service_role) เพราะเหตุการณ์อย่าง "แอดมินลบยอดขายรายวัน" ไม่มี trigger รองรับ
     ตารางนี้ append-only เหมือนกัน มี trigger กัน UPDATE/DELETE/TRUNCATE ไว้ที่ระดับ DB
     (migration `0011`) และมี `npm run test:migration` พิสูจน์ว่ากันได้จริง
2. **`stock_transactions` / `inv_stock_transactions` เป็น append-only ledger** ห้าม UPDATE/DELETE แถวเดิมเพื่อ "แก้ตัวเลขที่พิมพ์ผิด"
   ให้สร้างแถวใหม่ที่อ้าง `corrects_txn_id` แทนเสมอ ยอดคงเหลือ (`item_stock.current_qty` — แยกต่อสาขา ไม่ใช่
   คอลัมน์ใน `items`) เป็นแค่ cache ที่มาจากผลรวมของ ledger — ห้ามให้ UI ไปแก้ `item_stock` ตรงๆ
3. **Adjustment (ปรับปรุงสต๊อกจากตรวจนับ) ที่สร้างโดย Co-Admin ต้องมีสถานะ `pending_approval` เสมอ**
   และมีผลกับยอดคงเหลือก็ต่อเมื่อ Admin เรียก `fn_approve_adjustment()` แล้วเท่านั้น — ห้าม bypass logic นี้
   ที่ชั้น frontend
4. **RBAC ต้องบังคับที่ RLS policy ของ Postgres เป็นด่านหลัก** อย่าเขียน authorization logic เฉพาะที่
   frontend/React component แล้วปล่อยให้ Supabase table เปิดกว้าง — ทุก policy ใหม่ต้องผ่าน `fn_current_role()`
5. **Staff ต้องไม่เห็นข้อมูลต้นทุน/COGS เด็ดขาด** — แอปต้อง query view ที่ตัดคอลัมน์ต้นทุน
   ห้าม SELECT จากตาราง `item_stock` / `stock_transactions` ตรงๆ
6. **ต้นทุนใช้วิธีถัวเฉลี่ยเคลื่อนที่ (moving average)** คำนวณผ่าน DB trigger เท่านั้น อย่าคำนวณต้นทุนซ้ำในโค้ด frontend
7. **สิ้นเปลืองตัดสต๊อกเป็นหน่วยฐาน (`base_unit`) เสมอ** เช่น ml/g ไม่ใช่หน่วยซื้อ (`purchase_unit`)
   ฟอร์มเบิกใช้งานต้องแปลงหน่วยก่อนส่ง qty เข้า `quantity_delta`
8. **แจ้งเตือนสต๊อกต่ำใช้ Telegram Bot API** (ตัดสินใจแล้ว — ไม่ใช่ LINE) ส่งเข้า**กลุ่มพนักงาน** ผ่าน `branches.telegram_chat_id` ต่อสาขา
9. **Bot Token ตั้งค่าผ่านหน้าเว็บ Settings (เห็นเฉพาะ Admin) ไม่ใช่ Supabase Secret/env var** — เขียนได้
   ทางเดียวผ่าน RPC `fn_set_integration_secret()` เท่านั้น **ห้ามสร้าง endpoint/query ที่ SELECT ค่าจริงจาก
   `integration_secrets` กลับไปแสดงใน UI เด็ดขาด แม้แต่ให้ Admin ดู**
10. **`items` (แคตตาล็อกกลาง) กับ `item_stock` (ยอดคงเหลือ/ต้นทุน/min stock ต่อสาขา) เป็นคนละตาราง**
    อย่ารวมยอดคงเหลือกลับเข้า `items` — เขียน query/RPC ใหม่ทุกครั้งให้ join ผ่าน `(item_id, branch_id)` เสมอ
11. **`profiles.branch_id`**: role `admin` ปล่อย null ได้ (เห็นทุกสาขา), role `co_admin`/`staff` ต้องมีค่าเสมอ
    ทุก query/RLS ใหม่ที่เกี่ยวกับสต๊อกต้อง filter ด้วย `fn_current_branch()`
12. **Admin เลือกสาขาทำงานผ่านคุกกี้ `sc_active_branch`** (ดู `lib/branch.ts`) — ค่าว่าง = ดูรวมทุกสาขา
    ได้เฉพาะหน้าอ่าน (แดชบอร์ด/รายงาน/ประวัติ) การเบิก-รับ-ปรับ-ของเสียต้องเลือกสาขาให้ชัดก่อน
13. **เชิญผู้ใช้ทำได้ทางหน้า `/admin/users` เท่านั้น** ใช้ `SUPABASE_SERVICE_ROLE_KEY` ฝั่งเซิร์ฟเวอร์
    (`lib/supabase/admin.ts`) — ห้าม import ไฟล์นี้จาก Client Component และห้ามใส่ prefix `NEXT_PUBLIC_`

## โครงสร้างโฟลเดอร์

```
/app                      Next.js pages: dashboard, stock-in, stock-out, history, adjustments, reports, admin
/app/actions              Server Actions (stock, users, settings, auth, branch)
/app/(app)/reports/export CSV download route (บังคับสิทธิ์เดียวกับหน้า /reports)
/components               shared UI components (shadcn/ui) + pagination.tsx
/lib/permissions.ts       แผนที่สิทธิ์มองเห็น vs กรอก/แก้ไข ต่อเมนู (ต้องสอดคล้อง RLS)
/lib/pagination.ts        ตัวช่วยแบ่งหน้า (pure — มีเทสต์)
/lib/reports-range.ts     ตรรกะช่วงเดือน + CSV (pure ไม่มี server-only — มีเทสต์)
/lib/reports.ts           query ของหน้ารายงาน (server-only)
/lib/supabase             browser client / server client / admin (service_role) client
/lib/audit.ts             logAudit() → เขียนลง sc_audit_logs เท่านั้น (ห้ามเขียนลง audit_logs ดูกฎข้อ 1)
/scripts                  เครื่องมือ: deploy-vps.mjs, backup-db-to-r2.sh, verify-backup.sh,
                          export-monthly-csv.mjs, backup-monthly-csv.sh, inspect-inv-schema.sql, test-*.mjs
/supabase/migrations      SQL migrations (เริ่มจาก 0001_init.sql — ห้ามแก้ไฟล์ที่ apply แล้ว)
/supabase/functions       Edge Functions เช่น low-stock-alert (รันตาม cron)
/supabase/tests/database  pgTAP tests (รันด้วย supabase test db)
/.github/workflows/ci.yml CI: lint, typecheck, test:legacy, test:reports, build, pgTAP
/legacy                   ระบบเดิม — ⚠️ หน้าการเงินยังเป็น production ที่ใช้จริง (ดูหัวข้อภาพรวม)
/deploy                   ไฟล์คอนฟิก Deploy (Nginx reverse proxy template)
docs/architecture.md      เหตุผลการออกแบบทั้งหมด
docs/database-schema.sql  schema เริ่มต้น (ดู migrations สำหรับของที่เพิ่มทีหลัง)
HANDOFF.md                งานค้าง + คำสั่งสำหรับ agent ตัวถัดไป
CLAUDE.md                 คู่มือนี้ — อัปเดตทุกครั้งที่จบงานใหญ่
```

## แนวทางการเขียนโค้ด

- ทุกการเขียน/แก้ข้อมูลสต๊อกต้องผ่าน Supabase RPC หรือ insert ปกติที่ trigger ดักไว้แล้ว
- ทุก query ที่ดึงสต๊อก/รายการเบิกจ่ายต้อง filter ด้วย `branch_id` ของผู้ใช้ปัจจุบันเสมอ
- ฟอร์มเบิก-จ่าย (`Stock In / Stock Out`) ต้องเรียบง่ายพอให้พนักงานหน้าร้านกรอกได้ไว
- Migration SQL ใหม่ให้ใส่ใน `/supabase/migrations` เป็นไฟล์แยกตามลำดับเวลา ห้ามแก้ไฟล์ migration เก่าที่ apply ไปแล้ว
- เขียน RLS policy ใหม่ทุกครั้งที่เพิ่มตาราง

## สถาปัตยกรรม SmartAcc Enterprise Cloud & Extension Layer (อัปเดต 2026-08-30)

ระบบได้เพิ่มโมดูลการเงิน บัญชี และออกเอกสารภาษีมาตรฐานสากล โดยยึดหลัก **Zero Core Mutation** (ไม่แตะต้องหรือล็อกตารางคลังสินค้า/ยอดขายเดิม):

1. **Schema แยกอิสระ `extension_layer`:**
   - รวม 13 ตารางสำหรับระบบบิล, บัญชีแยกประเภท (Chart of Accounts), การตรวจสลิป, ภ.พ.30, ภ.ง.ด.3/53, และ e-Tax XML มาตรฐาน ขมธอ. 3-2560
   - Composite Performance Indexes: `idx_ext_documents_type_status_date`, `idx_ext_document_items_doc_id`, `idx_ext_contacts_tax_name`, `idx_ext_staged_expenses_approval`, `idx_ext_slip_trans_ref`
2. **Standard Document Numbering & Flow:**
   - รันเลขอัตโนมัติแบบ Atomic ผ่านฟังก์ชัน Postgres `fn_generate_document_number` รูปแบบ `PREFIX-YYYYMMDD-XXXX`
   - คำนำหน้าเอกสารมาตรฐาน: `QA` (ใบเสนอราคา), `DO` (ใบส่งของ), `INV` (ใบแจ้งหนี้), `BL` (ใบวางบิล), `REC` (ใบเสร็จรับเงิน), `TAX` (ใบกำกับภาษี)
   - Flow การแปลงเอกสาร 1-Click Conversion: `QA ➔ DO/INV ➔ BL ➔ REC/TAX`
3. **Shop Branding & Tax Profile (`sc_settings`):**
   - จัดการโลโก้ร้าน, ชื่อบริษัทนิติบุคคล, ที่อยู่จดทะเบียน, เลขผู้เสียภาษี 13 หลัก, และ PromptPay ID ได้ที่หน้า `/settings`
   - เชื่อมโยงหัวบิล A4 (`/billing-notes`) และ Dynamic PromptPay QR ทันทีแบบ Real-time
4. **ค้นหาลูกค้าที่เคยบันทึกไว้ (ไม่ใช่ DBD จริง — แก้คำอธิบายผิด 2026-09-02):**
   - หน้า `/invoicing` มีช่องค้นหาเลขผู้เสียภาษี 13 หลัก/ชื่อบริษัท แต่ **ไม่ได้เชื่อมต่อกับฐานข้อมูล
     กรมพัฒนาธุรกิจการค้า (DBD) จริง** — `lookupDbdCompany()` (`app/actions/smartacc-documents.ts`)
     ค้นแค่ (ก) ลูกค้าที่เคยออกเอกสารด้วยกันมาก่อน (`ext_contacts`) และ (ข) รายชื่อบริษัทตัวอย่าง
     ~11 รายที่ hardcode ไว้ในโค้ด (PTT, CP All, AIS, Shopee ฯลฯ) บวกกับสิ่งที่เคย "จำ" ไว้ผ่าน
     `dbd_company_registry` ใน `sc_settings` — ทุกครั้งที่ออกเอกสารใหม่ให้ลูกค้ารายไหน ระบบจะบันทึก
     ข้อมูลนั้นเก็บไว้อัตโนมัติให้ค้นเจอครั้งถัดไป (คล้ายสมุดที่อยู่ ไม่ใช่ API ค้นหาแบบ real-time)
     ลูกค้าจริงที่ไม่เคยออกเอกสารมาก่อนจะ "ไม่พบ" เสมอ ต้องกรอกเองครั้งแรก
   - ถ้าต้องการเชื่อมต่อ DBD/กรมสรรพากรจริง ต้องสมัคร API key จากหน่วยงานนั้นก่อน (DBD DataWarehouse+
     หรือ RD e-Filing API) แล้วค่อยสร้าง integration ใหม่ — ยังไม่มีในระบบตอนนี้
5. **Anti-Fraud & Expense Quarantine:**
   - ดักจับสลิปซ้ำผ่าน `bank_trans_ref` (TransRef Deduplication)
   - สแกนใบเสร็จ OCR ผ่านกล่องกักตรวจ `ext_staged_expenses` ก่อนตัดยอดบัญชีจริง

## คำสั่งที่ใช้บ่อย

- `npm run dev` — รัน Next.js dev server (บังคับ `--webpack` ไว้ใน package.json แล้ว)
- `npm run build` — production build (บังคับ `--webpack` เช่นกัน)
- `npm run typecheck` — `tsc --noEmit` ใช้เช็คเร็วๆ ระหว่าง dev
- `npm run test:legacy` — ตรวจแถบเตือน "ประมาณการ" ในหน้าภาพรวมของ legacy
- `npm run test:reports` — ตรวจตรรกะช่วงเดือน/CSV/เลขหน้า (46 ข้อ)
- `npm run deploy` — คำสั่ง Deploy ไปยัง VPS (`157.85.108.84`) อัตโนมัติในคลิกเดียว
- `bash scripts/backup-db-to-r2.sh` — สำรอง DB แบบ `pg_dump` แล้วอัปโหลดไป Cloudflare R2 พร้อมลบไฟล์เก่าเกิน 90 วัน
- `bash scripts/verify-backup.sh [--deep]` — ตรวจว่าไฟล์สำรองล่าสุดกู้คืนได้จริง
- `npm run test:migration` — รัน migration 0011 ใส่ Postgres จริง (PGlite/WASM ไม่ต้องมี Docker)
  พิสูจน์ว่า SQL รันได้ รันซ้ำได้ และ `sc_audit_logs` แก้/ลบ/TRUNCATE ไม่ได้จริง
- `npm run export:csv [-- --month=2026-08]` — ส่งออกข้อมูลรายเดือนเป็น CSV (มี BOM เปิด Excel ภาษาไทยได้)
- `npm run test:reconcile` — ยืนยันว่ากำไรรายเดือนบน production ยังตรงกับ Excel ที่กระทบยอดไว้ (7 เดือน)
- `npm run check:expense-mirror` — เทียบ `sc_opex` กับ `sc_expense_entries` ทีละแถวระหว่างช่วงเขียนสองที่
- `npm run check:payroll-mirror` — เทียบเงินเดือน/ห้องเช่าระหว่าง `sc_opex` กับ `sc_payslips`/`sc_rental_records`
- `npm run check:money` — ตรวจว่าไม่มี "ตัวเลขที่ไม่ใช่เงิน" (เช่น timestamp) หลุดเข้าคอลัมน์เงิน
- `npm run test:guards` — **ทุก Server Action ต้องมีการ์ดสิทธิ์ที่แรงกว่า `requireProfile()`** (อยู่ใน CI)
- `npm run gen:types` — regenerate `database.types.ts` จาก production ผ่าน VPS (รันทุกครั้งที่เพิ่มตาราง/คอลัมน์)
- `npm run check:stock-vs-expenses` — ตรวจว่าเดือนไหน "ซื้อของเข้าคลัง" กับ "ค่าใช้จ่าย" บันทึกไม่ครบทั้งสองฝั่ง
- `bash scripts/backup-monthly-csv.sh` — ตัวห่อสำหรับ cron: ส่งออก CSV เดือนที่แล้ว → tar.gz → Cloudflare R2

**⚠️ ห้ามลบ flag `--webpack` ออกจาก script `dev`/`build`**: จำเป็นสำหรับการ build บน network drive / UNC path

## สิ่งที่ตัดสินใจแล้ว

- **Hosting = VPS ไม่ใช่ Vercel** — PM2 + Nginx บนเครื่อง `157.85.108.84` (พอร์ต 3003)
- **ฟอนต์แยกกัน 2 ตัวโดยตั้งใจ (2026-09-08) — หน้าจอกับกระดาษไม่เหมือนกัน**
  | ที่ไหน | ฟอนต์ | ตัวแปร |
  |---|---|---|
  | หน้าเว็บทั้งเว็บ | **Prompt** | `--font-prompt` → `--font-sans`/`--font-heading` |
  | **เอกสารที่พิมพ์ออกกระดาษ** (สลิปเงินเดือน · ใบกำกับภาษี · หนังสือรับรองหัก ณ ที่จ่าย · ใบวางบิล · ตารางงาน · รายงาน) | **IBM Plex Sans Thai** (ของเดิม) | `--font-ibm-plex` ใน `@media print` |

  เหตุผลที่ไม่เปลี่ยนฟอนต์เอกสารตาม: เอกสารพวกนี้ออกไปหาพนักงาน/ลูกค้า/สรรพากรมาตลอด
  ถ้าเปลี่ยนหน้าตาจะดูเหมือนเป็นเอกสารคนละชุดกับที่เคยส่งไปก่อนหน้า
  **⚠️ `ibmPlexSansThai` ใน `app/layout.tsx` ไม่ได้ถูกใช้บนจอเลย จึงดูเหมือนโค้ดตาย — ห้ามลบ**
  มันคือฟอนต์ของกระดาษทุกใบที่ร้านออก
  **⚠️ ต้องบังคับ `font-family` ที่ลูกทุกตัวด้วย** (`.printable-area *`, `#print-portal-root *`)
  ไม่ใช่ตั้งที่ `body` อย่างเดียว — element ที่ติดคลาส `font-sans` ของ Tailwind ประกาศฟอนต์
  ของตัวเอง ซึ่งชนะการสืบทอดจาก body เสมอ (specificity ชนะ inheritance) ไม่งั้นจะมี Prompt ปนมาบางบรรทัด
  **⚠️ ทั้งสองตัวไม่ใช่ variable font** ต้องระบุ `weight` ให้ครบ (300–700) ถ้าขาดตัวไหน
  เบราว์เซอร์จะปลอมน้ำหนักให้เอง (synthetic bold) แล้วตัวอักษรไทยจะดูเละ
- **Default Theme = Light Mode** สบายตา เหมาะกับการทำงานบัญชีและหน้าร้าน
- **ช่องทางแจ้งเตือนสต๊อกต่ำ = Telegram Bot API ส่งเข้ากลุ่มพนักงาน**
- **สาขา:** schema รองรับหลายสาขาไว้แล้วตั้งแต่ต้น
- **Admin เลือกสาขาจาก dropdown ใน header** (คุกกี้ `sc_active_branch`)
- **สำรองข้อมูลนอก Supabase ไปที่ Cloudflare R2 ทุกวัน + Retention 90 วัน** (อัปเดต 2026-08-28)
  ใช้ `pg_dump` รันผ่าน cron บน VPS ตี 3 ทุกคืน (`scripts/backup-db-to-r2.sh`) อัปโหลดไป Cloudflare R2 (`ddservicedb`)
  พร้อมลบไฟล์เก่าเกิน 90 วันทั้งบน VPS และ R2 อัตโนมัติ ตามด้วย `verify-backup.sh` ตรวจสอบความสมบูรณ์และส่ง Heartbeat เข้า Telegram

## 🗓️ ตารางกะการทำงานพนักงาน & เวลาเปิดร้าน 09:00 - 20:00 น. (อัปเดต 2026-09-10)

ระบบจัดตารางการทำงานของพนักงาน (`/roster`) ได้รับการปรับปรุงเพื่อรองรับเวลาเปิดร้านจริง 09:00 – 20:00 น. และให้ใช้งานง่ายที่สุด:
1. **เวลามาตรฐานของกะ (Preset):**
   - **กะเช้า:** `08:30 – 17:30 น.` (เตรียมเปิดร้าน 09:00 น.)
   - **กะสาย / ปิดร้าน:** `11:30 – 20:30 น.` (ปิดร้าน 20:00 น. + เคลียร์ยอด/เก็บร้าน 30 นาที)
   - มี Preset อื่นให้สลับได้ (`ตรงเวลา 09:00-18:00 / 11:00-20:00`, `กะเดิม`) หรือกด `⚙️ กำหนดเวลาเอง`
2. **Interactive 1-Click Day Switcher:**
   - คลิกที่วันใดก็ได้บนปฏิทิน จะมี Modal เปิดขึ้นมาพร้อมปุ่มเปลี่ยนกะรายคน (☀️ เช้า, 🌙 สาย, ❌ วันหยุด) แตะสลับได้ใน 1 วินาที
   - ระบบบันทึกลง `localStorage` (`sc_roster_custom_shifts`) อัตโนมัติ พร้อมแสดงป้าย `✏️ ปรับแล้ว`
   - คำนวณจำนวนวันทำงานและประมาณการค่าจ้าง (เช่น พนักงานรายวัน เจ 350฿/วัน) ใหม่อัตโนมัติแบบ Real-time
   - การ Export ออก Excel และโหมดพิมพ์ใบตารางงาน (Print A4) จะดึงเวลากะและการปรับเปลี่ยนรายวันไปออกรายงานทันที

## 🪟 Modal ที่สูงกว่าจอ: ปุ่มหลุดจอจนกดอะไรไม่ได้ (แก้จริงรอบ 2 — 2026-09-16)

ผู้ใช้รายงานว่าที่ `/expenses` กด "พิมพ์สลิป" แล้ว **ไม่เห็นทั้งปุ่มพิมพ์และปุ่มปิด ทำอะไรไม่ได้เลย**
— เป็นบั๊กเดิมที่เคยบันทึกไว้ว่า "แก้แล้วด้วย `overflow-y-auto`" เมื่อ 2026-09-02 ซึ่ง **แก้ไม่ตรงจุด**

**สาเหตุจริง (กับดักคลาสสิกของ flexbox):** backdrop เป็น
`flex items-center justify-center ... overflow-y-auto` — เมื่อเนื้อหาสูงกว่า viewport
`align-items: center` จะดัน**ขอบบน**ของกล่องให้ล้นออกไปเป็นค่าติดลบ และ `scrollTop` ติดลบไม่ได้
⇒ **ส่วนที่ล้นด้านบนเลื่อนไปดูไม่ได้ตลอดกาล** การเติม `overflow-y-auto` จึงช่วยได้แค่ฝั่งล่าง
เท่านั้น ส่วนแถบเครื่องมือ (ปุ่มพิมพ์ + ปุ่มปิด) ที่อยู่บนสุดหายไปเลย — เห็นชัดที่สุดบนมือถือ

**วิธีแก้ที่ถูกต้อง (ใช้กับ modal ใหม่ทุกตัว ห้ามกลับไปใช้ `items-center` เดี่ยวๆ):**
- backdrop: `flex items-start justify-center overflow-y-auto`
- กล่องเนื้อหาข้างใน: `my-auto`
  → ตามสเปก flexbox `margin:auto` จะดูดพื้นที่ว่างเฉพาะตอนเป็นบวก **ถ้าพื้นที่ว่างติดลบจะถูกตีเป็น 0**
  ⇒ เนื้อหาสั้นยังอยู่กลางจอเหมือนเดิม เนื้อหายาวจะชิดบนและเลื่อนดูได้ครบทุกส่วน

แก้ให้ครบทั้ง **11 modal** ที่ใช้รูปแบบเดิม (`/expenses` 4 · `/inventory` 2 · `/roster` 2 ·
`/invoicing` · `/tax-filing` · `/pos/daily-entry`) — 5 ตัวในนั้นเดิม **ไม่มี `overflow-y-auto` เลย**
จึงติดกับดักเดียวกันรออยู่

**เพิ่มเติมเฉพาะ modal สลิปเงินเดือน (จุดที่ผู้ใช้เจอ):**
- แถบเครื่องมือเป็น `sticky top-0` ⇒ ปุ่มพิมพ์/ปุ่มปิด **ติดขอบบนเสมอ** ไม่ว่าสลิปจะยาวแค่ไหน
- บนมือถือ: padding `p-4 sm:p-8` · แถบเครื่องมือ `flex-wrap` · ย่อข้อความปุ่มเป็น "พิมพ์ A4"
  และหัวข้อเป็น "สลิปเงินเดือน" (ข้อความไทยไม่มีช่องว่างจึงมี min-content กว้างมาก
  พอรวมกับ `p-8` แล้วดันปุ่มหลุดออกนอกจอแนวนอนบนจอ ~390px)

**ไม่กระทบการพิมพ์:** เส้นทางพิมพ์ยังเป็น `print:static` + `#print-portal-root` เหมือนเดิม
(ดูหัวข้อ PrintModalPortal) แถบเครื่องมือมี `print:hidden` อยู่แล้ว

**เก็บระหว่างทาง:** `npm run lint` **แดงอยู่ 1 error** ตั้งแต่คอมมิต `c928383` (ฟีเจอร์ตารางกะ)
— `roster-client.tsx` เรียก `setCustomDayOverrides()` ตรงๆ ใน `useEffect` (`react-hooks/set-state-in-effect`)
⇒ **CI แดงมาตั้งแต่ตอนนั้น** ปิดด้วย `eslint-disable-next-line` พร้อมเหตุผล: `localStorage` อ่านตอน render
ไม่ได้ (ไม่มีบนเซิร์ฟเวอร์ตอน SSR + ทำให้ hydration ไม่ตรงกัน) การอ่านหลัง mount จึงถูกต้องแล้ว
และรันครั้งเดียว ไม่ใช่ cascading render ที่ rule นี้ตั้งใจกัน

## 🏢 หลายนิติบุคคลบนฐานข้อมูลเดียว (multi-tenant) — เฟส 1 เขียนแล้ว ยังไม่ apply (2026-09-16)

เจ้าของจะเปิดให้ธุรกิจอื่น (สปากระเป๋า/สปารองเท้า — **คนละนิติบุคคล ไม่แชร์ลูกค้ากัน**) ใช้ระบบ
ร่วมกัน โดยห้ามเห็นข้อมูลข้ามกันเด็ดขาด แม้แต่ role `admin` ของอีกฝั่ง

**⚠️ เหตุผลที่ใช้ `branch_id` เดิมกันไม่ได้:** `role='admin'` + `branch_id=null` แปลว่า
"เห็นทุกสาขา" อยู่แล้วโดยตั้งใจ (กฎข้อ 11/12) ถ้าใช้ branch_id เป็นเส้นแบ่งนิติบุคคล เจ้าของ
ธุรกิจแรก (admin) จะยังเห็นข้อมูลธุรกิจสองอยู่ดี — ตรงข้ามกับที่ต้องการ จึงต้องมี `tenant_id`
เป็นเส้นแบ่งใหม่ที่แยกชั้นจาก `branch_id` เสมอ (**ไม่มีใคร tenant_id เป็น null ได้ แม้แต่ admin**)
`branch_id` ยังใช้แยก "สาขาภายในนิติบุคคลเดียวกัน" ตามเดิม

**เลือกสถาปัตยกรรมแบบฐานข้อมูลเดียว + `tenant_id`** (ไม่ใช่แยก deployment/Supabase project
คนละชุด) — เจ้าของยืนยันแล้ว 2026-09-16 (ทางเลือกอื่นที่เสนอไปคือแยก deployment ซึ่งกันข้อมูล
รั่วได้แน่นอนกว่าแต่ต้องดูแล 2 ชุดขนานกันตลอดไป)

### สถานะ: เฟส 1 (โครงพื้นฐาน) — `0028_tenants_foundation.sql`
เขียนและทดสอบผ่าน PGlite แล้ว (`npm run test:migration` รวม `test-migration-0028.mjs`)
**ยังไม่ได้ apply ขึ้น production** — ปลอดภัยที่จะรันได้ทันทีเพราะเป็นแค่โครงเพิ่มเข้ามา
ไม่กระทบพฤติกรรมเดิมเลยแม้แต่นิดเดียว (ไม่มี RLS policy ไหนอ้างถึง `tenant_id` จนกว่าจะถึงเฟส 2):

- สร้างตาราง `tenants` + backfill ธุรกิจเดิมเป็น tenant #1
  (`00000000-0000-0000-0000-000000000001` — UUID คงที่ตั้งใจ ไม่ใช่สุ่ม เพื่อให้ migration
  รันซ้ำได้แบบ idempotent และเฟสถัดไปอ้างอิงได้แน่นอน)
- เพิ่มคอลัมน์ `tenant_id` (NOT NULL, FK → tenants, DEFAULT = tenant #1) ให้ทุกตารางธุรกิจ
  (~24 ตาราง: profiles, items/branches/suppliers/item_stock/stock_transactions/
  integration_secrets/notification_log/audit_logs ฝั่งคลัง + sc_sales/sc_opex/sc_payments/
  sc_employees/sc_expenses/... ฝั่งการเงิน + customers/services/service_orders ฝั่ง POS)
  DEFAULT ทำให้ insert เดิมที่ไม่รู้จัก tenant_id เลยยังทำงานได้ปกติทุกจุด **ไม่ต้องแก้โค้ดแอป**
- สร้าง `fn_current_tenant()` ไว้เฉยๆ (ยังไม่มี policy เรียกใช้)
- **จงใจไม่แตะ:** `sc_expense_categories` (enum กลาง ใช้ร่วมกันได้ทุกธุรกิจ), `app_settings`
  (ตารางตาย ไม่มีใครใช้), `sc_users` (deprecated ตาม 0023), โมดูล `ext_*` (SmartAcc บิล/ภาษี
  17 ตาราง — เลื่อนไปก่อนเพราะธุรกิจใหม่ยังไม่ต้องใช้ใบกำกับภาษีวันแรก **ต้องกลับมาทำก่อนเปิด
  `/invoicing` หรือ `/tax-filing` ให้ tenant ที่สอง**)

**⚠️ บทเรียนจากการเทสต์ (สำคัญกับ view alias ทุกตัวในระบบ ไม่ใช่แค่ migration นี้):**
`create view v as select * from t` ขยาย `*` เป็น **รายชื่อคอลัมน์ตายตัวตอน CREATE VIEW**
ไม่ใช่ query สดทุกครั้งที่เรียก — เติมคอลัมน์ใหม่ที่ตารางจริงแล้ว view ที่ alias ไว้
(`items`, `branches`, `item_stock`, `stock_transactions`, `audit_logs`, `suppliers`,
`integration_secrets`) **ไม่เห็นคอลัมน์ใหม่เองจนกว่าจะ `create or replace view` ซ้ำ**
0028 จัดการเรื่องนี้ให้อัตโนมัติแล้ว **และต้องตั้ง `security_invoker = on` ซ้ำทุกครั้งหลัง
`create or replace view` เสมอ** — พิสูจน์ด้วยเทสต์แล้วว่า Postgres รีเซ็ต reloptions
(รวม security_invoker) ทิ้งทุกครั้งที่ replace view ถ้าลืมจุดนี้คือเปิดช่องโหว่ SECURITY
DEFINER View ที่ 0016 เพิ่งปิดไปกลับมาทันทีแบบเงียบๆ

### role `super_admin` — โครงพื้นฐานเขียนแล้ว (`0029`+`0030`) ยังไม่ apply เช่นกัน
เจ้าของถามเพิ่ม 2026-09-16: "กำหนด user ที่ login เข้าไปเห็นแค่สาขาตัวเอง และถ้าเป็น super
admin เห็นทุกสาขา ได้ไหม" — คำตอบคือได้ แต่ **`admin` เดิมทำแบบนั้นไม่ได้** เพราะ
`role='admin'` + `branch_id=null` ถูกออกแบบไว้แล้วว่า "เห็นทุกสาขา**ภายใน tenant ตัวเอง**
เท่านั้น" (ดูหัวข้อบนสุด) จึงต้องเป็น role ใหม่แยกต่างหากที่ข้ามเส้น tenant ได้ ไม่ใช่ทำให้
`admin` เดิมพฤติกรรมเปลี่ยน

- `0029_super_admin_role.sql` — เพิ่มค่า `'super_admin'` ให้ role
- `0030_super_admin_constraints.sql` — อนุญาตให้ `super_admin` ไม่ต้องมี `branch_id`/`tenant_id`
- **⚠️ ต้อง apply สองไฟล์นี้แยกกันคนละครั้งเสมอ** (Postgres ห้ามใช้ค่า enum ใหม่ในทรานแซกชัน
  เดียวกับที่เพิ่งเพิ่มมัน — ปนกันจะได้ error "unsafe use of new value" ทันที พิสูจน์ด้วยเทสต์แล้ว)
  รัน `0029` → กด Run → รัน `0030` → กด Run คนละรอบใน SQL Editor

**🔴 [แก้ตัวเอง 2026-09-16 — เจ้าของรันจริงแล้ว error] รอบแรกเขียน 0029 ผิด** เชื่อว่า
`profiles.role` บน production เป็น `user_role` enum ตาม `0001_init.sql` แล้วสั่ง
`alter type public.user_role add value ...` ตรงๆ — เจ้าของรันแล้วได้
`ERROR: 42704: type "public.user_role" does not exist` ทันที **ตรวจกับ production จริงผ่าน
`pg_get_constraintdef` แล้วพบว่า `profiles.role` เป็น `text` ธรรมดา + CHECK constraint
(`profiles_role_check`) มาตั้งแต่ต้น ตรงกับที่ `0022_allow_staff_role.sql` เคยบันทึกไว้แล้ว**
— นี่คือ prod/local divergence แบบเดียวกับที่ `0012` เจอกับตาราง `inv_*` พอดี ลืมเช็คซ้ำ
ทั้งที่มีบทเรียนอยู่แล้วในไฟล์เดียวกันของ repo

**พบเพิ่มระหว่างแก้:** `chk_branch_required_for_non_admin` (constraint ของ branch_id ตาม
`0001_init.sql`) **ก็ไม่เคยมีอยู่บน production เลยเช่นกัน** (ยิง
`select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.profiles'::regclass`
กับของจริงแล้วเห็นแค่ 5 constraint: `profiles_id_fkey`, `profiles_pkey`, `profiles_role_check`,
`profiles_tenant_id_fkey`, `profiles_username_key`) — 0030 จึงไม่ใช่แค่ "ผ่อนคลาย constraint
เดิม" แต่เป็นการ**เพิ่ม constraint บังคับใหม่ที่ไม่เคยมีมาก่อน** ตรวจข้อมูลจริงก่อน apply แล้ว
(`select id, username, role, branch_id, tenant_id from profiles`) — มีแค่ 2 บัญชี (`admin`,
`milo`) role `admin` ทั้งคู่ และมี `branch_id` ตั้งไว้แล้วทั้งคู่ ⇒ ปลอดภัย 100% ที่จะเพิ่ม

**แก้แล้ว:** ทั้ง 0029 และ 0030 ตรวจก่อนเสมอว่ากำลังอยู่ในโลกไหน (`pg_type` มี `user_role`
เป็น enum จริงไหม / `profiles_role_check` มีอยู่จริงไหม) แล้วเลือกเส้นทางให้ถูก —
ใช้ได้ทั้ง production จริงและ local/CI (enum) โดยไม่ต้องรู้ล่วงหน้าว่ากำลังรันบนอันไหน
ทดสอบผ่าน PGlite แล้วทั้งสองโลกพร้อมกัน (`test-migration-0029.mjs` จำลอง "โลก A: enum"
กับ "โลก B: text+CHECK แบบ production จริง" แยกกันในทุกเคส) — idempotent ทั้งคู่, constraint
ทำงานถูกทั้งสองทิศ, rollback สะอาด

**บทเรียน:** เทสต์ที่จำลองแค่สภาพแวดล้อมเดียว (ตอนนั้นจำลองแค่ enum) ผ่านหมดทุกข้อ แต่จับบั๊ก
จริงไม่ได้เลยเพราะ production ไม่ใช่โลกที่จำลองไว้ — **ทุก migration ที่แตะ `profiles.role`
หรือตารางที่เคยมีประวัติ prod/local แยกทาง (`items`/`branches`/ฯลฯ ดู 0012) ต้องเทสต์ทั้งสอง
รูปแบบเสมอ ไม่ใช่แค่รูปแบบที่ `0001_init.sql` นิยามไว้**
- **แก้ชั้นแอป (TypeScript) ให้รู้จัก `super_admin` แล้ว** เพราะไม่งั้น `requireProfile()`
  จะเดา role แปลกๆ ที่ไม่รู้จักเป็น "staff" เงียบๆ (บั๊กคลาสเดียวกับ `sc_users`→`profiles`
  ที่เจอกับ staff ไม่ได้ branch_id เมื่อก่อน): `lib/auth.ts` (`Profile.role`,
  `requireProfile()`, `requireAdmin()`), `lib/permissions.ts` (`canView`/`canWrite`/
  `visibleModulesFor`/`mainNavItemsFor`/`canSeeCost`/`canManageUsers`/`canEditMinStock`/
  `canRecordWaste` ผ่านหมดสำหรับ super_admin), `lib/supabase/database.types.ts`
  (`UserRole` — เขียนมือได้ตามที่ไฟล์กำกับไว้ ไม่ใช่ auto-generated)
  **ตั้งใจไม่ใส่ `super_admin` ใน `ROLES`** (array ที่ dropdown เชิญผู้ใช้ที่ `/admin/users`
  ใช้) — ไม่งั้น admin ของ tenant ไหนก็สร้างบัญชีข้าม tenant ให้ตัวเองได้ ต้องสร้าง
  super_admin นอกช่องทางแอปเท่านั้น (ตรงๆ ผ่าน SQL โดยผู้ดูแลแพลตฟอร์ม)
- **⚠️ ที่แก้ไปคือชั้น UI เท่านั้น (เมนู/ปุ่มไม่ถูกซ่อนจาก super_admin) — DB (RLS) ยังไม่รู้จัก
  `super_admin` เป็นพิเศษเลยจนกว่าจะถึงเฟส 2** จุดที่ยังต้องแก้ (พบระหว่างไล่ grep แล้ว
  จดไว้กันหลุด — รวมเป็นชุดเดียวกับ ~30 จุดที่เช็ค `fn_current_role() = 'admin'` ฝั่ง DB):
  `app/(app)/adjustments/page.tsx`, `app/(app)/layout.tsx` (branch picker),
  `app/actions/stock.ts` (auto-approve adjustment), `app/actions/users.ts` (สร้างผู้ใช้/
  ป้องกันลดสิทธิ์ตัวเอง), `lib/branch.ts` (`getSelectedBranchId`/`assertWritableBranch`)
  **ห้ามสร้างบัญชี `super_admin` จริงแล้วคาดหวังว่าจะข้าม tenant ได้ก่อนจุดพวกนี้จะแก้ครบ**
  — ตอนนี้จะพฤติกรรมเหมือน staff ที่ทำอะไรไม่ได้เลยในหลายจุด (fail-closed ปลอดภัย แต่ใช้งานไม่ได้)

### เฟส 2 (บังคับใช้จริงด้วย RLS) — ✅ apply แล้ว 2026-09-16 ยืนยันครบ 54/54 policy
`0031_tenant_rls_enforcement.sql` — แก้ RLS ทุกตารางธุรกิจ (54 policy จาก 28 ตาราง — ตรวจกับ
`pg_policies` ของ production จริงก่อนเขียนทุกตัว ไม่เดาจากไฟล์ migration เก่า บทเรียนจาก
0029/0030 ที่เดาผิดสองรอบ) ให้ AND ด้วยเงื่อนไข tenant ก่อนเช็คอย่างอื่นเสมอ

**🔴 เจอบั๊กจริงจากการเทสต์ (ก่อนแตะ production): สูตรแรกทำให้ super_admin เห็น 0 แถวใน
ตารางที่มีเงื่อนไข role อยู่แล้ว** (sc_opex, sc_employees, sc_payslips, ฯลฯ) เพราะเขียนเป็น
`(tenant OR super_admin) AND (role_check เดิม)` — super_admin ผ่านครึ่งแรกได้ แต่ role_check
เดิม (`= any(['admin','co-admin'])`) ไม่รู้จัก 'super_admin' เลยตกครึ่งหลัง แก้เป็น
`(role_fn() = 'super_admin') OR (tenant_id = fn_current_tenant() AND role_check เดิม)` แทน

**ทดสอบผ่าน PGlite ครบ 8 หมวด** จำลอง 2 tenant + super_admin จริง ยิง query "ในฐานะ"
แต่ละคนผ่าน `set role authenticated` + `auth.uid()` จำลอง (⚠️ เจอกับดักระหว่างเขียนเทสต์เอง:
PGlite/Postgres ให้ table owner bypass RLS โดยอัตโนมัติ ถ้าเทสต์ไม่ `SET ROLE authenticated`
ออกจาก role ที่สร้างตาราง RLS จะดูเหมือนไม่ทำงานเลยทั้งที่ policy ถูกต้อง — ต้องมี GRANT
ให้ authenticated ด้วย ไม่ใช่แค่ policy) ตรวจครบ: admin คนละ tenant มองไม่เห็นกัน,
super_admin เห็นทั้งสองฝั่ง, **`profiles` (เส้นทาง login) ปลอดภัย — ทุกคนอ่านแถวตัวเองได้เสมอ
ไม่ล็อกตัวเองออก**, insert ข้าม tenant ถูกปฏิเสธจริง, rollback คืนสภาพเดิมได้

**พบเพิ่มระหว่างเขียนเทสต์:** `sc_settings.key` เป็น PRIMARY KEY เดี่ยว ไม่ใช่ composite
`(tenant_id, key)` ⇒ **สอง tenant ยังมี key ชื่อ 'name' ซ้ำกันไม่ได้จริงๆ แม้จะมี tenant_id
คนละอันแล้วก็ตาม** — RLS filter ได้ถูกต้อง แต่ schema ยังไม่พร้อมให้ 2 tenant ใช้ sc_settings
พร้อมกันจริง ต้องแก้ PK เป็น composite ก่อน (งานเฟส 3 เพิ่มเติมจากที่บันทึกไว้แล้ว)

**✅ apply แล้ว ยืนยันด้วย query ที่ไม่ขึ้นกับการตัดข้อความของ SQL Editor** (`ilike '%super_admin%'`
+ `ilike '%fn_current_tenant%'` กับทุก policy — ครบ 54/54 `true/true`) **เจอปัญหาระหว่างทาง:
apply รอบแรกของ `profiles_update` ตกหล่น 1 เงื่อนไขไปเงียบๆ แม้จะรันไฟล์เดิมซ้ำอีกรอบก็ยัง
ไม่ติด** (สาเหตุไม่ทราบแน่ชัด — สงสัยว่า paste ไฟล์ยาวบางทีตกหล่นบางส่วน) ต้องแก้ด้วย snippet
สั้นแยกต่างหากถึงจะติด **บทเรียน: อย่าเชื่อว่า "รันไฟล์เดิมซ้ำ" จะได้ผลเหมือนเดิมเสมอ — verify
ด้วย query ที่ไม่ขึ้นกับการแสดงผลทุกครั้งหลัง apply policy ที่มีความเสี่ยงสูง (โดยเฉพาะ
`profiles`) และอย่าเชื่อ raw text ที่ SQL Editor แสดง (ตัดข้อความแบบไม่มี "..." บอก)

- **ตารางที่ *ไม่* แตะใน 0031 (เหตุผลเดียวกับ 0028):** `sc_users` (deprecated),
  `sc_expense_categories` (enum กลาง), `ui_permissions` (แสดงผลอย่างเดียว), `ext_*` (ยังไม่มี
  tenant_id เลย)
### ✅ ชั้นแอป — กรอง tenant_id เองในทุกไฟล์ที่ใช้ service_role (เสร็จแล้ว 2026-09-16)

**[ตรวจแล้ว] trigger เซ็ต tenant_id อัตโนมัติตอน insert แทน DEFAULT ตายตัว ทำไม่ได้ตามแผนเดิม**
เพราะ 10 ใน 15 ไฟล์ server action ใช้ `createAdminClient()` (service_role) ซึ่ง **bypass RLS
ทั้งหมดและไม่มี session ผู้ใช้เลย** (`auth.uid()` เป็น null เสมอ) trigger ที่อิง
`fn_current_tenant()` จึงไม่ทำงานกับ insert พวกนี้ — RLS (0031) ป้องกันได้แค่ query ที่ผ่าน
session ของผู้ใช้เอง (~5 ไฟล์ที่ใช้ `lib/supabase/server.ts`) เท่านั้น

**แก้โดยเพิ่ม `lib/tenant.ts`** (`tenantFilter(profile)` คืน tenant_id หรือ `null` สำหรับ
super_admin เท่านั้น · `requireTenantId(profile)` throw ถ้าไม่มี tenant ให้ใช้) แล้วไล่แก้
**ครบทั้ง 10 ไฟล์** ที่ใช้ service_role ให้กรอง `.eq("tenant_id", ...)` ทุก read/update/delete
และใส่ `tenant_id` ในทุก insert — มิเรอร์วิธีที่ `branch_id` ถูกจัดการอยู่แล้วทุกที่ในระบบ
(`analytics.ts`, `daily-sales.ts`, `expenses.ts`, `import-export.ts`, `inventory.ts`,
`shop-settings.ts`, `users.ts` ครบ · `smartacc-documents.ts`/`smartacc-expenses.ts` ครบเฉพาะ
ส่วนที่แตะ `sc_settings` — ส่วน `ext_*` ยังเลื่อนไว้ตาม 0028 มีคอมเมนต์กำกับชัดเจนในไฟล์)

**เจอบั๊กจริงระหว่างแก้ (ไม่ใช่แค่ "ลืมกรอง" — เป็นบั๊กที่ต่างกัน):**
- `inviteUser()` (`users.ts`) ไม่เคยระบุ `tenant_id` ตอนสร้างโปรไฟล์ใหม่เลย ⇒ ถ้าไม่แก้ ทุกคน
  ที่ถูกเชิญเข้าระบบ (ไม่ว่า admin ของ tenant ไหนกดเชิญ) จะตกไปอยู่ tenant #1 เสมอ ตาม DEFAULT
  ของ 0028 — ไม่ใช่ tenant ของ admin ที่เชิญ
- `sendPasswordReset()`/`deleteUser()` ใช้ user id ตรงๆ ผ่าน admin client โดยไม่เช็ค tenant
  เลย ⇒ admin ของ tenant ไหนก็ส่งอีเมลรีเซ็ตรหัส/ลบผู้ใช้ของอีก tenant ได้ถ้ารู้/เดา user id —
  เพิ่มเช็ค `profiles.tenant_id` ตรงก่อนดำเนินการทั้งคู่แล้ว
- `updateUser()` ใช้ session client (RLS ป้องกันข้าม tenant อยู่แล้วจริง) แต่ RLS ที่ไม่แมตช์
  แถวไหนเลยไม่คืน error — แค่ affected rows = 0 เงียบๆ (รูปแบบ silent-failure เดียวกับที่เจอ
  ซ้ำๆ ในโปรเจกต์นี้) เพิ่ม `.select()` แล้วเช็คว่ามีแถวจริงกลับมา ไม่งั้นรายงาน error แทนที่จะ
  บอกว่า "บันทึกสำเร็จ" ทั้งที่ไม่ได้แก้อะไรเลย
- `lib/expense-mirror.ts` (`mirrorExpenseEntry`/`mirrorPayslip`) ก็ใช้ service_role ภายใน —
  เพิ่ม `tenantId` เป็น field บังคับใน input type ทั้งสองฟังก์ชัน แล้วอัปเดตทุกจุดที่เรียก
  **หมายเหตุ:** `sc_payslips` upsert ยัง `onConflict: "month,employee_name"` เฉยๆ (ไม่มี
  tenant_id ในคีย์) — ยังไม่แก้เพราะตารางนี้ไม่มีหน้าไหนอ่านเลยตอนนี้ (dead write path) แต่ต้อง
  แก้ก่อนจะเปิดใช้จริงในอนาคต (มีคอมเมนต์กำกับไว้ในโค้ดแล้ว)

**ยังไม่ทำ:** ขึ้น production เอง — ต้อง `npm run typecheck`/`test:migration` ผ่านครบ + apply
migration `0032` (sc_settings composite key) ก่อน แล้วค่อย commit/push/deploy
- **ห้ามเชิญผู้ใช้ tenant ที่สองเข้าระบบก่อนงานชุดนี้ deploy ขึ้น production + ทดสอบกับบัญชีจริงเสร็จเด็ดขาด**
- **เฟส 3 (ขึ้นระบบจริง):** เจ้าของยืนยัน 2026-09-16 ว่าทั้งข้อมูลบริษัท (ชื่อ/เลขผู้เสียภาษี/
  ที่อยู่/PromptPay), Telegram bot token, และแคตตาล็อกสินค้า/บริการ **ให้เป็นช่องกรอกเองทั้งหมด
  ผ่าน UI ไม่ hardcode/ไม่ seed ข้อมูลจาก tenant เดิมให้** — งานที่ต้องทำ:
  - **[ตรวจแล้ว 2026-09-16 — จุดสำคัญที่สุดของเฟส 3] `fetchShopProfile()`
    (`app/actions/shop-settings.ts`) query ตาราง `sc_settings` ทั้งตาราง แบบไม่กรอง
    `tenant_id` เลย** แม้ 0028 จะเพิ่มคอลัมน์ `tenant_id` ให้ `sc_settings` ไปแล้ว โค้ดแอปยัง
    ไม่ได้แก้ให้ใช้ ⇒ **ต่อให้เฟส 1/2 เสร็จสมบูรณ์ tenant ที่สองจะยังอ่าน/เขียนทับข้อมูลบริษัท
    ของ tenant เดิมได้อยู่ดีผ่านหน้า `/settings` ปกติ** (ไม่ใช่แค่กรณี fallback พลาดแบบ 2 ข้อ
    ถัดไป) — **ต้องแก้ก่อนเปิดให้ tenant ที่สองเข้าหน้า `/settings` เด็ดขาด** ไม่งั้นชื่อ/เลขผู้เสีย
    ภาษี/PromptPay ของทั้งสองธุรกิจจะไปกองอยู่ใน `sc_settings.key` เดียวกันทับกันไปมา
  - แยก `integration_secrets`/`inv_integration_secrets` (Telegram bot token) ให้กรอกแยกต่อ
    tenant ได้เหมือนกัน — เดิมเป็น global ตัวเดียวทั้งระบบ (`fn_set_integration_secret()`
    ก็ต้องแก้ให้รับ/กรอง tenant_id ด้วยเช่นกัน)
  - **[แก้แล้ว 2026-09-16] fallback ที่ hardcode ข้อมูลบริษัทของ tenant เดิมตายตัว** — เจอ
    4 จุด ไม่ใช่แค่เลขผู้เสียภาษีอย่างเดียว: `invoicing-client.tsx` (หัวใบกำกับภาษี + ท้าย
    ลายเซ็น), `tax-filing-client.tsx` (ท้ายลายเซ็นหนังสือรับรองหัก ณ ที่จ่าย),
    `billing-notes/page.tsx` (ชื่อ/เลขผู้เสียภาษี/ที่อยู่/เบอร์โทร/PromptPay ทั้งก้อน — ร้ายแรง
    สุดเพราะเป็น PromptPay ID จริงที่รับเงินได้) เปลี่ยนเป็นข้อความกลาง ("ยังไม่ได้ตั้งค่า...")
    ทั้งหมดแล้ว **แต่ fallback ข้างใน `fetchShopProfile()` เองยังเป็นข้อมูลจริงของ tenant เดิม
    อยู่** (ดูข้อด้านบน) — ยังไม่แก้เพราะต้องรอกรอง tenant_id ก่อนถึงจะรู้ว่า default ที่ถูกต้อง
    ของแต่ละ tenant ควรเป็นอะไร
  - **[เสร็จแล้ว 2026-09-16] เปลี่ยนชื่อ "ตัวระบบ/แพลตฟอร์ม" เป็น `DD-Management`** — แทนที่
    "SneakerCare"/"Sneaker Care"/"SNEAKER CARE" ครบทุกจุดที่เป็นแบรนด์ตัวระบบ (ไม่ใช่ข้อมูล
    ร้าน): `app/layout.tsx` (`title`, `appleWebApp.title`), หน้า `/login`, `mobile-nav.tsx`,
    header ใน `(app)/layout.tsx`, หัวข้อหน้า dashboard/expenses/pos/roster/statistics/reports,
    ชื่อไฟล์ export ทั้งหมด (`DD-Management_Sales_Export_...xlsx` ฯลฯ) **ห้ามแก้**
    `SneakerCareDB` (ชื่อโปรเจกต์ Supabase จริง — เป็นชื่อภายนอกระบบ เปลี่ยนได้แค่ที่ Supabase
    Dashboard เท่านั้น ไม่ใช่จากโค้ด) และ `sneakercare.ddserviceth.com` (โดเมนจริงที่ deploy
    อยู่ — เปลี่ยนโดเมนเป็นงานแยกที่กระทบ DNS/SSL/redirect ต้องคุยก่อนถ้าจะทำ)
    **ชื่อร้าน/นิติบุคคลของแต่ละ tenant ตั้งได้เองอยู่แล้วที่ `/settings` ไม่เกี่ยวกับชื่อแพลตฟอร์ม**
  - สร้างบัญชี admin แรกของ tenant ที่สอง (ต้องระบุ `tenant_id` ตรงๆ ตอนสร้าง ไม่ใช้ DEFAULT)

## ✅ งานที่ต้องกดบน Dashboard/VPS — ปิดครบทุกข้อแล้ว (2026-09-08)

### 1. ปิด legacy API key (JWT-based) — ✅ เสร็จ
เจ้าของกดปิดที่ Supabase → Project Settings → API Keys → **Disable JWT-based API keys**
(ชื่อใหม่ของ legacy `anon`/`service_role` ที่ขึ้นต้นด้วย `eyJ...`)

**ตรวจหลังกดแล้วทันที ผ่านหมด:**
- `service_role` (`sb_secret_…`) อ่าน `sc_sales` ได้ 291 แถว
- `publishable` (`sb_publishable_…`) เรียก `auth/v1/settings` → 200 (หน้า `/login` ใช้ตัวนี้)
- `service_role` เรียก `auth/v1/admin/users` → 200 (หน้าเชิญผู้ใช้)
- **Edge Function `inv-low-stock-alert` → `200 {"status":"ok","results":[{"branch":"SneakerCare","sent":0}]}`**
  ⇒ **ข้างในฟังก์ชันไม่ได้ใช้ legacy key** ตามที่เคยกังวลไว้ แจ้งเตือนสต๊อกต่ำยังทำงานปกติ
- `anon` ยังถูกกันครบ (`sc_opex` · `profiles` · `integration_secrets` → 401)
- production 6 หน้าปกติ · PM2 online

**key เก่าที่หลุดใน git history ตายสนิทแล้ว** — ใครถือไปก็ใช้ไม่ได้อีก

### 2. Leaked Password Protection — ❌ ทำไม่ได้บนแผน FREE (ปิดเคส ห้ามไล่ให้ทำซ้ำ)
กดแล้วได้ error: *"Configuring leaked password protection via HaveIBeenPwned.org is available
on Pro Plans and up"* — โปรเจกต์นี้อยู่แผน FREE

**ทำไมไม่ใช่ช่องโหว่เร่งด่วน (ตรวจจากโค้ดจริงแล้ว):**
- แอป **ไม่เคยจับรหัสผ่านตอนสร้างบัญชี** — `/admin/users` ใช้ `inviteUserByEmail()`
  ผู้ใช้ตั้งรหัสเองผ่านหน้าของ Supabase รหัสผ่านไม่เคยผ่านโค้ดเรา
- มี rate limit ล็อกอินอยู่แล้ว: `MAX_ATTEMPTS = 5` ล็อก 5 นาที (`app/actions/auth.ts`)
- รหัสผ่านทั้ง 2 บัญชี rotate เป็นสุ่ม 20 ตัวอักษรเมื่อ 2026-09-06 ไม่มีทางอยู่ในฐาน HIBP

**ทำแทนได้ฟรี (ควรทำก่อนเชิญพนักงานเข้าระบบ):** Authentication → Sign In / Providers → Email
→ ตั้ง **Minimum password length = 12** (ค่าเริ่มต้น 6 สั้นเกินไป) + เปิด Password Requirements

### 3. Dead-man switch — ✅ เสร็จ
`HEALTHCHECK_URL` ตั้งใน `/home/ddservice/sneakercare-backup.env` แล้ว (healthchecks.io
check "RRS DB backup" · Period 1 day · Grace 2 hours) · ทดสอบรันจริงแล้วขึ้นเขียว "Up"
ได้ไฟล์ `rrs-backup-20260908_133207.dump` (622 KB) ครบทั้ง pg_dump → R2 → ping

**สำคัญเพราะ:** ข้อความ "สำเร็จ" เข้า Telegram ถูกปิดไว้ (2026-09-06) ⇒ ถ้า cron ตายทั้งตัว
จะไม่มีอะไรเกิดขึ้นเลย จึงไม่มีข้อความส่ง ตอนนี้ healthchecks.io จะอีเมลเตือนเองถ้าเลย Grace

### 4. cron ของ CSV รายเดือน — ✅ ติดตั้งแล้ว (2026-09-08)
`scripts/backup-monthly-csv.sh` เขียนไว้ตั้งแต่ 2026-09-01 แต่ **ไม่เคยถูกใส่ใน crontab เลย**
⇒ ผู้ทำบัญชีไม่เคยได้ไฟล์ CSV สักเดือน ตอนนี้ตั้งแล้ว (วันที่ 1 ตี 4 — หลัง backup รายวันตี 3):
```
0 4 1 * * /usr/bin/env bash -c 'set -a; source /home/ddservice/sneakercare-backup.env; set +a; /var/www/sneakercare/scripts/backup-monthly-csv.sh' >> /home/ddservice/sneakercare-backup.log 2>&1
```

**⚠️ สาเหตุจริงที่มันรันไม่ได้ ไม่ใช่แค่ลืมใส่ crontab** — `/home/ddservice/sneakercare-backup.env`
มีแต่ค่าของ `pg_dump`/R2 **ไม่มี `NEXT_PUBLIC_SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY`**
ที่ `export-monthly-csv.mjs` ต้องใช้ ⇒ ถ้าใส่ crontab เฉยๆ มันจะตายเงียบทุกเดือน
เติมสองค่านี้แล้ว (คัดลอกจาก `/var/www/sneakercare/.env.local` บนเครื่องเดียวกัน · สำรองไฟล์เดิมไว้ก่อนแก้)

**ทดสอบรันจริงแล้ว** (`--month=2026-08`): ยอดขาย 31 · รับชำระ 13 · ค่าใช้จ่าย 63 · audit คลัง 518
· สต๊อก 34 → 6 ไฟล์ 44 KB → `monthly-csv/rrs-csv-2026-08.tar.gz` (42,520 bytes) บน R2 · ยืนยันด้วย
`rclone ls` แล้วว่ามีไฟล์จริง

**⬜ ยังไม่ได้ทำ:** healthchecks check **ตัวที่สอง** (Period 1 month · Grace 2 days) ใส่เป็น
`HEALTHCHECK_CSV_URL` — ต้องคนละ check กับ backup รายวันเพราะรอบทำงานคนละความถี่
ถ้าไม่ทำ cron ตัวนี้ตายเมื่อไหร่จะไม่มีใครรู้เหมือนเดิม (แค่รู้ช้าลงเป็นรายเดือนแทน)

### [เสร็จแล้ว — ตัดออกจากรายการค้าง]
- ~~รัน migration `0011`~~ apply ตั้งแต่ 2026-09-01 ยืนยันซ้ำ 2026-09-06 กับฐานข้อมูลจริง
- ~~ตาราง `sc_*` ไม่ถูก track ใน migrations~~ ปิดด้วย `0012_sc_tables_baseline.sql`
- ~~cron `low-stock-alert-30min` ยิง 404~~ unschedule แล้ว + `0013`
- ~~สลับแอปไปใช้ key แบบใหม่~~ เสร็จทั้ง dev, VPS และ Vault (2026-09-06)

## 🔴 ช่องโหว่ที่ใหญ่ที่สุดที่เจอในรอบนี้ — Server Action ไม่มีการ์ด (ปิดแล้ว 2026-09-09)

**Server Action ของ Next.js คือ HTTP endpoint สาธารณะ** ที่ใครล็อกอินแล้วก็ยิงเข้ามาตรงๆ ได้
**การ์ด `requireModuleView()` ที่หน้าเว็บกันไม่ถึงมันเลย** — หน้าเว็บกันแค่ "คนที่กดผ่าน UI"

ก่อนหน้านี้เอกสารสรุปว่า "การ์ดฝั่งเซิร์ฟเวอร์ครบทุกหน้าแล้ว" ซึ่ง**จริงเฉพาะระดับหน้า**
พอไล่ตรวจระดับ action พบว่า **27 action ใช้ `createAdminClient()` (service_role ⇒ ข้าม RLS
ทั้งหมด ไม่เหลือด่านฐานข้อมูลเลย) แต่การ์ดมีแค่ `requireProfile()` = "ล็อกอินแล้ว" เท่านั้น**

| action | ทำอะไรได้ถ้าพนักงานเรียกตรงๆ |
|---|---|
| `fetchAllExpensesData` | **อ่านเงินเดือน เลขบัตรประชาชน เลขบัญชีธนาคาร ของพนักงานทุกคน** |
| `addExpense` · `deleteExpense` · `deleteMiscExpenseItem` | เพิ่ม/ลบรายการเงินของร้าน |
| `saveStaffPayrollAdjustment` · `createStaffMember` · `saveStaffProfileInfo` | แก้เงินเดือน/สร้างพนักงาน |
| `bulkImportSales/Stock/Expenses` | ยัดข้อมูลเงินเข้าระบบทีละก้อน |
| `fetchTaxFilingData` · `fetchSmartAccDocuments` · `createSmartAccDocument` | อ่าน/ออกเอกสารภาษี |
| `fetchAnalyticsData` | สถิติยอดขาย/กำไรทั้งร้าน |

**แก้แล้วทั้ง 57 action** ให้ตรงกับตาราง `viewRoles`/`writeRoles` ใน `lib/permissions.ts`
(อ่าน = `requireModuleView` · เขียน = `requireModuleWrite` · จัดการระบบ = `requireAdmin`)

**⚠️ ไม่มีผลกับความเร็วเลย** — `requireProfile` ห่อด้วย `cache()` ของ React (memo ต่อ 1 request)
การ์ดที่เพิ่มมา 27 จุดจึง **ไม่ได้ยิง query เพิ่มแม้แต่ครั้งเดียว**

**ตรวจแล้วว่าไม่ทำให้ผู้ใช้จริงเจอ redirect วน** — ไล่เทียบทุกคู่ "หน้า → action" (38 คู่)
ว่าไม่มีหน้าไหนเปิดกว้างกว่า action ที่มันเรียก · 3 คู่ที่ขึ้นเตือนเป็นของเดิมและถูกต้องแล้ว
(`/admin/items` พนักงานดูแคตตาล็อกได้ แต่ปุ่มแก้ไขเป็นของ admin)

### 🛡️ `npm run test:guards` — ด่านกันไม่ให้ย้อนกลับมาเป็นแบบเดิม (อยู่ใน CI แล้ว)
ตรวจแบบ static ไม่แตะฐานข้อมูล: ทุก `export async function` ใน `app/actions/` ต้องมีการ์ดที่
**แรงกว่า `requireProfile()`** และ module key ที่อ้างต้องมีอยู่จริงใน `lib/permissions.ts`
(สะกดผิด = การ์ดเงียบ ไม่มี error ให้เห็น)

**`requireProfile()` ไม่นับเป็นการ์ด** เพราะแปลว่า "ล็อกอินแล้ว" เฉยๆ ไม่ได้บอกว่า role ไหนทำอะไรได้
ถ้าจะยกเว้นต้องใส่ชื่อใน `INTENTIONALLY_OPEN` **พร้อมเหตุผล** (ตอนนี้มี 5 ตัว: login · logout ·
`changeOwnPassword` · `fetchShopProfile` · `fetchBackupHeartbeatEnabled`)
**ห้ามเติมชื่อลงลิสต์นั้นเพื่อให้เทสต์ผ่าน** ถ้ายังตอบไม่ได้ว่าทำไมพนักงานทุกคนควรเรียกได้

### หมายเหตุ: `approveAdjustment` ไม่ใช่ช่องโหว่ (ตรวจของจริงแล้ว)
ตอนแรกดูเหมือน "ไม่มีการ์ดเลย" แต่ไปอ่าน `prosrc` ของ `inv_fn_approve_adjustment()` บน
production จริงแล้วพบว่า **ฐานข้อมูลเช็คให้อยู่แล้ว** (`inv_fn_current_role() in ('admin','co-admin')`
+ co-admin อนุมัติข้ามสาขาไม่ได้) = กฎข้อ 3 และข้อ 4 ทำงานถูกต้องตามที่ออกแบบไว้
เพิ่มการ์ดฝั่งแอปเป็นด่านที่สองเพื่อให้ได้ข้อความไทยที่อ่านรู้เรื่องแทน exception ดิบของ Postgres

## ⚡ ความเร็ว: วัดจริงแล้ว — คอขวดคือ "จำนวนรอบเน็ต" ไม่ใช่ภูมิภาคของ Supabase (2026-09-08)

**วัดจาก VPS จริง ไม่ใช่เดา** (VPS อยู่ปากเกร็ด นนทบุรี · Siamdata AS56309):

| จาก VPS ไป | TCP connect |
|---|---|
| AWS โซล (`ap-northeast-2`) = ที่ Supabase อยู่ตอนนี้ | **~122 ms** |
| AWS สิงคโปร์ (`ap-southeast-1`) | **~56 ms** |
| REST query จริง (`sc_sales?limit=1`) TTFB | **~200–290 ms** |

⇒ ย้ายไปสิงคโปร์ **เร็วขึ้นจริง ~66 ms ต่อรอบ** (ประมาณ 25–45% ของเวลาต่อ query)

### แต่ทางที่ถูกกว่ามากคือ "ลดจำนวนรอบ" — ทำไปแล้วและได้มากกว่าการย้ายภูมิภาค
`fetchAllExpensesData()` เคยยิง **5 query เรียงกันทีละตัว** ทั้งที่ไม่มีตัวไหนใช้ผลของกันเลย
⇒ 5 × 230 ms ≈ **เสียเวลาเปล่าเกือบ 1 วินาที ทุกครั้งที่เปิดหน้า `/expenses`**
รวมเป็น `Promise.all` ก้อนเดียวแล้ว ⇒ เหลือรอบเดียว **ได้คืนมามากกว่าที่การย้ายไปสิงคโปร์จะให้
(ย้ายภูมิภาคจะลดจาก 5×230 เหลือ 5×164 = ประหยัด ~330 ms ส่วนการรวม query ประหยัด ~920 ms)**

**⚠️ กับดักที่ต้องรู้ก่อนไปทำแบบเดียวกันที่อื่น:** query builder ของ Supabase เป็น thenable
ที่ **ยิง HTTP ตอนถูก `await` ไม่ใช่ตอนสร้าง** ⇒ การประกาศตัวแปรเก็บ query ไว้ก่อนแล้วค่อยไล่
`await` ทีละตัว **ยังทำงานแบบเรียงกันเหมือนเดิมทุกประการ** (ดูเหมือนขนานแต่ไม่ขนาน)
ต้องรวมใน `Promise.all` เท่านั้น

### ❌ ยังไม่ควรย้าย Supabase ไปสิงคโปร์ตอนนี้ (ไม่ใช่เพราะไม่คุ้ม แต่เพราะย้ายไม่ได้จริง)
Supabase **เปลี่ยนภูมิภาคของโปรเจกต์เดิมไม่ได้** ต้องสร้างโปรเจกต์ใหม่แล้ว restore ข้อมูลไป
⇒ ได้ **project ref ใหม่ · URL ใหม่ · key ใหม่ทั้งชุด** แล้วต้องตามไปแก้ให้ครบทุกจุด:

1. `.env.local` ทั้งเครื่อง dev และ VPS + **rebuild** (`NEXT_PUBLIC_*` ถูกฝังตอน build)
2. **Supabase Vault `inv_service_role_key`** (cron แจ้งเตือนสต๊อกอ่านจากที่นี่ ลืม = ตายเงียบ)
3. **Edge Function `inv-low-stock-alert`** — ต้อง deploy ใหม่บนโปรเจกต์ใหม่ แต่ **ซอร์สไม่ได้อยู่
   ใน repo นี้** ต้อง `supabase functions download` ก่อน ซึ่ง**ทำไม่ได้ตอนนี้เพราะไม่มี Supabase CLI
   และไม่มี Personal Access Token** ทั้งบน dev และ VPS
4. **หน้าการเงินของระบบเดิม (GAS)** ที่ยังเขียน `sc_opex`/`sc_payments` อยู่ — source of truth
   อยู่ในโปรเจกต์ Apps Script **แก้จาก repo นี้ไม่ได้** ถ้าไม่ตามไปแก้ ระบบเดิมจะเขียนลง
   ฐานข้อมูลเก่าต่อไปเงียบๆ ⇒ **ข้อมูลเงินแตกเป็นสองที่โดยไม่มีใครรู้** (อันตรายที่สุดในลิสต์นี้)
5. `SUPABASE_DB_URL` ใน `/home/ddservice/sneakercare-backup.env` (backup รายวัน + CSV รายเดือน)

**ลำดับที่ถูกต้องคือ: ปิดขั้นที่ 6 (เลิกใช้ระบบเดิม) ให้จบก่อน → มี CLI/PAT พร้อม → ค่อยย้าย**
ย้ายตอนนี้คือแลก 66 ms ต่อ query กับความเสี่ยงที่ยอดเงินจะแตกเป็นสองฐาน — ไม่คุ้ม

**[แก้ข้อสรุปของตัวเอง 2026-09-09]** เคยเขียนไว้ว่า `/pos/daily-entry` ยังยิงแยกสองรอบ —
**ผิด** ไปดูหน้าจริงแล้วมันรวมเป็น `Promise.all` อยู่แล้วตั้งแต่ต้น (สรุปจากการนับ `await`
ในไฟล์ action โดยไม่ได้เปิดดูฝั่งคนเรียก) ⇒ **ตอนนี้หน้าอ่านข้อมูลทั้งหมดยิงขนานกันครบแล้ว**

**บทเรียน:** นับจำนวน `await` ในไฟล์ action บอกไม่ได้ว่าช้าตรงไหน เพราะ action หลายตัว
ถูกเรียกจากหน้าเดียวกันแบบขนานอยู่แล้ว — ต้องดูที่ฝั่งคนเรียกเสมอ

## 🧹 ลบสคริปต์ที่เป็นระเบิดเวลา 2 ไฟล์ (2026-09-08)

ไม่ใช่แค่ "ไฟล์ไม่ได้ใช้" แต่เป็นไฟล์ที่**รันแล้วทำลายของจริง** และวางอยู่ใน `scripts/` ปนกับ
สคริปต์ที่ใช้งานได้ปกติ ใครเผลอรันก็เสียหายทันที:

| ไฟล์ที่ลบ | ถ้ารันซ้ำจะเกิดอะไร |
|---|---|
| `scripts/fix-rls-policies.sql` | สร้าง policy `TO authenticated, anon USING (true)` บน `profiles` = **เปิดช่องโหว่ที่ `0015` ปิดไปแล้ว** (ชื่อ/username/role ของผู้ใช้ทุกคนอ่านได้โดยไม่ต้องล็อกอิน) · ยืนยันกับ production แล้วว่าตอนนี้เหลือ `{authenticated}` ถูกต้อง |
| `scripts/update-smartacc-workflow.sql` | ส่วนท้ายเป็น `DELETE FROM` **8 ตารางแบบไม่มี WHERE** (เขียนไว้ตอนล้างข้อมูลทดลอง) ตอนนี้ตารางพวกนั้นมี**ใบกำกับภาษีจริง**แล้ว = ล้างทิ้งกู้ไม่ได้ |
| `scripts/recreate-fn.sql` | ซ้ำกับข้างบน (ฟังก์ชันเดียวกันเป๊ะ) |
| `scripts/migrate-from-legacy.mjs` + `npm run migrate:legacy` | import CSV จาก Google Sheets ครั้งเดียว ย้ายครบตั้งแต่ ส.ค. แล้ว |

**เจอช่องว่างระหว่างทาง → ปิดด้วย `0027_smartacc_workflow_baseline.sql`:** คอลัมน์
`ref_parent_doc_id` / `ref_parent_doc_number` ของ `ext_documents` **มีอยู่บน production จริง
แต่ไม่มีใน migration ไฟล์ไหนเลย** (ถูก apply ผ่านสคริปต์ ad-hoc ข้างบน) ⇒ กู้ระบบขึ้นโปรเจกต์ใหม่
แล้วการแปลงเอกสาร QA→DO/INV→BL→REC/TAX จะพังทันที · ทุก statement มี guard = **no-op บน
production ไม่ต้องรีบ apply** · **จงใจไม่ยกส่วน `DELETE FROM` มาด้วย ห้ามเติมกลับ**

**ตรวจเพิ่ม (ผ่าน):** SECURITY DEFINER function ทั้ง **14 ตัว** บน production ตั้ง `search_path`
ครบทุกตัว — ไม่มีช่องให้คนเรียกชี้ search_path ไปที่ schema ปลอมของตัวเอง

**ของที่ *ไม่* ลบ ทั้งที่ดูเหมือนขยะ:** `apply-aliases-and-unified-schema.sql` ·
`inspect-inv-schema.sql` — เป็น**หลักฐานชิ้นเดียว**ที่บอกว่า view alias / schema `inv_*`
บน production มาจากไหน ลบแล้วกู้ระบบยากขึ้น ไม่ใช่ง่ายขึ้น

## 🔑 ปิดช่องว่างฟีเจอร์ที่ทำให้เลิกใช้ระบบเดิมไม่ได้ (2026-09-08) — ขั้นที่ 6 ของแผน sc_opex

ไล่ `formType` ทั้ง **17 ตัว** ใน `legacy/sneakercare_dashboard.html` เทียบกับระบบใหม่ทีละตัว
⇒ ระบบใหม่ทำได้หมดแล้ว **ยกเว้น 4 อย่าง** ปิดไป 3 (ตัวที่ 4 จงใจไม่ทำ):

| ระบบเดิม | ระบบใหม่ |
|---|---|
| `change_password` | ✅ **หน้า `/account`** (ใหม่) — ใช้แค่ `requireProfile()` ⇒ **ทุก role เข้าได้** ต่างจาก `/settings` ที่เป็น admin-only · เข้าจากไอคอนคนที่หัวเว็บ |
| `reset_user_password` | ✅ ปุ่ม **"ส่งลิงก์ตั้งรหัสใหม่"** ที่ `/admin/users` |
| `delete_user` | ✅ ปุ่ม **"ลบ"** ที่ `/admin/users` — เช็ค ledger ก่อนเสมอ |
| `delete_month` | ❌ **จงใจไม่ทำตาม** |

**⚠️ ข้อออกแบบที่ตั้งใจต่างจากระบบเดิม 2 จุด — อย่า "แก้ให้เหมือนเดิม" โดยไม่อ่านเหตุผลก่อน:**

1. **แอดมินตั้งรหัสผ่านให้คนอื่นตรงๆ ไม่ได้** (ระบบเดิมทำได้) — ระบบใหม่ส่ง
   `generateLink({type:"recovery"})` ให้เจ้าตัวตั้งเอง · เพราะถ้าแอดมินรู้รหัสผ่านของพนักงาน
   ก็ล็อกอินในนามคนนั้นได้ แล้ว `sc_audit_logs`/`inv_audit_logs` จะบันทึกเป็นชื่อพนักงาน
   ⇒ **ประวัติทั้งระบบเชื่อถือไม่ได้ทันที** ขัดกับกฎข้อ 1/2 ที่ลงทุนไว้เยอะ
2. **ลบผู้ใช้ต้องผ่านการเช็ค ledger ก่อนเสมอ** — `deleteUser()` นับแถวใน `inv_audit_logs`
   (`performed_by`) และ `inv_stock_transactions` (`created_by`) ก่อน ถ้ามี **ปฏิเสธ** แล้วบอกให้
   ใช้ "ปิดใช้งาน" (`is_active = false`) แทน · ลบไปคือ FK พัง หรือไม่ก็ต้องแก้ audit ย้อนหลัง
   = ผิดกฎข้อ 1 ตรงๆ (เคสจริงที่พิสูจน์แล้ว: บัญชี `rlsverify35...` มี audit 2 แถว ลบไม่ได้ ถูกต้อง)
3. **`delete_month` (ลบข้อมูลเงินทั้งเดือนรวดเดียว) จงใจไม่ port มา** — ลบหลายสิบแถวด้วยปุ่มเดียว
   โดยกู้คืนไม่ได้ · ระบบใหม่ลบทีละรายการและเก็บค่าเดิมไว้ใน `sc_audit_logs` ก่อนลบเสมอ
   ถ้าเจ้าของอยากได้จริงต้องคุยกันก่อน ไม่ใช่เติมให้เพราะ "ระบบเดิมมี"

**ทดสอบตรรกะทั้งชุดบน production จริงแล้ว** (สร้างบัญชีชั่วคราว → ใช้ → ลบทิ้ง เหลือ 0 บัญชี):
รหัสเดิมผิด→ปฏิเสธ · เปลี่ยนแล้วล็อกอินด้วยรหัสใหม่ได้จริง · รหัสเดิมใช้ไม่ได้แล้ว · เช็ค ledger ก่อนลบทำงานถูก

**ข้อมูลการใช้งานจริง (ดูจาก `recorded_by` ของ `sc_sales`):** บิลผ่าน**ระบบเดิม**ล่าสุด `2026-08-27`
· ผ่าน**ระบบใหม่** `2026-08-31` ⇒ ไม่มีใครใช้ระบบเดิมบันทึกยอดขายมาเกือบ 2 สัปดาห์แล้ว

**เหลือให้เจ้าของทำก่อนหยุด dual-write:** ใช้ระบบใหม่แทนให้ครบทุกงานสัก 1 เดือน (โดยเฉพาะแท็บ
ภาพรวม/สถิติ) → ยืนยันว่าไม่เปิด `legacy/sneakercare_dashboard.html` อีกแล้ว → ค่อยหยุดเขียน
`sc_opex` แล้วเก็บไว้เป็น **view read-only อย่างน้อย 1 ปี — ห้าม drop ตาราง**

## สถานะงานล่าสุด (2026-09-06, เย็น — ยอดกำไรสุทธิไม่ตรงกับ Excel: เจอ 3 เรื่องซ้อนกัน)

ผู้ใช้ส่ง Excel เดือน ส.ค. 69 ที่คำนวณมือมาเทียบ แล้วบอกว่ายอดในเว็บไม่ตรง — ไล่กระทบยอดกับ
ข้อมูลจริงใน `sc_opex`/`sc_sales`/`sc_payments` ทีละบาท พบว่าเป็น **3 เรื่องคนละเรื่องที่ทับกันอยู่**

1. **[บั๊กจริง แก้แล้ว] หน้า `/dashboard` ใช้ whitelist ของชื่อ category ที่ hardcode ไว้ 8 ชื่อ**
   (`validExpenseCategories`) แต่ `sc_opex.category` เป็น free-text ที่ฟอร์ม `/expenses` สร้างชื่อใหม่
   ลงไปได้เรื่อยๆ (ค่าที่ส่งจริงคือ `shortLabel` ของ `EXPENSE_CATEGORIES`) — หมวดที่ไม่อยู่ในรายชื่อจึง
   **หายไปจากยอดค่าใช้จ่ายเงียบๆ ไม่มี error** เดือน ส.ค. ตกไป 2 หมวด: "สาธารณูปโภค & ค่าเช่า"
   ฿4,996.51 + "ดำเนินงาน & เบ็ดเตล็ด" ฿1,604.00 = **฿6,600.51 ต่อเดือน** ทำให้กำไรสุทธิสูงเกินจริง
   และหน้าภาพรวมกับหน้า `/expenses` แสดงยอดไม่ตรงกันมาตลอด (50,971.00 vs 57,571.51)
   **แก้เป็น blacklist** (นับทุกหมวด ยกเว้น `payslip_detail`/`rental_income`/`rental_meter` + แถว
   `empd_*`) ให้ตรงกับ `fetchAllExpensesData()` — ยืนยันกับข้อมูลจริงแล้วว่าสองหน้าตรงกันเป๊ะ
   **หลักการ: ตัวเลขเกินยังมีคนเห็นแล้วทัก แต่ตัวเลขที่หายไปเงียบๆ ไม่มีใครรู้ — อย่าใช้ whitelist
   กับข้อมูลที่ผู้ใช้ตั้งชื่อเองได้**
2. **[ไม่ใช่บั๊ก — ข้อมูลยังไม่ได้ลง] ค่าใช้จ่าย ฿24,496.00 ไม่เคยถูกบันทึกในระบบ**
   ค่าหุ้นส่วน ฿20,000 + ของใช้/น้ำยา 11 รายการ ฿4,496 — บันทึกให้แล้วตามที่เจ้าของสั่ง (12 แถว
   พร้อม audit log ครบ) **⚠️ ค่าหุ้นส่วนต้องลง category `"ค่าแรง & เงินเดือน"` (shortLabel) ห้ามลง
   `"ค่าแรงพนักงาน"` เด็ดขาด** เพราะชื่อหลังถูกสงวนไว้ให้แถว `emp_*` ของสลิปเงินเดือน และถูก
   `fetchAllExpensesData()` กรองทิ้งจาก opexList (จะหายจากหน้า /expenses แต่ยังโผล่ในหน้าภาพรวม
   = สองหน้าไม่ตรงกันอีก)
3. **[Excel ของผู้ใช้เองคลาดเคลื่อน] ช่อง SUM ของตาราง "รายจ่ายอื่นๆ" ตกไป ฿554.00**
   ผลรวมจริงของ 23 บรรทัดคือ ฿12,196 แต่ช่องรวมแสดง ฿11,642 (ช่วง SUM ไม่ครอบ 3 บรรทัดสุดท้าย:
   ค่าน้ำมันรถเจ 100 + ส่วนเกินผ่อนแอร์ 254 + ค่าส่งแกรป 200) → กำไรสุทธิที่ถูกต้องคือ **฿24,524.79**
   ไม่ใช่ ฿25,078.79 ที่ Excel แสดง

**ผลหลังแก้ทั้งหมด (ยืนยันกับข้อมูลจริง):** ค่าใช้จ่าย ส.ค. = **฿82,067.51** เท่ากันทั้งสองหน้าและตรงกับ
Excel เป๊ะ · กำไรสุทธิ **฿24,524.79** (เกณฑ์เงินเข้าจริง) หรือ **฿26,624.79** (เกณฑ์ตามบิล)

**⚠️ เกณฑ์รายรับต่างกัน 2 แบบ — ไม่ใช่บั๊ก แต่ต้องรู้:** Excel คิดแบบ **เงินเข้าจริงในเดือน** (cash
basis) = ฿100,592.30 ส่วนเว็บคิด **ตามบิล** (accrual) = ฿102,692.30 ต่างกัน ฿2,100 คือบิลวันที่ 21 ส.ค.
ที่ลูกค้าโอนวันที่ 1 ก.ย. — พิสูจน์แล้วว่า `amount_paid ของบิล ส.ค. (93,992.30) + sc_payments ที่
received_date อยู่ใน ส.ค. (6,600.00) = 100,592.30` ตรงกับ Excel พอดี ถ้าจะให้เว็บแสดงแบบ cash basis
ต้องเพิ่มเป็นตัวเลือกใหม่ ไม่ใช่ไปแก้ตัวเลขเดิม (ยังไม่ได้ทำ)

**⚠️ ค่าเช่าร้านบันทึกคนละวิธีกับ Excel (ผลลัพธ์เท่ากัน):** Excel ใช้ ฿11,100 (= 18,000 − 6,000
ค่าห้องพนักงาน − 900 หัก ณ ที่จ่าย) แล้วแยก 900 ไปหมวดภาษี · ระบบใช้ ฿18,000 เต็มและแสดงรายรับ
ห้องเช่า ฿6,000 เป็นการ์ดแยก **ห้ามบันทึก WHT 900 เพิ่มในระบบ** เพราะรวมอยู่ใน 18,000 แล้ว จะกลายเป็นนับซ้ำ

**✅ [แก้ข้อมูลที่ล้าสมัย 2026-09-09] "ระเบิดเวลา" ปลดชนวนไปแล้ว — ตรวจของจริงแล้ว**
เอกสารเคยเตือนว่าแถว `sc_opex` category `payslip_detail` key `audit_log` เก็บ
**timestamp (1,787,827,245,489) ไว้ในคอลัมน์ `amount`** — ยิงถามฐานข้อมูลจริงแล้วพบว่า
**แถวกลุ่มนี้เป็น `0.0000` หมดทุกแถว** และค่าสูงสุดของทั้งตารางคือ **43,337.29** (ยอดเงินปกติ)
⇒ ไม่มีค่าผิดปกติเหลืออยู่แล้ว · guard `amt < 10000000` กับ blacklist ของ category ยังอยู่
ตามเดิม **ห้ามถอดออก** เพราะระบบเดิม (GAS) ยังเขียนแถวกลุ่มนี้อยู่ มันกลับมาได้อีกทุกเมื่อ

**เปลี่ยนคำเตือนเป็นเทสต์จริงแล้ว: `npm run check:money`** — ตรวจว่าไม่มีค่าเงินนอกช่วง
0–10,000,000 ใน `sc_opex` · `sc_expense_entries` · `sc_payslips` · `sc_rental_records`
**คำเตือนที่รันไม่ได้ ไม่ได้กันอะไรเลย** — ที่ผ่านมามันอยู่ในเอกสารเฉยๆ หลายสัปดาห์
โดยไม่มีใครรู้ด้วยซ้ำว่ามันถูกแก้ไปแล้ว

## ✅ rotate Telegram Bot Token — เสร็จแล้ว (revoke 2026-09-06 · ยืนยันซ้ำ 2026-09-08)

**ตรวจซ้ำกับของจริงแล้ว 2026-09-08:** ค่าใน `integration_secrets` ปัจจุบัน **ไม่ตรง**กับ token ที่หลุด
(ขึ้นต้น `8875441249:AAG…`) · `updated_at = 2026-09-06T16:20Z` · ยิง `getMe` ได้ 200 (บอทใช้งานได้ปกติ)
· ยิง `/rest/v1/integration_secrets` ด้วย publishable key ตอนนี้ได้ **401 permission denied** แล้ว
เก็บบันทึกด้านล่างไว้เป็นประวัติของช่องโหว่ ไม่ใช่งานค้าง

<details><summary>บันทึกช่องโหว่เดิม (ปิดแล้ว)</summary>

**Bot Token ถูกเปิดให้อ่านสาธารณะอยู่ ไม่รู้ว่านานแค่ไหน — ต้องถือว่าหลุดแล้ว 100%**

```
GET /rest/v1/integration_secrets   (ใช้แค่ publishable key ที่ฝังในหน้าเว็บ ไม่ต้องล็อกอิน)
→ [{"key":"telegram_bot_token","value":"8875441249:AAG…"}]
```
`branches.telegram_chat_id` (`-5034072774`) ก็หลุดคู่กัน ⇒ ใครถือทั้งคู่ **ส่งข้อความปลอมเข้ากลุ่ม
พนักงานได้ทันที** เช่นแกล้งเป็นระบบสั่งให้พนักงานทำอะไรบางอย่าง

**ช่องทางถูกปิดไปแล้ว** (migration `0016`) แต่ token ตัวเดิมยังใช้งานได้อยู่จนกว่าจะ revoke:
Telegram → **@BotFather** → `/revoke` → เลือกบอท → เอา token ใหม่มาใส่ที่หน้า `/settings`
(ห้ามใส่ในไฟล์ env หรือโค้ด — ตามกฎข้อ 9 เขียนผ่าน RPC `fn_set_integration_secret()` เท่านั้น)

</details>

## 🔴 SECURITY DEFINER View — ช่องโหว่ที่ทำให้ 0014/0015 ไร้ผล (แก้แล้วด้วย 0016)

Supabase Security Advisor ชี้จุดที่การไล่ตรวจ RLS ของตารางมองไม่เห็น: **VIEW ใน Postgres ทำงานด้วย
สิทธิ์ของเจ้าของ view เป็นค่าเริ่มต้น** (เจ้าของคือ postgres ซึ่งมี BYPASSRLS) ⇒ **RLS ของตาราง
ข้างใต้ไม่ถูกบังคับเลย** ต่อให้ปิดตารางแน่นแค่ไหนก็ไม่มีผล ตราบใดที่ยังเข้าทาง view ได้

view alias ที่ `scripts/apply-aliases-and-unified-schema.sql` สร้างไว้ (`items` → `inv_items`,
`item_stock` → `inv_item_stock`, `audit_logs` → `inv_audit_logs`, `integration_secrets` → …)
**12 ตัวเป็น SECURITY DEFINER ทั้งหมด** ทำให้ข้อมูลต่อไปนี้อ่านได้โดยไม่ต้องล็อกอิน:
Bot Token · `item_stock.avg_unit_cost` และ `stock_transactions.unit_cost` (**ข้อมูลต้นทุน —
ผิดกฎข้อ 5 โดยตรง**) · audit ledger ทั้งหมด · `telegram_chat_id` · แคตตาล็อก · ซัพพลายเออร์

**แก้ด้วย `alter view ... set (security_invoker = on)`** (Postgres 15+) ให้ view ใช้สิทธิ์ของคนเรียก
ซึ่งเป็นพฤติกรรมที่ควรเป็นตั้งแต่แรก — view กลุ่ม `inv_v_*` บางตัวตั้งถูกไว้แล้ว แต่ alias ที่สร้าง
ทีหลังไม่ได้ตั้ง

**⚠️ กฎใหม่: ทุกครั้งที่สร้าง VIEW ใน public ต้องใส่ `with (security_invoker = on)` เสมอ**
ไม่งั้นมันจะกลายเป็นประตูหลังข้าม RLS ทันที และ `npm run lint`/typecheck จับไม่ได้เลย

## 🛡️ ด่านที่สอง: ถอนสิทธิ์ anon ออกทั้งหมด (0016)

`revoke all on <ทุกตาราง/view ใน public> from anon` — เหตุผลคือรอบนี้พิสูจน์แล้วว่า RLS ด่านเดียว
ไม่พอ (view ตัวเดียวเปิดทะลุทุกอย่าง) ตอนนี้ต่อให้ policy ผิดอีก ข้อมูลก็ไม่หลุดเพราะ anon แตะ
ไม่ได้ตั้งแต่ระดับ GRANT

ปลอดภัยเพราะไม่มีไฟล์ใดในแอป import `lib/supabase/client.ts` เลย (ทุก query ผ่านเซิร์ฟเวอร์ด้วย
session ผู้ใช้หรือ service_role) และ `/login` ใช้ Supabase Auth (`/auth/v1/*`) ซึ่งไม่เกี่ยวกับ
GRANT ของตาราง — **ยืนยันด้วยการล็อกอินเป็น admin จริงแล้วอ่านครบ 17 ตาราง/view ผ่านหมด**
(`integration_secrets` คืน 0 แถวแม้เป็น admin ซึ่งถูกต้องตามกฎข้อ 9)

## ✅ การ์ดกันสิทธิ์ฝั่งเซิร์ฟเวอร์ — ครบทุกหน้าแล้ว (2026-09-06 · ตรวจซ้ำ 2026-09-08)

เดิมมีแค่ 3 หน้าที่เรียก guard จริง ทำให้พนักงานพิมพ์ URL ตรงๆ เข้า `/expenses` (เงินเดือนทุกคน),
`/admin/audit`, `/invoicing`, `/roster`, `/tax-filing`, `/statistics` ได้หมด (เมนูแค่ซ่อนลิงก์)
ตอนนี้ **20 จาก 22 หน้าเรียก `requireModuleView()` / `requireAdmin()` แล้ว** อีก 2 หน้าคือ
`/login` กับ root ที่ไม่ต้องมี guard โดยธรรมชาติ

**⚠️ หน้าใหม่ทุกหน้าต้องเรียก `requireModuleView(profile, "<key>")` เสมอ** — `lib/permissions.ts`
กำหนดสิทธิ์ไว้ก็จริง แต่ถ้าหน้าไม่เรียก guard มันเป็นแค่การซ่อนลิงก์บนเมนู ไม่ใช่การกันเข้าถึง

## ✅ ปิดช่องว่างระหว่าง ledger สองสายแล้ว (2026-09-08, รอบเย็น)

**`lib/stock-purchases.ts` = สูตรกลางตัวใหม่** ("เงินที่จ่ายซื้อของเข้าคลังในเดือนหนึ่ง" คิดยังไง)
ใช้ร่วมกันทั้ง `npm run check:stock-vs-expenses` และหน้า `/expenses` — **ห้ามเขียนกฎนี้ซ้ำที่อื่น**
(บทเรียนเดิม: `/dashboard` กับ `/expenses` เคยเขียนกฎกรอง `sc_opex` คนละชุดแล้วแสดงยอดไม่ตรงกันอยู่นาน)

**หน้า `/expenses` ขึ้นแถบเตือนสีเหลืองเองแล้ว** เมื่อเดือนที่กำลังดูมีของรับเข้าคลังมากกว่าที่ลง
ค่าใช้จ่ายไว้ พร้อมบอกส่วนต่างเป็นตัวเงินและลิงก์ไป `/inventory` — ไม่ต้องรอกระทบยอดกับ Excel
ถึงจะรู้ว่ามีเงินหายไปจากยอดกำไร (จงใจเตือนเฉพาะทิศ "คลังมากกว่า" เพราะทิศตรงข้ามคือของที่ไม่ต้อง
เข้าคลัง ซึ่งปกติ) · มีเทสต์ล็อกสูตรไว้ใน `npm run test:expenses` ข้อ [9]

## 💵 หน้าภาพรวมสลับเกณฑ์รายรับได้แล้ว (2026-09-08)

ปุ่ม **"💵 เงินเข้าจริง / 🧾 ตามบิล"** ใต้แถบเลือกช่วงเวลาที่ `/dashboard`
**ค่าเริ่มต้นยังเป็น "เงินเข้าจริง" เสมอ ห้ามเปลี่ยนโดยไม่ถามเจ้าของ** (ตรงกับที่กระทบยอดกับ Excel)
มีไว้เทียบกับ Excel เดือนที่คิดตามบิลได้โดยไม่ต้องแก้โค้ด · เลือก "ตามบิล" แล้วจะมีข้อความกำกับว่า
ตัวเลขนี้รวมบิลที่ลูกค้ายังไม่จ่าย จึงไม่ตรงกับเงินในบัญชี

## 🏢 `/inventory` กรองสาขาแล้ว (2026-09-08)

เดิมพึ่ง WHERE ในวิว `v_item_stock` อย่างเดียว ซึ่ง **admin จะเห็นทุกสาขา** (`inv_fn_current_branch()`
คืน null ให้ admin) ⇒ ถ้ามีสาขาที่สองจะมีหลายแถวต่อสินค้าหนึ่งชิ้น แล้ว Map เก็บแค่แถวสุดท้าย
= ตัวเลขมั่วเงียบๆ · ตอนนี้กรองด้วยคุกกี้ `sc_active_branch` ทั้ง `v_item_stock` และ `item_stock`
(ตามกฎข้อ 12) — พฤติกรรมวันนี้เหมือนเดิมทุกอย่างเพราะมีสาขาเดียว

## 🔴 ต้นเหตุจริงที่ยอดไม่ตรงมาตลอด: เงินอยู่ใน ledger สองสายที่ไม่คุยกัน (2026-09-08)

**ระบบนี้มีบันทึกเงินสองสายที่แยกกันสนิท และหน้าการเงินอ่านแค่สายเดียว:**

| สาย | ตาราง | ใช้ที่ไหน |
|---|---|---|
| ของเข้าคลัง (จำนวน + ต้นทุน) | `inv_stock_transactions` | `/inventory`, `/stock-in`, COGS |
| เงินที่จ่ายออก | `sc_opex` | `/expenses`, `/dashboard` |

**`calculateExpenseBreakdown()` อ่านแค่ `sc_opex`** ⇒ ของที่ซื้อแล้วบันทึกเฉพาะฝั่งคลัง
**หายไปจากยอดค่าใช้จ่ายเงียบๆ ไม่มี error ให้เห็นเลย** — ยอดที่หายตรงกับ ledger เป๊ะทุกเดือน:
ก.พ. 4,803 · มี.ค. 4,899.01 · เม.ย. 830 · พ.ค. 4,956 · มิ.ย. 3,561 · ก.ค. 2,284

**⚠️ บทเรียนที่แพงที่สุดของเซสชันนี้:** ตอนแรกสรุปว่า "ข้อมูลหาย" แล้วบันทึก `sc_opex` เพิ่มให้
ยอดตรง — ที่จริงเงินอยู่ครบแล้วในฝั่งคลัง **ก่อนจะสรุปว่าข้อมูลขาด ต้องไล่ให้ครบทุกตารางก่อนเสมอ**
(`sc_opex` · `inv_stock_transactions` · `sc_expenses` · `sc_opex_history`) ไม่ใช่แค่ตารางที่หน้าจอนั้นอ่าน

### ธรรมเนียมที่ใช้อยู่ตอนนี้ — ของเข้าร้านต้องบันทึก **สองที่**
ฝั่งคลัง = จำนวน/ต้นทุนถัวเฉลี่ย · ฝั่ง `sc_opex` = เงินที่จ่ายออกจริงในเดือนนั้น
เป็นคนละวัตถุประสงค์ ไม่ใช่การนับซ้ำ (P&L นับจาก `sc_opex` ที่เดียว)

**`npm run check:stock-vs-expenses`** = ด่านตรวจว่าเดือนไหนบันทึกไม่ครบทั้งสองฝั่ง
รันทุกครั้งหลังกระทบยอด อ่านอย่างเดียวไม่เขียนอะไร · ค่าติดลบ = ซื้อของแล้วไม่ได้ลงค่าใช้จ่าย
⇒ **กำไรในระบบสูงเกินจริง** · ค่าเป็นบวก = ของที่ไม่ต้องเข้าคลัง (ปกติ)

**ผลตรวจ ณ 2026-09-08 — เหลือ 2 จุด และทั้งคู่อธิบายได้ ไม่ใช่บั๊ก:**
- ~~`2026-01` ledger 732.00 · ค่าใช้จ่าย 0~~ เติมครบแล้ว (id 2134–2141)
  **เจ้าของยืนยัน 2026-09-08 ว่ายอดเดือน ม.ค. ถูกต้องแล้ว** — ปิดเรื่องนี้
- `2026-02 +2,000` / `2026-07 −2,000` — แถวแก้ไขของ `น้ำยาขจัดคราบสีฟ้า` ที่กรอกจำนวนผิด
  ถูกสร้างวันที่ 29 ก.ค. แต่เป็นเงินที่จ่ายไปตั้งแต่ ก.พ. ⇒ `transaction_date` ของแถวแก้ไขเป็น
  วันที่แก้ ไม่ใช่วันที่ซื้อ **ยอดรวมทั้งปีถูกต้อง แค่ตกอยู่ผิดเดือนในมุมมองของคลัง**
  (ห้ามไปแก้แถวเดิม — ledger เป็น append-only ตามกฎข้อ 2)
- `2026-08 +1,604` — ค่าส่งแกรป/คืนเงินลูกค้า/ค่าคอม ฯลฯ ที่ไม่ต้องเข้าคลัง = ปกติ

## 🧹 lint สะอาด 0 ปัญหาแล้ว — CI เคยแดงมาตลอด (2026-09-08)

`npm run lint` เคยมี **68 error + 71 warning** ⇒ **CI แดงทุก push** (job "Lint / Typecheck / Build"
ล้มตั้งแต่ขั้นแรก) เทสต์ที่เหลือทั้งหมดจึงไม่เคยได้รัน — ตอนนี้เหลือ **0 ปัญหา** ทั้ง error และ warning

**การถอด `as any` ออกเผยบั๊กที่พังเงียบเพิ่มอีก 2 จุด** (รูปแบบเดียวกับ 7 จุดที่เจอเมื่อ 2026-09-06):

| จุด | อาการจริง |
|---|---|
| `invoicing-client.tsx` อ่าน `it.line_total` (ของจริงชื่อ `total_line_amount`) | ใบกำกับภาษี/ใบเสร็จที่พิมพ์ออกมา **ตกไปใช้ `qty × unit_price` เสมอ ⇒ ส่วนลดรายบรรทัดหายไปจากใบพิมพ์** |
| `reports-client.tsx` ส่งออก `e.item_name` / `e.total_amount` (ของจริง `name` / `amount`) | ไฟล์ Excel ที่ส่งออกจากหน้า /reports ได้ช่อง "รายการ" ว่าง และ "จำนวนเงิน" เป็น 0 ทุกแถว |

**ของใหม่ที่เพิ่มเข้ามา (ใช้ซ้ำได้ อย่าเขียนซ้ำเอง):**
- `lib/errors.ts` → `errorMessage(err, fallback)` แทน `catch (err: any) { err.message }`
  (ที่เดิมพังเงียบเป็น "undefined" ทันทีที่สิ่งที่ถูกโยนไม่ใช่ `Error`)
- `lib/use-is-mounted.ts` → `useIsMounted()` ด้วย `useSyncExternalStore` แทน
  `useState(false)` + `useEffect(setMounted(true))` ที่ render สองรอบและผิดกฎ `set-state-in-effect`
- `lib/auth.ts` → `isNextRedirectError(err)` — `redirect()` ของ Next ทำงานด้วยการ throw
  **ทุก try/catch ที่ครอบ redirect ต้องเช็คแล้วโยนต่อ ไม่งั้น redirect หายเงียบ**

**รูปแบบที่ใช้แทน `any` (ทำตามนี้กับโค้ดใหม่ทุกครั้ง):**
- props ของ client component → `Tables<"ชื่อตาราง">` จาก `database.types.ts`
- ผลลัพธ์ของ query ที่ join → แยกเป็นฟังก์ชันแล้วใช้ `Awaited<ReturnType<typeof fn>>[number]`
  (เช่น `SmartAccDocument`, `TaxFilingSalesDoc`, `BillingNoteDoc`) — types จะตามฐานข้อมูลเองเมื่อ regenerate
- คอลัมน์ nullable จาก view alias → `withId` / `text` / `num` / `bool` ใน `lib/db-rows.ts`
- ค่าเริ่มต้นของ state ที่อ้างเวลาปัจจุบัน → lazy initializer `useState(() => ...)` เสมอ
- พารามิเตอร์ที่ตั้งใจไม่ใช้ → ขึ้นต้นด้วย `_` (ตั้ง `argsIgnorePattern` ไว้ใน `eslint.config.mjs` แล้ว)

**เก็บระหว่างทาง:** `/pos` เพิ่มรายการบริการที่เลือกไว้เป็นชิปพร้อมปุ่มลบ (เดิมบริการที่พิมพ์เพิ่มเอง
ไม่มีที่แสดงเลย เห็นแค่ยอดรวมขยับ พิมพ์ผิดแล้วลบไม่ได้ ต้องล้างทั้งบิล) · `fetchTaxFilingData(yearMonth)`
เดิมรับพารามิเตอร์แล้วไม่ใช้เลย ตอนนี้กรองที่ฐานข้อมูลจริง

**⚠️ `/inventory` ไม่ได้กรองสาขาเอง** — พึ่ง WHERE ที่ฝังใน view `v_item_stock` ซึ่ง admin จะเห็นทุกสาขา
ตอนนี้ยังไม่เห็นอาการเพราะมีสาขาเดียว **วันที่เปิดสาขาที่สองต้องกลับมาเติมตัวกรองก่อน** (คอมเมนต์กำกับไว้ในไฟล์แล้ว)

## 🤝 ส่วนแบ่งกำไรหุ้นส่วนแยกเป็นหมวดของตัวเองแล้ว (2026-09-08)

**ปัญหา:** ส่วนแบ่งหุ้นส่วน = 20% ของกำไรสุทธิ แต่ถูกบันทึกกลับเข้ามาเป็น**ค่าใช้จ่าย**
⇒ ตัวเลข "กำไรสุทธิ" บนหน้าจอคือยอด*หลัง*แบ่งไปแล้ว เอาไปคูณ 20% ซ้ำไม่ได้ (งูกินหาง)
และเดิมยอดนี้ฝังอยู่ใน `misc_items_json` ปนกับค่าน้ำมันรถ/ค่าที่ปรึกษา จึงมองไม่เห็นเลย

**แก้เป็น:** `PARTNER_SHARE_CATEGORY = "ส่วนแบ่งหุ้นส่วน"` ใน `lib/expense-totals.ts` +
หมวด `partner_share` ใน `lib/expense-categories.ts` · `calculateExpenseBreakdown()` คืน
`totalPartnerShare` และ `totalExpensesBeforePartnerShare` เพิ่ม · หน้า `/dashboard` แสดง
"ก่อนแบ่ง ฿X − ส่วนแบ่งหุ้นส่วน ฿Y" ใต้การ์ดกำไรสุทธิ · `/expenses` มีแถบสีน้ำเงินแยกให้เห็น

**⚠️ `totalExpenses` ยังนับส่วนแบ่งรวมอยู่เหมือนเดิม** (เป็นเงินที่ออกจากร้านจริง) — ที่เพิ่มมา
เป็นแค่การแยกให้*แสดงผล*ได้สองมุม **ห้ามถอดออกจาก `totalExpenses`** จะทำให้ยอด ส.ค. 69 ที่
กระทบกับ Excel ไว้แล้วเพี้ยนทันที

**⚠️ กฎการจับว่าอะไรคือ "ส่วนแบ่ง" ต้องแคบเสมอ** — คำว่า "หุ้นส่วน" เฉยๆ ไม่พอ ต้องมี `%`
หรือคำว่า "ส่วนแบ่ง" ด้วย เพราะมีอีกสองอย่างที่ห้ามถูกนับผิด:
`"เงินเดือนหุ้นส่วนผู้จัดการ (ไม่หัก ปกส.)"` = เงินเดือน · `"คืนเงินหุ้นส่วน"` (02/2569) = คืนทุน
มีเทสต์ล็อกไว้ใน `npm run test:expenses` ข้อ [8] แล้ว

### ⚠️ บทเรียน: "ค่าที่ปรึกษา" คือเงินเดือนหุ้นส่วนที่ตั้งชื่อผิด — อย่าเพิ่งสรุปว่าข้อมูลขาด
Excel มีแถว "ไมโล 10,000" ในค่าแรงพนักงาน แต่ `sc_opex` ไม่มีแถวชื่อนั้นเลยใน 06/2026 และ
07/2026 ⇒ **สรุปผิดว่าข้อมูลหาย แล้วบันทึกเพิ่มไป ฿10,000/เดือน (id 2108, 2109)**
ที่จริงเงินก้อนนั้นอยู่ในระบบมาตลอด แต่ถูกตั้งชื่อว่า **`ค่าที่ปรึกษา`** ฝังใน `misc_items_json`
⇒ กลายเป็นนับซ้ำ · เจ้าของยืนยัน 2026-09-08 ว่าเป็นเงินเดือนหุ้นส่วน จึง **ลบแถวที่เพิ่มเกินทั้งสอง
และเปลี่ยนชื่อรายการเดิมเป็น `เงินเดือนหุ้นส่วน`** (ยอดเงินไม่เปลี่ยน · audit ครบทั้ง DELETE/UPDATE)

**วิธีที่ควรใช้ก่อนสรุปว่า "ข้อมูลหาย":** ไล่ยอดรวมให้ลงตัวก่อนเสมอ — ตอนนั้นถ้าบวกของที่ขาดจริง
(รายการน้ำยา/ของใช้) เข้าไปก่อน จะเห็นทันทีว่ายอดตรงกับ Excel พอดีโดยไม่ต้องเติมเงินเดือนเลย
ชื่อรายการที่ไม่ตรงกันไม่ได้แปลว่าเงินไม่มี — ใน `sc_opex` ที่เป็น key-value free-text
**ของชิ้นเดียวกันถูกเรียกคนละชื่อได้ทุกเดือน**

หมายเหตุ: 01/2026 และ 02/2026 ยังมีรายการชื่อ `ค่าที่ปรึกษา` ฿12,000 อยู่ (น่าจะเรื่องเดียวกัน)
— เจ้าของแจ้งว่าจะกลับไปแก้ย้อนหลังเอง **อย่าไปแก้ให้โดยไม่ถาม**

### กระทบยอด "รายจ่ายอื่นๆ" มิ.ย./ก.ค. ทีละบรรทัดแล้ว — เหลือข้อเดียว
เทียบรายการต่อรายการกับตาราง "รายจ่ายอื่นๆ" ใน Excel (รวม 13,518.00 มิ.ย. · 4,254.00 ก.ค.)
พบว่าต่างกันแค่ 2 เรื่อง แล้วบันทึกฝั่งที่ขาดไปแล้ว:

- **ระบบขาดของที่ซื้อจริง** — บันทึกเพิ่มแล้ว (id 2110–2120 พร้อม audit): มิ.ย. 5 รายการ
  ฿3,561 (น้ำยาซักรองเท้าหนังกลับ 711 · น้ำหอม 438 · ถุงใส่รองเท้า 749 · หมึกปริ้น 1,000
  · กระดาษปริ้นบิล 663) · ก.ค. 6 รายการ ฿2,284 (น้ำยา 5 รายการ + โต๊ะพับได้ 200)
- **`ค่าที่ปรึกษา` ฿10,000/เดือน ที่ Excel ไม่มี** = เงินเดือนหุ้นส่วนที่ตั้งชื่อผิด (ดูหัวข้อถัดไป)
  เปลี่ยนชื่อเป็น `เงินเดือนหุ้นส่วน` แล้ว (มิ.ย./ก.ค.) — Excel เรียกมันว่า "ไมโล" จึงหากันไม่เจอ
  **เดือนที่ยังใช้ชื่อ `ค่าที่ปรึกษา` อยู่: ธ.ค. 68 ฿10,500 · ม.ค. ฿12,000 · ก.พ. ฿12,000 ·
  มี.ค. ฿12,000 — เจ้าของยืนยัน 2026-09-08 ว่า ธ.ค. ถูกต้องแล้ว ที่เหลือเจ้าของจะแก้เอง
  ห้าม agent ไปเปลี่ยนชื่อหรือลบให้**

**ผลสุดท้าย ตรงกับ Excel ทุกบาท (กระทบยอดแล้ว 7 เดือน · 2026-09-08):**

| เดือน | ค่าใช้จ่าย | ส่วนแบ่งหุ้นส่วน | กำไรหลังแบ่ง | Excel |
|---|---|---|---|---|
| ก.พ. | 79,061.50 | — | **3,023.36** | 3,023.36 ✓ |
| มี.ค. | 94,365.62 | — | **−14,075.62** | −14,075.62 ✓ |
| เม.ย. | 54,693.31 | — | **1,962.69** | 1,962.69 ✓ |
| พ.ค. | 62,603.65 | 2,766 | **11,066.07** | 11,066.07 ✓ |
| มิ.ย. | 76,108.34 | 3,587 | **14,351.66** | 14,351.66 ✓ |
| ก.ค. | 68,992.06 | 5,269 | **21,079.52** (ตามบิล) | 21,079.52 ✓ |
| ส.ค. | 82,067.51 | — | **24,524.79** (เงินเข้าจริง) | 24,524.79 ✓ |

**รายได้ตรงกับ Excel เป๊ะทุกเดือนอยู่แล้ว** ส่วนที่ต่างเป็นค่าใช้จ่ายล้วนๆ — ก.พ./มี.ค./เม.ย.
ขาดของที่ซื้อจริง (บันทึกแล้ว id 2121–2124: น้ำยาขจัดคราบ 2,000 · ซื้อของเข้าร้าน 2,803 /
4,899.01 / น้ำยาขจัดคราบ 2 ขวด 830)

**พ.ค. 69 ปิดแล้ว:** ของที่ซื้อ 9 รายการ (฿4,956) ถูกบันทึกไว้ที่ฝั่งคลังสินค้าอย่างเดียว
หน้าการเงินจึงไม่เคยนับ — คัดลอกมาลง `sc_opex` แล้ว (id 2125–2133) และพิสูจน์ได้ว่าครบพอดี:
รายการ "ซื้อของเข้าร้าน" 2 บรรทัดของ Excel (1,496 + 5,405 = 6,901) = ของที่อยู่ใน `sc_opex`
อยู่แล้ว (อะไหล่เครื่องฉีดน้ำ 225 + ตะกร้าผ้าอีเกีย 492 + Shoppee 1,228 = 1,945) + ฝั่งคลัง 4,956

**หมายเหตุการอ่านตาราง:** ก.พ./มี.ค. Excel เอา `ค่าจ้างเจ` · `ไมโล (ค่าที่ปรึกษา)` ·
`คืนเงินหุ้นส่วน` ไปไว้ในหมวด "ค่าแรงพนักงาน" ส่วนระบบเก็บไว้ใน `misc_items_json`
— **คนละช่องแต่เป็นเงินก้อนเดียวกัน ไม่ใช่ส่วนต่าง**

ส่วนต่างที่เหลือเป็นเรื่องเกณฑ์ล้วนๆ ไม่ใช่บั๊ก: ก.ค. เงินเข้าจริง 20,879.52 (บิลค้าง 200)
· ส.ค. ตามบิล 26,624.79 (บิล 21 ส.ค. ที่ลูกค้าโอน 1 ก.ย. ฿2,100)

## 💰 หน้าภาพรวมใช้เกณฑ์ "เงินเข้าจริง" แล้ว (2026-09-07) — ห้ามเปลี่ยนกลับโดยไม่ถามเจ้าของ

**กำไรสุทธิที่หน้า `/dashboard` = เงินเข้าจากบริการ + รายรับห้องเช่า − ค่าใช้จ่ายทั้งหมด**
ยืนยันกับ Excel ที่เจ้าของกระทบยอดเองแล้วตรงเป๊ะ: ส.ค. 2569 = **฿24,524.79**

เดิมหน้านี้คำนวณ `total_revenue − ค่าใช้จ่าย` = ฿20,624.79 ซึ่งผิด 2 เรื่องพร้อมกัน:

| เรื่อง | ผลต่าง |
|---|---|
| ใช้ยอด**ตามบิล** (accrual) แทนเงินที่เข้าจริง — รวมบิล 21 ส.ค. ที่ลูกค้าโอน 1 ก.ย. | −2,100 |
| **ไม่นับรายรับค่าเช่าห้องชั้น 3 เลย** ทั้งที่เป็นรายรับของร้าน | +6,000 |
| | **รวม 3,900** |

**สูตรเงินเข้าจริง:** `Σ sc_sales.amount_paid ของบิลในช่วงนั้น` + `Σ sc_payments.amount ที่
received_date อยู่ในช่วงนั้น` — ตัวหลัง **ต้องกรองด้วย `received_date` ไม่ใช่ `sale_date`**
เพราะสนใจว่า "เงินเข้าวันไหน" ไม่ใช่ "เป็นของบิลวันไหน"

**ยอดค้างชำระต้องสอดคล้องกับเกณฑ์รายรับด้วย:** เดิมการ์ด "ยอดค้างชำระ" หักด้วย `sc_payments`
**ทุกแถวไม่สนใจว่าเงินเข้าวันไหน** ⇒ ยอด 2,100 ของบิล 21 ส.ค. ที่โอนวันที่ 1 ก.ย. ถูกนับว่า
"จ่ายแล้ว" ตั้งแต่เดือนสิงหาคม พอรายรับเปลี่ยนไปใช้เกณฑ์เงินเข้าจริง ยอดนี้เลย **หายไปจากทั้งสองฝั่ง**
(ไม่เป็นรายรับ และไม่เป็นลูกหนี้) งบไม่บาลานซ์ — แก้ให้นับเฉพาะเงินที่เข้า **ภายในสิ้นช่วงเวลาที่เลือก**

ผลลัพธ์ที่กระทบยอดได้: `ยอดตามบิล 102,692.30 − เงินเข้าจริง 100,592.30 = ยอดค้าง 2,100.00` พอดี
พอเปลี่ยนไปดูเดือนกันยายนยอดค้างกลายเป็น 0 และ 2,100 ไปโผล่เป็นรายรับของเดือนนั้นแทน
ตารางรายวันใช้ map ตัวเดียวกันกับการ์ดสรุป จะได้ไม่บอกคนละเรื่องในบิลใบเดียวกัน

ตรวจข้ามเดือนแล้วถูกต้องทุกเดือน (ก.ค. ฿23,163.52 · มิ.ย. ฿17,912.66 · ก.ย. รับ 2,100 ที่ค้างจาก
ส.ค. มาถูกต้อง) — การ์ดรายรับแสดงยอดตามบิลกำกับไว้ด้วยเมื่อยังมีหนี้ค้าง จะได้เห็นทั้งสองมุม

## 🧬 database.types.ts generate จากฐานข้อมูลจริงแล้ว — เลิกใช้ `as any` (2026-09-06)

**ห้ามแก้ส่วน `Database` ในไฟล์นั้นด้วยมือ** สร้างใหม่ด้วย (รันบน VPS ที่มี `SUPABASE_DB_URL`):
```bash
npx --yes supabase@latest gen types typescript --db-url "$SUPABASE_DB_URL" --schema public
```
แล้วเอาเนื้อหาตั้งแต่บรรทัด `export type Json =` ลงไปมาแทนที่ (เก็บ header + type ที่เขียนมือไว้)
**เครื่อง dev ไม่มี Supabase CLI — ต้อง generate ผ่าน VPS เท่านั้น** (npx ใช้ได้ที่นั่น)

### ทำไมเรื่องนี้สำคัญกว่าที่คิด
ไฟล์ types เดิมเขียนมือและมีแค่ตารางฝั่งคลังสินค้า ทั้งโปรเจกต์จึงต้องเขียน
`(supabase.from("sc_x" as any) as any)` = **ปิดตา TypeScript ทั้งหมด** พอ generate ของจริง
แล้วถอด `as any` ออก 133 จุด TypeScript ชี้บั๊กที่พังเงียบมานานทันที **7 จุด**:

| จุด | อาการจริง |
|---|---|
| `stock.ts` เรียก RPC ผิดชื่อ (`fn_set_min_stock_level`, `fn_approve_adjustment` — ของจริงมี prefix `inv_`) | ตั้งจุดสั่งซื้อขั้นต่ำ + **อนุมัติ adjustment (กฎข้อ 3)** ไม่เคยทำงานบน production |
| `/adjustments` query view `v_stock_transactions` ที่ไม่มีจริง | หน้าอนุมัติว่างเปล่าตลอด |
| `inventory.ts` เขียน `last_counted_at`/`unit_cost` ที่ไม่มี + `txn_type` นอก enum | แก้จำนวนสต๊อกจากหน้าคลัง **ล้มทั้ง statement** และไม่บันทึก ledger |
| `import-export.ts` `item_name`/`total_amount` (ของจริง `name`/`amount`) | นำเข้าค่าใช้จ่ายพัง |
| `pos.ts` insert ผิดชื่อ 6 คอลัมน์ + `customers.branch_id` ที่ไม่มี | รับงานบริการบันทึกไม่ได้เลย (0 แถวมาตลอด) |
| `pos/page.tsx` อ่าน `gross_amount`/`notes` | ยอดเงินโชว์ 0 |
| `deleteExpense` เทียบ bigint กับ string | ลบไม่โดนแบบเงียบเมื่อได้ id สังเคราะห์ |

**ทั้ง 7 จุดไม่มี error ให้เห็นเลยตอนใช้งาน** เพราะโค้ดส่วนใหญ่ไม่เช็ค `error` ที่ Supabase คืนมา

### กฎใหม่
- **ห้ามเพิ่ม `as any` ใหม่** ถ้า type ไม่ตรง แปลว่าโค้ดผิด ไม่ใช่ type ผิด
- **view alias ทำให้ทุกคอลัมน์เป็น nullable** (`items`, `item_stock`, `branches`, `audit_logs`, …)
  ใช้ตัวช่วยใน `lib/db-rows.ts` (`withId` / `text` / `num` / `bool`) จัดการ null แทนการ cast ทับ
- **เพิ่มคอลัมน์/ตาราง/ฟังก์ชันใหม่บน production แล้วต้อง regenerate types เสมอ** ไม่งั้นโค้ดใหม่
  จะเขียน `as any` เพื่อให้ผ่าน แล้ววนกลับไปปัญหาเดิม

## ⚡ RLS ผ่าน Supabase Advisor หมดทุกข้อแล้ว (2026-09-06)

| Advisor | สถานะ |
|---|---|
| Security Definer View (12 ตัว) · RLS Disabled (4 ตาราง) | ✅ `0016` |
| Function Search Path Mutable (2 ตัว) | ✅ `0019` |
| Auth RLS Initialization Plan (6 policy) | ✅ `0020` — ครอบ `auth.uid()` เป็น `(select auth.uid())` |
| Multiple Permissive Policies | ⬜ **จงใจไม่แก้** — `inv_stock_transactions` มี INSERT policy 3 ตัวแยกตาม role ซึ่งอ่านแล้วเข้าใจทันทีว่าใครทำอะไรได้ การยุบเป็นเงื่อนไข OR ก้อนเดียวทำให้ตรวจทานยากขึ้นมาก แลกกับความเร็วที่ตาราง ~110 แถวไม่รู้สึก |
| Leaked Password Protection | ⬜ **ต้องกดที่ Dashboard** → Authentication → เปิด "Leaked password protection" |
| Extension in Public (`vector`) | ⬜ ย้ายเสี่ยงกว่าผลที่ได้ ปล่อยไว้ |

**`profiles_update` เปลี่ยนจาก EXISTS ที่ query `profiles` ซ้อนตัวเอง มาใช้ `sc_get_my_role()`**
(SECURITY DEFINER) — เร็วกว่าและกัน error "infinite recursion detected in policy" ที่เป็นกับดัก
คลาสสิกของ RLS ที่อ้างตารางตัวเอง

## ✅ พร้อมรับพนักงานเข้าระบบแล้ว (2026-09-07) — เจอบั๊ก 2 ตัวที่ไม่มีทางเจอด้วยบัญชี admin

ทดสอบด้วยการ **สร้างบัญชี staff จริงแล้วยิง query ดู** (`npm run test:staff`) พบว่าเดิม
เชิญพนักงานเข้าระบบไม่ได้เลย และต่อให้เข้าได้ก็ใช้งานไม่ได้:

1. **[`0022`] `profiles.role` มี CHECK constraint ที่ไม่รับค่า `'staff'`**
   constraint เดิมรับแค่ `admin` / `co-admin` / `manager` แต่ฟอร์ม `/admin/users` ส่ง
   `co_admin` และ `staff` (underscore) ⇒ **เชิญผู้ใช้ทุก role ยกเว้น admin ล้มเหลวมาตลอด**
   = กฎข้อ 13 ใช้งานจริงไม่ได้เลย · แก้โดยให้ constraint ยอมรับทั้งสองการสะกด
   (ระบบมีตัวแปลง `-`↔`_` อยู่แล้วทั้งสองทิศ การไล่แก้ให้เหลือสะกดเดียวเสี่ยงล็อกตัวเองออกจากระบบ)
2. **[`0023`] `inv_fn_current_branch()` ยังอ่านจาก `sc_users`**
   `0017`/`0019` ย้ายฟังก์ชัน role มาอ่าน `profiles` แล้ว แต่ลืมตัวนี้ ⇒ staff ได้ branch = null
   ⇒ staff-safe view กรอง `branch_id = null` เป็น false เสมอ ⇒ **เห็นสต๊อกเป็น 0 ทุกช่อง**

**⚠️ ทั้งสองบั๊กไม่มี error ให้เห็น** ผู้ใช้เห็นแค่หน้าจอว่างหรือเลข 0 ซึ่งดูเหมือน "ยังไม่มีข้อมูล"
มากกว่า "สิทธิ์ผิด" — และ **ไม่มีทางเจอถ้าทดสอบด้วยบัญชี admin** เพราะ admin ผ่านทุกเงื่อนไข

**ตั้งแต่นี้ไป `profiles` คือตารางเดียวที่ใช้ตัดสินสิทธิ์** ทั้ง role และ branch
`sc_users` เหลือไว้เพื่อความเข้ากันได้กับระบบเดิม (GAS) และ FK ของ `inv_audit_logs.performed_by`
ที่ลบไม่ได้ตามกฎข้อ 1 เท่านั้น — **ห้ามเอามาใช้ตัดสินสิทธิ์อีก**

### staff-safe view คืนสภาพแล้ว (`0021`)
`inv_v_item_stock` / `inv_v_low_stock` **ไม่มีคอลัมน์ต้นทุนอยู่แล้วตั้งแต่ต้น** และมี WHERE กรอง
role/สาขาในตัว — `0016` เผลอตั้งเป็น `security_invoker = on` ทั้งชุด ทำให้ RLS ซ้อนอีกชั้นจน
staff อ่านไม่ได้เลย · คืนเป็น definer แล้ว (ปลอดภัยเพราะไม่มีต้นทุน + กรองสิทธิ์เอง + anon ถูก revoke แล้ว)

**หลักการตัดสินว่า view ไหนควรเป็นโหมดไหน (ใช้กับ view ใหม่ทุกตัว):**
- view **ไม่มี**ตรรกะสิทธิ์ในตัว → `security_invoker = on` เสมอ ไม่งั้นเป็นประตูหลังข้าม RLS
- view **มี** WHERE กรองสิทธิ์ **และ** เลือกเฉพาะคอลัมน์ปลอดภัย → definer ได้ (staff-safe pattern)
- **มีคอลัมน์ต้นทุนอยู่ = ห้ามเป็น definer เด็ดขาด** (`inv_v_inventory_value`,
  `inv_v_monthly_cogs`, `inv_v_top_consumed_items_30d` จึงต้องคง invoker ไว้)

### `/inventory` เลิก query `item_stock` ตรงๆ แล้ว
เดิม `join item_stock` มาทั้งก้อนแล้วค่อยซ่อนต้นทุนตอนแสดงผล = ผิดกฎข้อ 5 และพนักงานอ่านไม่ได้
ตอนนี้อ่านจำนวนจาก `v_item_stock` (staff-safe) ส่วนต้นทุนดึงแยกเฉพาะคนที่ `canSeeCost()` เป็นจริง
**ข้อมูลต้นทุนจึงไม่ถูกส่งมาที่เบราว์เซอร์ของพนักงานตั้งแต่แรก ไม่ใช่แค่ซ่อนไว้**

### `npm run test:staff`
เทสต์ใหม่ที่สร้างบัญชี staff ชั่วคราวบน production จริง → ล็อกอิน → ตรวจว่าอ่านอะไรได้/ไม่ได้ →
ลบทิ้ง **ไม่ได้อยู่ใน CI** เพราะแตะฐานข้อมูลจริง ให้รันเองทุกครั้งที่แก้ RLS / role / staff-safe view
(บัญชีลบทิ้งได้สะอาดเพราะเทสต์อ่านอย่างเดียว ไม่เขียน audit log จึงไม่ติด FK)

## 🔒 ผลตรวจช่องโหว่ + สิ่งที่ปิดไปแล้ว (2026-09-06, กลางคืน)

ตรวจด้วยการ **ยิง REST API จริงด้วย publishable key** ที่ฝังอยู่ในหน้าเว็บ (ใครเปิด DevTools ก็ก๊อปได้)
ไม่ใช่การอ่านโค้ดเดา — พบว่าข้อมูลจริงอ่านได้โดยไม่ต้องล็อกอินหลายตาราง **ปิดครบแล้วด้วย
migration `0014` + `0015`** (ยิงซ้ำหลังปิดแล้วไม่เห็นข้อมูลสักตาราง)

| ตาราง | สิ่งที่เคยหลุด | ปิดด้วย |
|---|---|---|
| `sc_payments` | ประวัติรับชำระเงิน **+ เพิ่ม/แก้ยอดได้จากภายนอก** | 0015 |
| `profiles` | username/ชื่อจริง/role ของผู้ใช้ทุกคน | 0015 |
| `customers` | ชื่อ+เบอร์โทรลูกค้า (ไม่มี RLS เลย) | 0014 |
| `inv_branches` | `telegram_chat_id` ของกลุ่มพนักงาน | 0014 |
| `inv_items`, `ui_permissions` | แคตตาล็อก/ตารางสิทธิ์ | 0014 |

**สาเหตุ 2 ชั้นที่ต้องจำไว้:**
1. `create policy ... using (true)` **ที่ไม่ใส่ `TO authenticated`** → Postgres ตีเป็น role `public`
   ซึ่ง**รวม `anon`** อ่านโค้ดผ่านๆ นึกว่าปิดแล้ว แต่จริงๆ เปิดให้ทุกคนบนอินเทอร์เน็ต
2. **อย่าเชื่อชื่อ policy** — `profiles_select_authenticated` ชื่อบอกว่า authenticated แต่ `roles`
   จริงคือ `{anon,authenticated}` ใส่ anon ไว้ตรงๆ (0014 จึงกรองไม่เจอเพราะไล่หาแต่ `{public}`)
   **ตรวจจาก `select policyname, roles from pg_policies` เสมอ ไม่ใช่จากชื่อหรือจากไฟล์ migration**

**ทำไมปิดได้โดยแอปไม่พัง:** ไม่มีไฟล์ไหนใน `app/`, `components/`, `lib/` import
`lib/supabase/client.ts` เลย ทุก query วิ่งผ่านฝั่งเซิร์ฟเวอร์ (session ของผู้ใช้ = `authenticated`
หรือ service_role ที่ข้าม RLS อยู่แล้ว) — role `anon` ไม่เคยถูกใช้อ่าน/เขียนข้อมูลจริงเลย

**ทำไมกล้าปิด `sc_payments` ทั้งที่ระบบเดิมยังใช้อยู่:** legacy ส่ง `formType: 'save_payment'`
และ `'save_opex'` ไปที่ Google Apps Script — แต่ policy ของ `sc_opex` เป็น `{authenticated}` ล้วน
มาก่อนแล้ว และใน `sc_opex` มีแถวที่ legacy เขียนลงวันที่ 27 ส.ค. 2569 ⇒ ถ้า GAS ใช้ anon จริง
`save_opex` ต้องพังไปแล้ว แต่มันไม่พัง ⇒ GAS ใช้ service_role หรือ session ที่ล็อกอินแล้ว
**ถ้าหน้าการเงินระบบเดิมบันทึกไม่ได้ขึ้นมา = สมมติฐานนี้ผิด ย้อนได้ทันทีที่
`supabase/migrations/rollback/0015_rollback.sql`**

### ✅ ช่องโหว่สองข้อที่เคยค้าง — ปิดแล้วทั้งคู่ (ตรวจซ้ำกับของจริง 2026-09-08)

1. ~~`anon` ยังมี GRANT ระดับตารางครบทุกอย่าง~~ → `0016` `revoke all ... from anon`
   **ยิงจริงด้วย publishable key แล้วได้ 401 `permission denied`** ทั้ง `sc_opex` และ
   `integration_secrets` (ไม่ใช่ `[]` ที่แปลว่า RLS กันไว้ แต่เป็นการกันตั้งแต่ระดับ GRANT)
2. ~~Staff เห็นและแก้ข้อมูลเงินได้ทุกอย่าง~~ → `0017` เปลี่ยน `sc_opex`/`sc_opex_history`
   เหลือเฉพาะ `admin`/`co-admin` ผ่าน `sc_get_my_role()` · `sc_sales`/`sc_payments`
   **จงใจไม่แตะ** เพราะพนักงานหน้าร้านต้องบันทึกยอดขายรายวัน (ยอดขายไม่ใช่ข้อมูลต้นทุนตามกฎข้อ 5)

## Deploy ล่าสุด (2026-09-08, รอบดึก — ฟอนต์ Prompt + /expenses เร็วขึ้น)

- **production รัน commit `9bf4d81`** — `npm run deploy` สำเร็จ
- **ยืนยันฟอนต์จาก CSS ที่ production เสิร์ฟจริง** ไม่ใช่แค่ดูโค้ด:
  `curl <css ที่หน้า /login โหลด> | grep font-family` → `font-family:Prompt` ·
  `Prompt Fallback` (next/font สร้าง fallback metric-matched ให้เอง กัน layout shift)
- ตรวจหลัง deploy: `/login` 200 · `/account` 307 · `/expenses` 307 · PM2 online
- **หมายเหตุวิธีตรวจ:** grep หาคำว่า "Prompt" ใน HTML จะไม่เจอ เพราะ next/font ฝังฟอนต์เป็น
  ชื่อคลาสที่ถูก hash ไว้ ต้องตามไปดูไฟล์ CSS ที่หน้านั้นโหลดจริงเสมอ

<details><summary>Deploy ก่อนหน้า (2026-09-08 — /account + user management)</summary>

- **production รัน commit `d420290`** — `/login` 200 · **`/account` 307** (หน้าใหม่ขึ้นแล้ว —
  307 คือถูกต้อง แปลว่าบังคับล็อกอิน) · `/dashboard` 307 · `/admin/users` 307
  · PM2 `sneakercare` online · unstable restarts 0
- crontab บน VPS มี `0 4 1 * *` ของ CSV รายเดือนแล้ว (ยืนยันด้วย `crontab -l`)

</details>

<details><summary>Deploy ก่อนหน้า (2026-09-08 — การ์ดกำไรก่อน/หลังแบ่ง)</summary>

- **production รัน commit `bd1bfba`** — `/login` 200 · `/dashboard` 307 · `/expenses` 307

</details>

<details><summary>Deploy ก่อนหน้า (2026-09-06 12:30)</summary>

- **production รัน commit `c47db0a`** — `npm run deploy` (clean rebuild + PM2 restart) สำเร็จ
- ตรวจหลัง deploy: `/login` 200 · `/dashboard` 307 · PM2 `sneakercare` online · unstable restarts 0
  · ไม่มี legacy JWT หลงเหลือใน `.next` · `.env.local` บน VPS ใช้ key แบบใหม่ครบทั้ง 2 ค่า
- migration `0012` / `0013` อยู่บนเครื่องแล้ว (ทั้งคู่ apply บน production ไปแล้วเช่นกัน — `0012`
  เป็น no-op และ `0013` รันด้วยมือผ่าน `cron.unschedule()` ไปก่อนหน้านี้)
- **หมายเหตุ:** คอมมิตที่แก้แต่เอกสาร (`CLAUDE.md`/`HANDOFF.md`) ไม่จำเป็นต้อง deploy ตาม
  เพราะไม่มีผลกับแอปที่รันอยู่ — VPS ตามหลัง repo อยู่ 1 คอมมิตเอกสารถือว่าปกติ ไม่ใช่ของเสีย

</details>

## สถานะงานล่าสุด (2026-09-06, บ่าย — rotate API key ไป key แบบใหม่สำเร็จ)

`service_role` key เก่าที่เคยหลุดใน git history ถูกแทนที่แล้วทุกจุดที่เราควบคุมได้ **เหลือแค่กด
disable ของเก่าที่ Dashboard** (ดูหัวข้อ 🔴 ด้านบน)

**สิ่งที่เปลี่ยน:** `anon` (legacy JWT) → `sb_publishable_…` · `service_role` (legacy JWT) → `sb_secret_…`

**ทำที่ไหนบ้าง (3 จุด — ห้ามลืมจุดที่ 3):**
1. `.env.local` บนเครื่อง dev (สำรองไฟล์เดิมไว้นอก repo แล้ว)
2. `/var/www/sneakercare/.env.local` บน VPS (สำรองเป็น `.env.local.bak-20260906-121603`)
   แล้ว **rebuild ใหม่ทั้งหมด** ไม่ใช่แค่ restart — `NEXT_PUBLIC_*` ถูกฝังตอน build
   ยืนยันแล้วว่า bundle ที่ deploy อยู่ไม่มี legacy JWT หลงเหลือแม้แต่ที่เดียว
3. **Supabase Vault `inv_service_role_key`** — cron แจ้งเตือนสต๊อกอ่าน key จากที่นี่ ไม่ใช่จาก
   env ของแอป **ถ้าลืมจุดนี้ แจ้งเตือนจะตายเงียบโดยไม่มีใครรู้**

**ทดสอบจริงที่ผ่านแล้ว (ไม่ใช่แค่ดูโค้ด):**
- ล็อกอิน `admin@ddserviceth.com` ผ่าน key ใหม่ → สำเร็จ
- service_role: อ่าน `sc_sales` ข้าม RLS ได้ + `auth/v1/admin/users` → 200
- publishable: `auth/v1/settings` → 200 · อ่าน `sc_sales` โดยไม่ล็อกอินได้ `[]` (RLS ยังกันอยู่)
- production: `/login` 200 · `/dashboard` 307 · PM2 online · unstable restarts 0
- **เส้นทาง cron ทั้งเส้น**: ยิง `inv-low-stock-alert` ด้วย pg_net + key จาก Vault → **200**
  `{"status":"ok","results":[{"branch":"SneakerCare","sent":0}]}` (`sent:0` เพราะ 4 รายการที่ต่ำกว่า
  ขั้นต่ำถูก mute ไว้ทั้งหมด จึงไม่มีข้อความหลุดเข้ากลุ่มพนักงานจากการทดสอบ)

**เทคนิคที่ใช้ทดสอบ auth ของ Edge Function โดยไม่ต้องเรียกฟังก์ชันจริง** (กันส่ง Telegram เกินจำเป็น):
ยิงไปที่ชื่อฟังก์ชันที่ไม่มีอยู่ — ได้ `404` = auth ผ่านแล้วแต่ไม่เจอฟังก์ชัน, ได้ `401` = key ใช้ไม่ได้

**หมายเหตุ:** error `Invalid Refresh Token` ใน PM2 log เป็นของเก่าตั้งแต่ 11:31 (ก่อน rotate 12:16)
ไม่ได้เกิดจากการเปลี่ยน key — การ rotate API key ไม่ทำให้ session ผู้ใช้ที่ล็อกอินค้างไว้หลุด
(คนละเรื่องกับการ rotate JWT secret)

## สถานะงานล่าสุด (2026-09-06 — reset รหัสผ่าน admin, ปิดช่องว่าง disaster recovery ของตาราง sc_*)

1. **[ทำแล้ว] รีเซ็ตรหัสผ่านบัญชี admin ทั้งสองบัญชี** (`admin@ddserviceth.com`,
   `milo@ddserviceth.com`) เป็นรหัสสุ่ม 20 ตัวอักษร ผ่าน `scripts/set-admin-pw.mjs` แล้ว
   **ยืนยันด้วยการล็อกอินจริง** ผ่าน `scripts/test-login.mjs` ทั้งคู่ (ไม่ใช่แค่ API ตอบ 200)
   — รหัสผ่านส่งให้เจ้าของในแชท ไม่ได้เขียนลงไฟล์ใดในโปรเจกต์และไม่ได้ commit
2. **[ปิดช่องว่างใหญ่] `0012_sc_tables_baseline.sql` — ตาราง `sc_*` ถูก track ใน migrations แล้ว**
   เดิมตาราง `sc_employees`, `sc_expenses`, `sc_opex`, `sc_opex_history`, `sc_payments`,
   `sc_sales`, `sc_settings`, `sc_users` ถูกสร้างบน production โดยตรงนอกระบบ migration
   ผลคือกู้ระบบขึ้นโปรเจกต์ใหม่จาก `supabase/migrations/` อย่างเดียวจะไม่มีโมดูลการเงินเลย
   - ที่มาของนิยาม: `pg_dump --schema-only -t 'public.sc_*'` จาก production ผ่าน VPS (อ่านอย่างเดียว)
   - ทุก statement มี guard — **ตรวจกับ production จริงแล้วว่าเป็น no-op สนิท** (ทุกตาราง/index/
     policy/trigger/constraint มีอยู่แล้วครบ และนิยาม `sc_get_my_role()` ตรงกันเป๊ะ)
   - `sc_users.branch_id` FK เลือกเป้าหมายอัตโนมัติระหว่าง `inv_branches` (prod) กับ `branches`
     (local/CI) เพราะสองสภาพแวดล้อมนี้ชื่อตารางไม่ตรงกัน (ดูเรื่อง alias ใน CLAUDE.md)
   - **⚠️ `sc_get_my_role()` ต้องประกาศ *หลัง* `create table sc_users` เสมอ** — เป็น `language sql`
     ซึ่ง Postgres ตรวจ body ตอนสร้างฟังก์ชัน ถ้าวางไว้บนสุดจะ error `relation "sc_users" does not
     exist` ทันทีบนฐานข้อมูลใหม่ (เจอจากการรันจริง ไม่ใช่จากการอ่านโค้ด)
3. **[เทสต์ใหม่] `scripts/test-migration-0012.mjs`** — รัน 0011 → 0012 ต่อกันบน Postgres จริง
   (PGlite/WASM ไม่ต้องมี Docker) ตรวจ 30 ข้อ: ตาราง/index/policy/RLS/FK/unique ครบ, รันซ้ำได้,
   เขียน-อ่านข้อมูลจริงได้, และ `sc_expenses` ต้องไม่มี policy เลยตามที่ production เป็นอยู่
   `npm run test:migration` รันทั้ง 0011 และ 0012 แล้ว
4. **[แก้บั๊กของเครื่องมือเทสต์เอง] `npm run test:migration` คืน exit code 127 ทุกครั้งแม้เทสต์ผ่านหมด**
   — `process.exit()` ถูกเรียกทั้งที่ worker ของ PGlite ยังเปิดอยู่ libuv จึง abort
   (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`) แปลว่า CI ที่รันคำสั่งนี้จะแดงเสมอ
   โดยไม่เกี่ยวกับ SQL เลย แก้เป็น `await db.close()` แล้วตั้ง `process.exitCode` แทนทั้งสองไฟล์
5. **[แก้ช่องโหว่ของการตรวจ backup] `scripts/verify-backup.sh` ตรวจไม่ครบ 5 ตาราง** — `EXPECTED_TABLES`
   มีแค่ `sc_sales`/`sc_payments`/`sc_opex`/`sc_users` ขาด `sc_employees`, `sc_expenses`,
   `sc_opex_history`, `sc_settings`, `sc_audit_logs` แปลว่าถ้า dump ขาดข้อมูลเงินเดือนทั้งก้อน
   สคริปต์จะยังรายงานว่า "ผ่าน" — เติมครบแล้ว และย้าย `sc_audit_logs` จาก `OPTIONAL_TABLES`
   ขึ้นมาเป็นตารางบังคับ (migration 0011 apply แล้ว)

**ยังทำไม่ได้ในรอบนี้ (ต้องให้เจ้าของกดเอง):** rotate `service_role` key และรหัสผ่าน Postgres —
ไม่มี `supabase` CLI และไม่มี Personal Access Token ทั้งบนเครื่อง dev และ VPS ขั้นตอนละเอียดอยู่ที่
`HANDOFF.md` งานที่ 6

## สถานะงานล่าสุด (2026-09-02, ดึกกว่านั้นอีก — พิมพ์หน้าเดียวสำเร็จแล้ว, แก้ป้ายดำ+วันที่ hardcode, modal เลื่อนขึ้นไปกดปุ่มพิมพ์/ปิดไม่ได้)

หลังแก้บั๊กพิมพ์หลายหน้าสำเร็จ (ยืนยันจากผู้ใช้ว่า "1 sheet of paper") ผู้ใช้ทักต่ออีก 2 เรื่องจาก
ภาพ print preview:
1. **[แก้แล้ว] ป้าย "PAYSLIP VOUCHER" พื้นดำทึบมุมขวาบนดูไม่เป็นทางการ** — ไม่ตรงกับรูปแบบหัวเอกสาร
   ที่ /invoicing ใช้จริง (ตัวหนาสีดำธรรมดา ไม่มีพื้นสี) เปลี่ยนเป็น "ใบจ่ายเงินเดือน" ตัวหนา +
   "Payslip Voucher" ตัวเล็กกำกับแทน ให้สไตล์เดียวกันทั้งระบบ
2. **[แก้แล้ว, เจอบั๊กจริงเพิ่ม] "วันที่จ่ายเงิน" hardcode เป็น "31 สิงหาคม 2569" ตายตัว** ไม่ว่าจะ
   พิมพ์สลิปเดือนไหน (รูปแบบเดียวกับบั๊กวันที่ hardcode ที่กวาดล้างไปรอบก่อนหน้า) เพิ่ม
   `lastDayOfMonthThai()` คำนวณจาก `selectedPayslip.month` จริง
3. **[แก้บั๊กจริง] modal สลิปเงินเดือนเลื่อนขึ้นไปกดปุ่ม "พิมพ์ A4"/ปุ่มปิดไม่ได้เมื่อเนื้อหาสูงกว่าจอ**
   — ผู้ใช้รายงาน "กดพิมสลิป แล้วขึ้นมาเต็มหน้าจอ ไปไหนต่อไม่ได้" สาเหตุ: backdrop ของ modal นี้
   (`fixed inset-0 flex items-center justify-center`) ไม่มี `overflow-y-auto` ต่างจาก modal ที่
   /invoicing และ /tax-filing ซึ่งมีอยู่แล้ว — พอเนื้อหาสูงกว่า viewport (เช่นสลิปที่มีรายการหัก
   หลายบรรทัดจากฟีเจอร์ใหม่) flex items-center จะตัดขอบบนที่ล้นทิ้งโดยไม่มีทาง scroll ขึ้นไปดู
   ปุ่มพิมพ์/ปิดที่อยู่บนสุดจึงหลุดจอไป แก้โดยเพิ่ม `overflow-y-auto` (ปิดด้วย
   `print:overflow-visible` กันกระทบตอนพิมพ์จริง) และแก้ modal อื่นในไฟล์เดียวกันที่ขาดจุดเดียวกัน
   ไปด้วยเชิงรุก (เพิ่มรายจ่าย, แก้ไขโปรไฟล์พนักงาน, เพิ่มพนักงานใหม่)
   **⚠️ [แก้ข้อสรุปนี้ 2026-09-16] การเติม `overflow-y-auto` อย่างเดียว *ไม่ได้* แก้ปัญหา**
   ผู้ใช้เจออาการเดิมซ้ำ — ต้นเหตุจริงคือ `items-center` ทำให้ส่วนที่ล้น**ด้านบน**เลื่อนไปดูไม่ได้
   ดูวิธีแก้ที่ถูกต้องที่หัวข้อ "🪟 Modal ที่สูงกว่าจอ" ด้านบน

## สถานะงานล่าสุด (2026-09-02, กลางคืน — ลบรายการค่าใช้จ่ายเบ็ดเตล็ดไม่ได้ + เจอ root cause จริงของบั๊กพิมพ์สลิปหลายหน้า)

1. **[แก้แล้ว] ลบรายการย่อยใน "ค่าใช้จ่ายเบ็ดเตล็ด" ไม่ได้** — หน้า `/expenses` แสดงรายการย่อยของ
   `sc_opex.key="misc_items_json"` (JSON array เก็บรวมในแถวเดียว) เป็นแถวๆ ในตาราง โดยใช้ id
   สังเคราะห์ `"${rowId}-misc-${itemIndex}"` เวลากดลบ ปุ่มเรียก `deleteExpense(id)` ตรงๆ ซึ่งเอา
   string นี้ไปเทียบกับคอลัมน์ `id` ที่เป็น `bigint` เลยลบไม่ได้เสมอ เพิ่ม
   `deleteMiscExpenseItem(rowId, itemIndex)` แยกต่างหาก (แก้ไข JSON แล้วเขียนทับ + ซิงค์ยอดรวม
   ในแถวคู่กัน `key="misc"` ให้ตรงกันเสมอ) ฝั่ง client ตรวจจับ id สังเคราะห์ด้วย regex แล้วส่งไป
   action ที่ถูกต้อง — ทดสอบจริงด้วยการลบ "ค่าที่ปรึกษา" 10,000 บาท ของเดือน 08/2026 ให้ผู้ใช้แล้ว
2. **[แก้แล้ว, เจอ root cause จริง] พิมพ์สลิปเงินเดือน/ใบแจ้งหนี้/ใบกำกับภาษีซ้ำหลายหน้า** — สองรอบ
   ก่อนหน้านี้แก้ผิดจุด (แก้แค่ layout/compaction) ผู้ใช้บอกให้คิดใหม่จากพื้นฐาน แล้วพบว่า:
   `@media print` ซ่อนเนื้อหาที่ไม่พิมพ์ด้วย `visibility:hidden` (เลือกแบบนี้เพื่อไม่ให้ ancestor
   ที่ถูกซ่อนบัง `.printable-area` ที่เป็นลูกข้างใน) แต่ `visibility:hidden` **ไม่ลบพื้นที่ layout**
   — เนื้อหาทั้งหน้าเว็บของ `#app-shell` ที่มองไม่เห็นยังกิน "ความสูง" อยู่เต็ม พอความสูงรวมยาวกว่า
   1 หน้า A4 เบราว์เซอร์จึงสั่งพิมพ์หลายหน้า และเพราะ `.printable-area` เป็น `position:fixed` มันถูก
   วาดซ้ำทุกหน้าตามสเปก CSS — ผลคือสลิปคนเดิมพิมพ์ซ้ำกันหลายแผ่น
   **แก้โดย:** `PrintModalPortal` (`components/print-modal-portal.tsx`) ห่อเนื้อหาด้วย
   `<div id="print-portal-root">` เสมอ, เพิ่ม `id="app-shell"` ที่ root div ของ
   `app/(app)/layout.tsx`, แล้วใช้ CSS `:has()` ใน `app/globals.css` เช็คว่ากำลังพิมพ์เอกสารที่
   portal ออกมาอยู่หรือไม่ — ถ้าใช่ ยุบ `#app-shell` ทั้งก้อนด้วย `display:none` (ปลอดภัยเพราะ
   เนื้อหาที่พิมพ์อยู่นอกมันแล้ว) และเปลี่ยน `.printable-area` จาก `fixed` เป็น `static` ให้ไหลตาม
   flow ปกติแทน หน้าที่ไม่ผ่าน portal (roster/reports) ไม่กระทบ เพราะ `#print-portal-root` ไม่มีอยู่
   ในหน้านั้น เงื่อนไข `:has()` จึงไม่ทำงาน **⚠️ ห้ามลบ `id="print-portal-root"` ออกจาก
   `PrintModalPortal` เด็ดขาด — ถ้าลบ พิมพ์เอกสารจะกลับไปพังแบบเดิมทันที**
   **ยังไม่ได้ตรวจด้วยตาจริงในเบราว์เซอร์** (extension `claude-in-chrome` ยังต่อไม่ติดตลอดทั้ง
   session นี้) ยืนยันแค่ logic/CSS cascade + build ผ่าน — รอผู้ใช้ลองพิมพ์จริงแล้วยืนยัน

## สถานะงานล่าสุด (2026-09-02, ดึกมาก — ยอด "รวมค่าใช้จ่ายทั้งหมด" ผิดมาตลอด แก้ 3 บั๊กจริง)

ผู้ใช้ทักว่ายอด "รวมค่าใช้จ่ายทั้งหมด" ที่หน้า `/expenses` ไม่ตรง — ไล่ตรวจ `fetchAllExpensesData()`
ใน `app/actions/expenses.ts` กับข้อมูลจริงใน `sc_opex` ตรงๆ (ไม่ใช่แค่อ่านโค้ด) พบว่า **OPEX รวม
รายการที่ไม่ควรอยู่ในนั้นเลย 3 เรื่อง ซ้อนกันมาตลอดทุกเดือนที่ระบบนี้มีข้อมูล:**

1. **รายรับห้องเช่า (`category="rental_income"`) ถูกนับเป็นรายจ่าย** — filter เดิมเช็ค
   `r.category !== "rental_meter"` (ชื่อ category คนละตัวกับ `rental_income` ที่ใช้เก็บรายรับจริง)
   ไม่เคยกรองรายรับห้องเช่าออกเลย เดือน ส.ค. 69 เดือนเดียวมีรายรับห้องเช่า ฿6,000 ที่โดนบวกเข้า
   ยอดค่าใช้จ่ายผิดๆ (**บวก ไม่ใช่หัก** — ยิ่งทำให้ยอดรวมสูงเกินจริง)
2. **เงินเดือนพนักงานถูกนับซ้ำสองรอบ** — แถว `key="emp_ชื่อพนักงาน"` (`category="ค่าแรงพนักงาน"`)
   ที่ `saveStaffPayrollAdjustment()` เขียนไว้เป็นยอด netPay ของแต่ละคน **ผ่าน filter หลักเข้าไปนับ
   ใน OPEX ด้วย** ทั้งที่ยอดเดียวกันนี้ถูกนับใน `totalPayroll` (จาก `payslips.reduce(netPay)`)
   อยู่แล้ว — เดือน ส.ค. 69 เดือนเดียวเงินเดือนถูกนับซ้ำไปประมาณ ฿27,275 **นี่คือตัวที่กระทบเยอะที่สุด**
   เพราะเกิดขึ้นทุกเดือนที่มีการบันทึกเงินเดือนผ่านหน้านี้ (คือแทบทุกเดือน)
3. **[แก้ตัวเอง — รอบแรกเข้าใจผิด] แถวสรุปรายจ่ายเบ็ดเตล็ด (`key="misc"`) กับรายละเอียดแตกรายการ
   (`key="misc_items_json"`) เป็นยอดเดียวกัน ไม่ใช่คนละยอด** — ตอนแรกเข้าใจผิดว่า
   `misc_items_json` (รายการย่อยเช่น "ค่าที่ปรึกษา", "ค่าน้ำมันรถ") หายไปจากยอดรวมเพราะ filter
   เช็ค `r.category === "misc_items_json"` ผิด (ของจริง `key="misc_items_json"`) จึง "แก้" ด้วยการ
   ดันยอดย่อยเข้า `totalOpex` เพิ่ม — **ตรวจข้ามเดือนย้อนหลังทั้งหมดแล้วพบว่าแถว `key="misc"` (ยอดรวม
   ก้อนเดียว) มีค่าตรงกับผลรวมของ `misc_items_json` เป๊ะทุกเดือน** แปลว่าเป็นข้อมูลชุดเดียวกัน แถว
   `misc` ผ่าน filter หลักเข้านับอยู่แล้วตั้งแต่ต้น การดันรายการย่อยเข้าไปอีกจึงกลายเป็นนับซ้ำสอง
   **แก้จริงคือ:** กันแถวสรุป `key="misc"` ออกจาก filter หลัก แล้วใช้ `misc_items_json` เป็นแหล่งเดียว
   ทั้งยอดรวมและรายละเอียดที่แสดงในตาราง (ไม่ได้แก้ยอดรวมสุทธิ เพราะทั้งสองยอดเท่ากันอยู่แล้ว — แค่
   ทำให้แสดงรายละเอียดแยกเป็นบรรทัดในตารางแทนที่จะเป็นก้อนเดียว "ค่าใช้จ่ายจิปาถะอื่นๆ")

**ผลลัพธ์เดือน ส.ค. 69:** ยอด "รวมค่าใช้จ่ายทั้งหมด" เดิมแสดง ฿119,045.40 (OPEX ฿72,370.40 +
Payroll ฿46,675.00) — ที่ถูกต้องหลังตัดรายรับห้องเช่าและเงินเดือนซ้ำออก ควรอยู่ที่ประมาณ ฿85,770
(OPEX ที่แท้จริง ~฿39,095 + Payroll ฿46,675 เท่าเดิม) **ตัวเลข Payroll ไม่ได้ผิด ไม่ได้แตะ — ผิดแค่
ฝั่ง OPEX ที่ไปนับเอาของ Payroll กับรายรับมาปนด้วย**

**เพิ่ม:** สร้างการ์ด "รายรับค่าเช่าห้อง" แยกต่างหากในหน้า `/expenses` (สีเขียว เพื่อสื่อว่าเป็นรายรับ
ไม่ใช่รายจ่าย) ระบุชัดว่าไม่รวมในยอด "รวมค่าใช้จ่ายทั้งหมด" — ตอบคำถามผู้ใช้ว่า "ควรแยกออกมาไหม" ด้วย

**เพิ่ม:** เจอฟีเจอร์รายการหักย่อยรุ่นเก่าที่เขียนไว้แต่ไม่เคยอ่านกลับมาแสดงเลย (`key` ขึ้นต้นด้วย
`empd_deduct_json_`, schema `{type, detail, minutes, rate, amount}` มีข้อมูลจริง มี.ค.–มิ.ย. 69)
ระหว่างทำฟีเจอร์ใหม่ "แยกช่องหักอื่นๆ เป็นหลายรายการ" (คีย์ใหม่ `empd_deduct_items_`, schema
`{name, amount}` ง่ายกว่า) — เพิ่ม fallback อ่านรูปแบบเก่าไว้ด้วย ไม่ให้ข้อมูล 4 เดือนนั้นหายไปจากจอ

**บทเรียน:** ตาราง `sc_opex` เป็น key-value store ที่ถูกใช้เก็บของหลายอย่างปนกัน (ค่าใช้จ่ายจริง,
ยอดสรุปเงินเดือน, รายรับห้องเช่า, ข้อมูลภายในสำหรับคำนวณ) แยกกันด้วย `category`/`key` ที่เป็น
free-text string ไม่มีการบังคับด้วย type/enum ระดับฐานข้อมูล — การเติม category/key ใหม่โดยไม่รู้
ว่า filter อื่นในระบบเช็คชื่ออะไรอยู่บ้าง จะสร้างบั๊กแบบนี้ได้อีกง่ายๆ ถ้าจะเพิ่ม category/key ใหม่ในอนาคต
ควร `grep` หา string เดิมทั่ว `app/actions/expenses.ts` ก่อนเสมอ



- **[ฟีเจอร์ใหม่] ยกเว้นประกันสังคม (ปกส.) แยกจากประเภทการจ้างงาน** — เดิม `ssoDeduction` คำนวณ
  จาก `employmentType` ล้วนๆ (monthly=600, probation_daily=0) ไม่มีทางตั้ง "พนักงานประจำ แต่ไม่ต้อง
  หัก ปกส." ได้เลย ทั้งที่ `sc_employees.sso_exempt` มีคอลัมน์อยู่แล้วแต่ไม่เคยถูกอ่านย้อนกลับมาใช้จริง
  ในการคำนวณ (เขียนได้แต่ตายเงียบ) เพิ่ม `ssoExempt` เป็นฟิลด์อิสระใน `StaffPayslip`, เพิ่ม checkbox
  "ยกเว้นประกันสังคม (ปกส.)" ในหน้าต่างแก้ไขโปรไฟล์พนักงานและหน้าต่างเพิ่มพนักงานใหม่ (โผล่เฉพาะตอน
  เลือก "พนักงานประจำ" เพราะพนักงานทดลองงานไม่หัก ปกส. อยู่แล้วโดยไม่ต้องมีตัวเลือกนี้) แก้จุดคำนวณ
  สุดท้ายให้เช็ค `ssoExempt` ด้วย ไม่ใช่แค่ `employmentType` — ใช้กับหุ้นส่วนผู้จัดการที่ไม่นับเป็น
  "ลูกจ้าง" ตาม พ.ร.บ.ประกันสังคม (คำแนะนำเดิมคือให้บันทึกผ่านฟอร์ม "เพิ่มรายจ่าย" ทั่วไปแทน — ตอนนี้
  มีทางเลือกที่ถูกต้องกว่าคือใส่ในระบบพนักงานจริงแล้วติ๊กยกเว้น ปกส. แทน)

## สถานะงานล่าสุด (2026-09-02, ค่ำ — ลบบัญชีทดสอบไม่ได้ เพราะติด FK กับ audit log จริง)

- **[แก้ความเข้าใจผิดของตัวเอง] บัญชี `rlsverify35.tmp...@local.test` ลบไม่ได้ และไม่ควรพยายามลบ** —
  เมื่อคืนบอกไว้ว่า "ไม่รู้รหัสผ่าน ไม่ใช่ความเสี่ยงเร่งด่วน แต่ควรลบทิ้ง" ลองลบจริงแล้วพบว่า **Postgres
  บล็อกไว้** เพราะมี FK จาก `inv_audit_logs.performed_by` ชี้มาที่บัญชีนี้จริง — ตรวจแล้วว่าเป็น
  2 แถว audit log จริง (`INSERT inv_item_stock` + `INSERT inv_stock_transactions` เมื่อ
  2026-08-27T03:58:36Z) จากการรัน RLS-verification test ที่สร้างบัญชี co-admin ชั่วคราวขึ้นมาทดสอบ
  สิทธิ์จริง แล้วไม่ได้ลบตัวเองทิ้งหลังทดสอบเสร็จ **ห้าม force-delete บัญชีนี้** (เช่นด้วย
  `ON DELETE CASCADE`/nullify FK) เพราะจะเท่ากับไปแก้ไข `inv_audit_logs` ย้อนหลัง ผิดกฎข้อ 1
  ("audit_logs ห้ามมี UPDATE/DELETE จากโค้ดแอปเด็ดขาด") — **ปล่อยบัญชีนี้ไว้เฉยๆ ปลอดภัยดี**
  (role `co-admin`, ไม่มีใครรู้รหัสผ่าน, ไม่มี `profiles` row จึงเข้าแอปไม่ได้อยู่แล้วแม้จะมีรหัสผ่าน)

## สถานะงานล่าสุด (2026-09-02, เย็น — ตรวจ audit log จริง, ลด error เงียบ)

- **[ยืนยันแล้ว] `sc_audit_logs` ทำงานจริง** — เช็คตรงกับฐานข้อมูลจริง (ไม่ใช่แค่ตรวจโค้ด) พบ 3 แถว
  จริงแล้ว รวมถึงแถวจากการใช้ปุ่มปิดแจ้งเตือนสต๊อกต่ำที่เพิ่งเพิ่มไป (`UPDATE inventory_item`)
  และการเพิ่มพนักงานใหม่ (`CREATE roster_employee` — ชื่อ "รัชฎาพร ยั่งกุลมิ่ง") — ระบบ audit
  ทำงานถูกต้องตั้งแต่ apply migration 0011 แล้วจริงๆ
- **[ลด technical debt] ลด error ที่เงียบเกินไปใน `expenses.ts`/`smartacc-documents.ts`/`auth.ts`**
  — เดิมมี `catch { /* ignore */ }` หลายจุดที่กลืน error ทิ้งสนิทไม่มี log อะไรเลย (จุดเสี่ยงเดียวกับ
  ที่ทำให้ audit log พังไปหลายเดือนโดยไม่มีใครรู้เมื่อต้นเซสชันนี้) เพิ่ม `console.error` พร้อม context
  ที่ระบุตำแหน่ง (key/row id) ในทุกจุด โดยไม่เปลี่ยนพฤติกรรมที่ผู้ใช้เห็น (ยังคง graceful fallback
  เหมือนเดิม แค่ตอนนี้ดูใน server log ย้อนหลังได้ว่าพังตรงไหนบ้าง)
- **[ลดโค้ดซ้ำ ไม่ใช่บั๊ก]** commission/WHT ใน `expenses.ts` เคยคำนวณสูตรเดียวกันซ้ำสองรอบ (ตอน merge
  ข้อมูลจาก sc_opex และตอนคำนวณ net pay สุดท้าย) — ไม่ใช่บั๊ก (ค่าตรงกันเสมอเพราะสูตรเดียวกัน) แต่
  ตัดรอบแรกออกกันงงว่าใครคือค่าจริง

## สถานะงานล่าสุด (2026-09-02, บ่าย — กวาดล่าบั๊ก "วันที่ hardcode" ทั้งระบบ)

- **[แก้บั๊กเชิงรุก] หน้า /dashboard, /statistics, /roster ก็มีบั๊กเดียวกับ /expenses** — หลังแก้
  /expenses แล้ว ไล่ค้นหารูปแบบ hardcode วันที่/เดือน/ปีเดียวกันทั่วทั้งแอปเชิงรุก (ก่อนจะกลายเป็น
  ปัญหาที่ผู้ใช้ต้องมาเจอเองทีละจุด) พบและแก้เพิ่ม 3 จุด:
  - **`/dashboard` (หน้าแรกที่พนักงานเห็นทุกครั้งที่ล็อกอิน)** — `filterDate`/`customStartDate`/
    `customEndDate` เดิม hardcode เป็น `"2026-08-31"`/`"2026-08-01"`/`"2026-08-31"` ตรงๆ แปลว่า
    ทุกครั้งที่มีคนล็อกอินเข้าระบบ ตัวเลขที่เห็นเป็นของวันที่ 31 ส.ค. เสมอ จนกว่าจะกดเปลี่ยนวันที่เอง
    — **นี่คือจุดที่กระทบมากที่สุดเพราะเป็นหน้าแรกที่ทุกคนเห็น** แก้ให้เริ่มที่วันนี้/ต้นเดือนนี้เสมอ
  - **`/statistics`** — ตัวกรอง "เดือนนี้"/"เดือนที่แล้ว"/"ปีนี้" hardcode เป็น `"2026-08"`/
    `"2026-07"`/`"2026"` ตรงๆ (มีของแถม: fallback วันเดียว `"2026-08-27"`/`"2026-08-26"` สำหรับ
    "วันนี้"/"เมื่อวาน" ที่ไม่มีประโยชน์อะไรแล้ว เขียนไว้ตอนทดสอบวันเดียวครั้งหนึ่ง) แก้ให้คำนวณจาก
    วันที่จริงทั้งหมด
  - **`/roster`** — `currentYear`/`currentMonth` เริ่มต้นที่ `2026`/`8` (กันยายน) ตรงๆ — **ตอนแก้
    บังเอิญตรงกับเดือนปัจจุบันพอดี (วันนี้คือ 2 ก.ย. 2569) จึงยังไม่แสดงอาการ แต่จะพังทันทีที่เข้า
    เดือนตุลาคม** แก้เชิงรุกก่อนจะกลายเป็นปัญหาเหมือนที่อื่น
  - **ยังไม่พบจุดอื่นเพิ่มเติม** จากการค้นด้วย `grep` ทั่ว `app/` หา literal `"2026"` ในตำแหน่งที่เป็น
    ค่าเริ่มต้นของ state — `/pos`, `/pos/daily-entry`, `/tax-filing`, `/reports` ใช้ `new Date()`
    คำนวณค่าเริ่มต้นถูกต้องอยู่แล้ว
  - **บทเรียนสำหรับโค้ดใหม่ในอนาคต:** ห้ามเขียนค่าเริ่มต้นของ state ที่เกี่ยวกับวันที่/เดือน/ปีเป็น
    string/number ตรงๆ (`"2026-08-31"`, `2026`, `8`) แม้จะ "ตรงกับวันนี้พอดี" ตอนเขียนโค้ด — ให้
    คำนวณจาก `new Date()` เสมอ (ใช้ lazy initializer ของ `useState(() => ...)` ถ้าเป็น client
    component เพื่อไม่ให้คำนวณซ้ำทุก re-render)
  - หมายเหตุ eslint: `useState(() => new Date().getFullYear())` ที่ `roster-client.tsx` ยังโดน
    `react-hooks/purity` ("Cannot call impure function during render") ฟ้องอยู่แม้จะเป็นรูปแบบ
    lazy initializer ที่ React แนะนำเองก็ตาม — เข้าใจว่าเป็นข้อจำกัดของตัว rule ที่ตรวจ pattern นี้
    ไม่ครบ ปล่อยผ่านไว้ (ไม่ใช่บั๊กจริง ตรวจแล้วว่าค่าที่ได้ถูกต้อง)

## สถานะงานล่าสุด (2026-09-02 — ปิดแจ้งเตือน backup ตีสาม, พิมพ์สลิปยังพัง (รอบ 2), ยอดเดือนค้างที่ ส.ค., DBD)

- **[แก้ตามคำขอ] แจ้งเตือน backup รายวัน/รายเดือนไม่ปลุกมือถือแล้ว** — `scripts/backup-db-to-r2.sh`
  และ `scripts/backup-monthly-csv.sh` ส่ง heartbeat "สำเร็จ" แบบ `disable_notification=true`
  (Telegram `silent` mode) ข้อความยังขึ้นในแชทตามปกติให้เห็นย้อนหลังว่า cron ยังทำงานอยู่ (หลักการ
  "เงียบ=ผิดปกติ" ยังคงอยู่ — ดู HANDOFF.md กฎข้อ 3) แค่ไม่สั่น/ดังตอนตีสาม/ตีสี่ ข้อความ "ล้มเหลว"
  ยังคงดังปกติเพราะเป็นเรื่องด่วนจริง — **นี่ไม่ใช่การ "ถอด" การแจ้งเตือนที่ห้ามไว้**
- **[แก้บั๊กเดิมรอบ 2 — เจอสาเหตุจริง] พิมพ์สลิปเงินเดือน/ใบกำกับภาษี/หนังสือรับรองหัก ณ ที่จ่าย
  ยังพิมพ์ผิดอยู่หลังแก้รอบแรก** — รอบแรก (2026-09-01) แก้ที่ CSS `@media print` ให้ซ่อนทุกอย่าง
  เปิดเฉพาะ `.printable-area` — แก้ปัญหา "เนื้อหาอื่นบนหน้าโผล่มาปน" ได้ แต่ **modal ทั้ง 3 ตัวนี้
  (`ExpensesClient`, `InvoicingClient`, `TaxFilingClient`) มี `backdrop-blur-xs` อยู่ที่ backdrop
  ของตัวเอง** ซึ่งเป็นบั๊กคลาสเดียวกับที่เจอกับ MobileNav drawer เมื่อวาน (backdrop-filter สร้าง
  containing block ใหม่ให้ลูกที่เป็น `position:fixed` — `.printable-area` จึงยึดตำแหน่งกับกรอบของ
  backdrop ตัวเอง ไม่ใช่ทั้งหน้ากระดาษ ทำให้พิมพ์ออกมาผิดตำแหน่ง/ผิดขนาดได้) **แก้ด้วยวิธีเดียวกับ
  MobileNav: สร้าง `components/print-modal-portal.tsx` ใช้ `createPortal` ห่อ modal ทั้ง 3 ตัวให้
  หลุดออกจาก DOM tree เดิมไปแปะที่ `document.body` ตรงๆ** กันบั๊กคลาสนี้ถาวรไม่ว่า ancestor จะมี
  filter/transform อะไรเพิ่มในอนาคต — `/roster`, `/reports` ไม่ต้องแก้เพราะ `.printable-area`
  ไม่ได้อยู่ใน modal ที่มี backdrop-blur (เป็น Card ธรรมดาในหน้าปกติ ไม่มี ancestor ที่เป็น filter)
  **ยังตรวจบนมือถือจริงไม่ได้เพราะ browser extension ไม่เชื่อมต่อ** — ถ้ายังไม่หายหลัง deploy รอบนี้
  ให้ส่งภาพหน้าจอตอนดู "ตัวอย่างก่อนพิมพ์" (print preview) มาโดยตรง ไม่ใช่กระดาษที่พิมพ์ออกมาแล้ว
- **[แก้บั๊กร้ายแรง] หน้า /expenses ค้างแสดงข้อมูลเดือนสิงหาคม 2569 ตลอดกาล ไม่ขยับตามวันที่จริงเลย**
  — `fetchAllExpensesData()` ใน `app/actions/expenses.ts` เดิม hardcode ทุกค่า "เดือนนี้"/"วันนี้"/
  "เมื่อวาน"/"สัปดาห์นี้" เป็น `"08/2026"` ตรงๆ (เดือนที่เขียนโค้ดครั้งแรก) และ `AVAILABLE_MONTHS`
  ใน `expenses-client.tsx` เป็น array ตายตัว 10 เดือนที่ไม่มีเดือนกันยายนอยู่ในตัวเลือกเลย — พอเข้า
  เดือนกันยายนจริง หน้านี้ยังโชว์เลขสิงหาคมอยู่ ผู้ใช้จึงเห็น "ยอดเงินไม่ตรง" แก้ให้คำนวณจากวันที่จริง
  บนเซิร์ฟเวอร์ทั้งสองจุด (`currentMonthMY()` ใช้ร่วมกันทั้งไฟล์ + `buildAvailableMonths()` สร้าง
  รายการ 24 เดือนย้อนหลังจากวันนี้เสมอ ไม่ต้องแก้โค้ดทุกเดือนอีกต่อไป)
  **พบบั๊กแทรกซ้อนระหว่างแก้:** ข้อมูลโปรไฟล์พนักงาน (เลขบัตร/บัญชีธนาคาร/ชื่อเล่น — เก็บด้วย key
  `empd_profile_*` ปนอยู่ใน `sc_opex` แถวเดียวกับตัวเลขเงินเดือนที่ผูกกับเดือน) ถูกกรองด้วยเดือน
  เดียวกับตัวเลขเงินเดือน ถ้าเปลี่ยนไปดูเดือนอื่นที่ไม่ใช่เดือนที่เคยบันทึกโปรไฟล์ไว้ ข้อมูลโปรไฟล์
  (เลขบัญชีธนาคาร ฯลฯ) จะหายไปทั้งหมดทันที — บั๊กนี้ไม่เคยมีใครเจอเพราะหน้าเว็บค้างอยู่ที่สิงหาคม
  ตลอดมา (เดือนเดียวกับที่บันทึกโปรไฟล์ไว้) แก้โดยดึงแถวโปรไฟล์แยกจากทุกเดือน (เอาแถวล่าสุดต่อคน
  ไม่ผูกกับเดือนที่กำลังดู) ให้อยู่ติดกับพนักงานเสมอไม่ว่าจะดูเดือนไหน
- **[แก้ความเข้าใจ — ไม่ใช่บั๊ก แต่เป็นชื่อฟีเจอร์ที่ทำให้เข้าใจผิด] "ค้นหา DBD" ไม่พบข้อมูล** —
  ผู้ใช้ค้นเลขผู้เสียภาษีลูกค้าจริงแล้วขึ้น "ไม่พบข้อมูล" ตรวจแล้วพบว่าฟีเจอร์นี้**ไม่เคยเชื่อมต่อกับ
  DBD จริงเลย** เป็นแค่ (ก) ค้นลูกค้าที่เคยออกเอกสารด้วยกันมาก่อน กับ (ข) รายชื่อบริษัทตัวอย่าง ~11
  รายที่ hardcode ไว้ในโค้ด (ดูรายละเอียดเต็มที่หัวข้อ "สถาปัตยกรรม SmartAcc" ข้อ 4 ด้านบน) — ปรับ
  ข้อความ UI ให้ตรงความจริง (ไม่พูดว่า "ดึงข้อมูล DBD" อีกต่อไป) ไม่ได้แก้ตัวฟีเจอร์ให้เชื่อมกับ DBD
  จริง เพราะต้องสมัคร API key จากหน่วยงานก่อน (ไม่มีสิทธิ์ทำแทนได้)

## สถานะงานล่าสุด (2026-09-01, ดึกมาก — แก้ระบบพิมพ์เอกสารทั้งชุด + หัวเอกสารข้อมูลผิด)

- **[แก้บั๊กร้ายแรง] พิมพ์สลิปเงินเดือน 1 คน แต่ได้กระดาษข้อมูลพนักงานทุกคนติดมาด้วย** —
  ผู้ใช้รายงานว่ากด "พิมพ์" แล้วออกมาเหมือนพิมพ์ทั้งหน้าจอ **สาเหตุ:** `@media print` เดิมใน
  `app/globals.css` ซ่อนแค่ `header/nav/aside/footer/button` ตาม selector ตายตัว แล้วหวังให้
  แต่ละหน้าไล่ใส่ `print:hidden` ให้ครบทุกจุดเอง — พลาดจุดเดียวในหน้าไหนก็ตาม เนื้อหาส่วนนั้น
  (เช่น การ์ด/ตารางพนักงานทั้งหมดในหน้า `/expenses`) จะโผล่มาพิมพ์ปนกับสลิปที่ต้องการจริง
  **แก้ด้วยรูปแบบมาตรฐาน:** `body * { visibility: hidden }` แล้วเปิดเฉพาะ `.printable-area`
  กับลูกของมันเท่านั้น (`position: fixed` กัน layout ของ ancestor ที่ถูกซ่อนไปกระทบตำแหน่ง)
  หน้าไหนลืมใส่ `print:hidden` ก็ไม่กระทบอีกต่อไปเพราะถูกซ่อนโดยปริยายอยู่แล้ว — มีผลกับทุกหน้าที่ใช้
  `.printable-area` พร้อมกัน: สลิปเงินเดือน (`/expenses`), ใบกำกับภาษี (`/invoicing`),
  หนังสือรับรองหัก ณ ที่จ่าย (`/tax-filing`), ใบวางบิล (`/billing-notes`), ตารางงาน (`/roster`),
  รายงาน (`/reports`)
- **[แก้บั๊กร้ายแรงอีกจุด] หัวเอกสาร (ชื่อบริษัท/เลขผู้เสียภาษี/ที่อยู่/เบอร์โทร) hardcode ผิดจากที่ตั้งค่าจริง**
  — ผู้ใช้สังเกตว่าข้อมูลบนสลิปเงินเดือนไม่ตรงกับที่ตั้งไว้ที่ `/settings` ตรวจทั้งระบบแล้วพบว่า
  `ExpensesClient` (สลิปเงินเดือน) กับ `TaxFilingClient` (หนังสือรับรองหัก ณ ที่จ่าย + e-Tax XML)
  **ไม่เคยเรียก `fetchShopProfile()` เลย** — ฝัง `"บริษัท รวยรับทรัพย์168 จำกัด (สำนักงานใหญ่)"`,
  เลขผู้เสียภาษี `"0-5035-67004-98-1"` (ปลอม ไม่ตรงเลขจริง `0505568021002`), เบอร์ `"088-251-5168"`
  (ปลอม เลขจริงคือ `052010120`) ตรงๆ ในโค้ด แถม `tax-filing-client.tsx` มีชื่อบริษัทคนละชื่อกัน
  ถึง 2 แบบในไฟล์เดียว (`"บริษัท สนีกเกอร์ แคร์ อินเตอร์เนชั่นแนล จำกัด"` ในตัวสร้าง e-Tax XML
  ตัวอย่าง ซึ่งพบว่า copy จากรายการ `dbd_company_registry` mock lookup มาโดยลืมเปลี่ยน)
  **แก้โดย** ให้ `app/(app)/expenses/page.tsx` และ `app/(app)/tax-filing/page.tsx` เรียก
  `fetchShopProfile()` (เหมือนที่ `/invoicing`, `/billing-notes` ทำอยู่แล้วถูกต้อง) แล้วส่งเป็น
  prop `shopProfile` ให้ client component ใช้แทนค่าฝังตายตัวทั้งหมด (รวม 5 จุด: หัวสลิปเงินเดือน,
  ท้ายสลิปช่องลงนาม, หัวหนังสือรับรองหัก ณ ที่จ่าย, ท้ายหนังสือรับรองช่องลงนาม, seller ของ e-Tax XML)
  **ยังไม่ได้แก้:** ค่า fallback ตายตัวใน `billing-notes/page.tsx`/`invoicing-client.tsx` (เช่น
  `"0505566000000"`) ที่ใช้เฉพาะตอน `fetchShopProfile()` ล้มเหลวจริงๆ (DB unreachable) — ไม่ตรงกับ
  เลขจริงเป๊ะๆ เหมือนกัน แต่ไม่กระทบผู้ใช้จริงเพราะ fetch สำเร็จเสมอในทางปฏิบัติ ปล่อยไว้ได้

## สถานะงานล่าสุด (2026-09-01, ดึก — เพิ่มปุ่มปิดแจ้งเตือนสต๊อกต่ำรายชิ้น)

- **[ฟีเจอร์ใหม่] ปิดแจ้งเตือนสต๊อกต่ำเฉพาะรายการ** — คอลัมน์ `item_stock.alert_muted` มีอยู่แล้วใน
  ฐานข้อมูลจริงตั้งแต่ก่อนเซสชันนี้ (Edge Function `inv-low-stock-alert` ที่รันจริงเช็คคอลัมน์นี้
  อยู่แล้ว — 4 รายการที่ถูก mute ไว้คือของที่สั่งทีละน้อยจนติดขั้นต่ำเป็นปกติ) **แต่ไม่เคยมี UI ให้ตั้งค่า**
  เพิ่ม server action `toggleItemAlertMute()` (`app/actions/inventory.ts`) + ปุ่มกระดิ่ง 🔔/🔕
  ในตาราง `/inventory` (สลับได้ทันทีไม่ต้องเปิด modal) + checkbox ในหน้าต่างแก้ไขรายละเอียดสินค้า
  พร้อมคำอธิบาย + badge "🔕 ปิดแจ้งเตือน" ใต้สถานะ "ใกล้หมด" ในตาราง
  **แก้ badge จำนวนแจ้งเตือนที่ nav bar ด้วย** (`app/(app)/layout.tsx`) ให้ไม่นับรายการที่ mute ไว้
  — ของเดิมนับทุกรายการที่ต่ำกว่าขั้นต่ำโดยไม่สนใจ `alert_muted` เลย ทำให้ badge ค้างเลขที่ไม่มีทางเคลียร์
  ได้ (เพราะ Telegram ก็ไม่แจ้งรายการนั้นอยู่แล้วเหมือนกัน) — ตอนนี้ badge กับพฤติกรรมแจ้งเตือนจริงตรงกัน
- **[แนะนำ ไม่ใช่ฟีเจอร์ใหม่] บันทึกเงินเดือนหุ้นส่วนผู้จัดการที่ไม่หัก ปกส.** — ใช้ฟอร์ม "เพิ่มรายการ"
  ทั่วไปที่ `/expenses` (`addExpense`) ไม่ใช่ฟอร์มเงินเดือนพนักงานที่ผูกกับ `sc_employees`
  (`saveStaffPayrollAdjustment`) เพราะฟอร์มพนักงานมีตรรกะหัก WHT/ปกส./ค่าคอมมิชชั่นของ "ลูกจ้าง" ติดมา
  ด้วย ส่วนฟอร์ม `addExpense` ไม่มีตรรกะหักปกส.เลยโดยธรรมชาติ (ไม่มีฟิลด์นั้นด้วยซ้ำ) — เลือกหมวด
  "ค่าแรงและเงินเดือนพนักงาน (payroll)" แล้วตั้งชื่อรายการเองเช่น "เงินเดือนหุ้นส่วนผู้จัดการ (ไม่หัก ปกส.)"
  เหตุผลที่ไม่ต้องหักปกส.: หุ้นส่วนผู้จัดการที่บริหารกิจการของตัวเองไม่นับเป็น "ลูกจ้าง" ตาม พ.ร.บ.
  ประกันสังคม จึงไม่ต้องขึ้นทะเบียน ม.33 — ควรยืนยันกับนักบัญชี/สรรพากรของร้านอีกครั้งเพื่อความชัวร์
  ก่อนใช้เป็นแนวทางถาวร ไม่ใช่คำแนะนำทางกฎหมายที่ชี้ขาด

## สถานะงานล่าสุด (2026-09-01, ค่ำ — แก้เมนูมือถือใช้งานไม่ได้จริงบน iPhone)

- **[แก้บั๊กจริง] เมนูแฮมเบอร์เกอร์บนมือถือเปิดแล้วไม่มีเมนูให้กด** — ผู้ใช้ส่งภาพจาก iPhone 17 จริง
  มาให้ เห็นแค่หัว drawer (โลโก้ + ชื่อ + ปุ่มปิด) แต่รายการเมนูไม่โผล่ ทั้งที่พนักงานส่วนใหญ่ใช้มือถือ
  ทำงานเป็นหลัก **สาเหตุ:** `<header>` ใน `app/(app)/layout.tsx` มี `backdrop-blur-sm`
  (backdrop-filter) ซึ่งตาม CSS spec จะสร้าง **containing block ใหม่ให้ลูกที่เป็น
  `position:fixed` ทุกตัว** — `MobileNav`'s drawer (`<aside className="fixed inset-y-0 ...">`)
  เดิมเป็นลูกของ header (nested อยู่ในแถวโลโก้) จึงไปยึด `inset-y-0` กับกรอบของ header เอง
  (สูงแค่แถบเมนูบนสุด ~70-90px) แทนที่จะยึดกับทั้งหน้าจอ — เห็นแค่หัว drawer เพราะพื้นที่ที่เหลือให้
  รายการเมนูแทบไม่มีเลย นี่คือกับดัก CSS ที่รู้จักกันดี (filter/backdrop-filter/transform/
  will-change:transform บน ancestor ใดๆ ก็สร้าง containing block แบบนี้ได้เหมือนกัน)
  **แก้โดยใช้ `createPortal` ห่อ backdrop+drawer ไปแปะที่ `document.body` ตรงๆ**
  (`components/mobile-nav.tsx`) ให้หลุดออกจาก DOM ของ header ไปเลย กัน bug คลาสนี้ได้แน่นอน
  ไม่ว่า ancestor ไหนจะมี filter/transform อะไรเพิ่มในอนาคต — ยืนยันด้วย `npm run build` ผ่านปกติ
  (ยังตรวจบนมือถือจริงไม่ได้เพราะ browser extension ไม่เชื่อมต่อ ต้องให้ผู้ใช้ลองซ้ำหลัง deploy)
- **⚠️ รูปแบบเดียวกันมีอยู่ในหน้าอื่นด้วย (ยังไม่ตรวจ ไม่ใช่ตัวที่ผู้ใช้รายงาน)** — modal
  `fixed inset-0 ... backdrop-blur-xs` ใน `expenses-client.tsx`, `inventory-client.tsx`,
  `invoicing-client.tsx`, `daily-entry-client.tsx`, `roster-client.tsx`,
  `tax-filing-client.tsx` เป็นลูกของ `<main>` (ไม่ใช่ `<header>` ที่ blur) จึงไม่ชนกับ containing
  block ของ header — แต่ถ้าวันหลังเพิ่ม `backdrop-blur`/`transform`/`will-change` ให้ ancestor
  ตัวไหนของ modal พวกนี้ ให้นึกถึงบั๊กนี้ก่อน (`components/ui/dialog.tsx` ปลอดภัยอยู่แล้วเพราะใช้
  Radix `Portal` ทำแบบเดียวกันโดยธรรมชาติ)
- **🔒 [แก้บางส่วน 2026-09-02] secret จริงที่เคยฝังอยู่ใน repo** — พบ 3 ไฟล์ที่ hardcode ค่าจริง
  ตรงในโค้ด: `scripts/test-login.mjs` และ `scripts/set-admin-pw.mjs` มี Supabase `service_role`
  key แบบข้อความล้วน + อีเมล/รหัสผ่าน admin จริง (`admin@ddserviceth.com` / `password123`), และ
  `scripts/backup-db.mjs` มี connection string ของ Postgres แบบเต็มรวมรหัสผ่าน (สคริปต์นี้ล้าสมัย
  แล้ว ถูกแทนที่ด้วย `backup-db-to-r2.sh` ไปนานแล้ว — **ลบไฟล์ทิ้งไปเลย** ไม่ใช่แก้)
  **ทำไปแล้ว:** แก้ทั้งสองไฟล์ให้อ่านจาก env var/argument แทน hardcode (ตรวจแล้วว่า login ได้จริง
  ด้วยรหัสผ่านใหม่) และ **rotate รหัสผ่านจริงของบัญชี `admin` แล้ว** (รหัสสุ่มใหม่ 20 ตัวอักษร
  ผ่าน `sb.auth.admin.updateUserById()`) บัญชี `milo@ddserviceth.com` (แอดมินอีกคน) ไม่ได้แตะ
  เพราะรหัสผ่านของบัญชีนั้นไม่เคยหลุดในโค้ด
  **ยังไม่ได้ทำ (ต้องขอผู้ใช้ยืนยันก่อน — เสี่ยงกระทบ production ถ้าทำผิดขั้นตอน):** rotate
  Supabase `service_role` key ตัวจริง (ตัวที่เคยหลุดอยู่ใน 2 ไฟล์ข้างบน) — key นี้ยังใช้งานได้อยู่จน
  กว่าจะไป disable ที่ Supabase Dashboard (Project Settings → API Keys → legacy `service_role`)
  โปรเจกต์นี้มี key แบบใหม่ (`sb_secret_...`) ที่ทำหน้าที่แทนได้โดยไม่ต้องรัน JWT secret ทั้งระบบ
  (ไม่กระทบ session ของผู้ใช้ที่ login ค้างอยู่) แต่การสลับ `.env.local`/VPS ไปใช้ key ใหม่ + restart
  + verify ก่อน disable key เก่า เป็นขั้นตอนที่พลาดแล้วกระทบแอปทั้งระบบทันที จึงรอให้ผู้ใช้ยืนยันชัดเจน
  ก่อนเริ่ม — เช่นเดียวกับรหัสผ่าน database (`SUPABASE_DB_URL` ที่หลุดใน `backup-db.mjs` เดิม อาจ
  เป็นรหัสเดียวกับที่ backup-db-to-r2.sh ใช้จริงบน VPS อยู่ตอนนี้ ถ้า rotate ต้องอัปเดต
  `/home/ddservice/sneakercare-backup.env` บน VPS พร้อมกันทันที ไม่งั้น backup รายวันจะพังคืนนั้นเลย)
- **พบด้วย: บัญชีทดสอบ `rlsverify35.tmp.1787803110265@local.test`** ค้างอยู่ใน Supabase Auth
  (สร้างเมื่อ 2026-08-27 น่าจะมาจาก pgTAP RLS test ที่ไม่ได้ลบผู้ใช้ทิ้งหลังทดสอบ) ไม่ใช่ความเสี่ยง
  เร่งด่วน (ไม่รู้รหัสผ่าน ไม่ใช่ตัวไหนที่หลุดในโค้ด) แต่ควรลบทิ้งเพื่อความสะอาด — ยังไม่ได้ลบ

## สถานะงานล่าสุด (2026-09-01, รอบเย็น — ตรวจ pgTAP + browser)

- **[แก้ไข] migration `0011` แก้แล้วให้ไม่ทำ `supabase start`/CI พังบนฐานข้อมูลใหม่** — ตรวจพบตอนรัน
  `supabase start` จริงครั้งแรก (ผ่าน Docker บน VPS ชั่วคราว ไม่ใช่ production) ว่า migration 0011
  error ทันทีที่สร้าง index บน `sc_sales`/`sc_payments`/`sc_opex` เพราะตารางกลุ่มนี้**ไม่เคยถูกใส่ไว้
  ใน `supabase/migrations/` เลย** (ถูกสร้างบน SneakerCareDB โดยตรงตอนพัฒนาโมดูล POS/เงินเดือน
  นอกระบบ migration ทั้งหมด) ทำให้ migration chain รันไม่จบบนฐานข้อมูลใหม่ (local dev / CI)
  **นี่คือช่องว่างที่มีมาก่อนหน้านี้แล้ว** migration 0011 แค่เป็นตัวแรกที่ไปชนเข้า — แก้โดยห่อการสร้าง
  index ทั้ง 3 ตัวด้วย `DO $$ ... exists(select 1 from pg_tables ...) $$` ให้ข้ามถ้าตารางยังไม่มี
  **(หมายเหตุ: แก้ไฟล์ migration ที่ apply ไปแล้วบน production — ปกติห้ามทำ แต่พิสูจน์แล้วว่าเป็น no-op
  สนิทบน production เพราะตารางมีอยู่แล้วที่นั่นเสมอ ไม่มีการรันซ้ำเพราะ CLI track ด้วย version ไม่ใช่
  content hash)** ยืนยันด้วยการรัน `supabase start` จนสำเร็จ + `supabase test db` ผ่านครบ 15/15 ข้อ
  ใน 3 ไฟล์ (moving_average_cost, approve_adjustment, staff_safe_views) — **นี่คือครั้งแรกที่ pgTAP
  suite ของ repo นี้ถูกรันจริงตั้งแต่เขียนขึ้นมา**
- **🔴 ช่องว่างที่ยังไม่ได้แก้ (ตั้งใจเก็บไว้เป็นงานแยก ไม่ทำตอนนี้เพราะใหญ่เกินขอบเขตงานที่ขอ):**
  ตาราง `sc_employees`, `sc_opex`, `sc_payments`, `sc_sales`, `sc_settings`, `sc_users` และฟังก์ชัน
  `sc_get_my_role()`, `inv_fn_write_audit_log()` (trigger ที่เขียน audit ของ 3 ตารางนี้ลง
  `inv_audit_logs` อยู่แล้วตั้งแต่ก่อนเซสชันนี้ — ดูหมายเหตุด้านล่าง) **ไม่ถูก track ใน migrations เลย**
  ผลคือ: กู้คืนขึ้นโปรเจกต์ Supabase ใหม่จากศูนย์โดยใช้แค่ `supabase/migrations/` จะไม่มีโมดูล POS/
  เงินเดือน/ยอดขายเลย ต้องมี `pg_dump --schema-only` ของกลุ่มตารางนี้แล้วเขียนเป็น migration ใหม่
  ถึงจะสมบูรณ์ — งานนี้ไม่ได้ทำตอนนี้ เพราะขอบเขตที่ขอคือ "รัน pgTAP ให้ได้" ซึ่งทำสำเร็จแล้วโดยไม่ต้อง
  แก้ช่องว่างนี้ (pgTAP ไม่ได้ทดสอบตาราง sc_*) แต่ใครจะกู้คืนระบบทั้งชุดจากศูนย์ต้องรู้เรื่องนี้ไว้ก่อน
- **[แก้ไขความเข้าใจ] audit ของ sc_sales/sc_opex/sc_payments ไม่ได้ "ไม่เคยทำงานเลย" อย่างที่เคยเข้าใจ
  ตอนเช้า** — พบจาก `pg_dump --schema-only` ว่ามี trigger `sc_trg_audit_*` เขียนผ่าน
  `inv_fn_write_audit_log()` ลง `inv_audit_logs` (ledger เดียวกับฝั่งคลังสินค้า) อยู่แล้วทุกครั้งที่
  INSERT/UPDATE/DELETE บนตารางนี้ — เห็นแถวจริงล่าสุดวันที่ 31 ส.ค. ที่ผ่านมา สิ่งที่พังจริงคือแค่ชั้น
  แอป (`lib/audit.ts` เดิม) ที่พยายามเขียน log แบบมี actor_name/detail ที่มนุษย์อ่านง่าย ไม่ใช่ระบบ
  audit ทั้งระบบ — `sc_audit_logs` ที่สร้างใน migration 0011 ยังมีประโยชน์ (เก็บ actor/รายละเอียดที่
  เข้าใจง่ายกว่า raw before/after JSON) แต่ไม่ใช่ audit trail เดียวที่มีอยู่อย่างที่เข้าใจผิดไปตอนแรก
- **[ยังทำไม่ได้] ตรวจหน้าเว็บจริงบนเบราว์เซอร์** — `claude-in-chrome` extension ไม่ได้เชื่อมต่อในเซสชันนี้
  (`tabs_context_mcp` ตอบ "Browser extension is not connected" ทั้งตอนเช้าและรอบนี้) ต้องให้ผู้ใช้ติดตั้ง/
  เชื่อมต่อ extension ที่ claude.ai/chrome แล้วลองใหม่ หรือตรวจเองด้วยตา

## สถานะงานล่าสุด (2026-09-01, รอบเช้า)

0. **[Deploy แล้ว] production เป็น commit `3d6449a`** — push ขึ้น `origin/master` และ deploy ผ่าน
    `npm run deploy` เรียบร้อย · PM2 `sneakercare` (id 13) status `online`, unstable restarts = 0
    · ตรวจแล้ว: `/login` ตอบ HTTP 200, หน้าที่ต้องล็อกอินตอบ 307 redirect ตามที่ควรเป็น

11. **[แก้บั๊กร้ายแรง] ระบบ Audit Log ไม่เคยบันทึกอะไรเลยตั้งแต่ commit `e3f025d`** — `lib/audit.ts`
    insert ลง `audit_logs` ด้วยคอลัมน์ `entity`/`actor_name`/`detail`/`created_at` ที่ **ไม่มีอยู่จริง**
    (ตารางจริงใช้ `table_name`/`record_id`/`performed_at`/`before_data`/`after_data`) ทุก insert จึงได้
    HTTP 400 แล้วถูก `catch` ทิ้งเงียบ — และหน้า `/admin/audit` ก็ query คอลัมน์ชุดเดียวกันจึงขึ้น
    "ยังไม่มีบันทึก" เสมอ **แก้โดยแยกตาราง `sc_audit_logs` ออกมาต่างหาก** (migration 0011) ไม่ไปเขียนทับ
    ledger ของคลังสินค้าตามกฎข้อ 1 พร้อมทำให้ `logAudit()` ร้องเสียงดังใน server log เมื่อเขียนไม่สำเร็จ
12. **[เสร็จสมบูรณ์] Audit coverage ครบทุกจุดที่แตะเงิน** — เพิ่มจากเดิมที่มีแค่ `deleteDailySale`:
    `saveDailySale` (CREATE/UPDATE), `recordArPayment`, `deleteArPayment`, `addExpense`, `deleteExpense`,
    `saveStaffPayrollAdjustment`, `saveStaffProfileInfo`, `createStaffMember`
    — ทุกการ **ลบ** จะอ่านแถวเดิมเก็บไว้ใน `detail` ก่อนลบเสมอ (ของเดิมบันทึกแค่ `{sale_id: 305}`
    ซึ่งบอกไม่ได้เลยว่ายอดที่หายไปคือเท่าไหร่) และเลขบัตรประชาชน/เลขบัญชีถูก mask ก่อนลง log
13. **[เสร็จสมบูรณ์] หน้า `/admin/audit` แสดง audit ทั้งสองสาย** — สลับแท็บระหว่าง "การเงิน/ยอดขาย (แอป)"
    กับ "คลังสินค้า (DB trigger)" มีตัวกรอง action/entity, แบ่งหน้า และ **ตัวกรองไม่หลุดตอนกดเปลี่ยนหน้า**
14. **[เสร็จสมบูรณ์] Pagination + index** — `/pos` เปลี่ยนจาก `.limit(50)` ตายตัวเป็นแบ่งหน้าจริงพร้อม
    count; `/history` เดิมกด "ถัดไป" แล้วช่วงเวลา/ประเภทที่เลือกไว้หลุดกลับเป็นค่า default — แก้แล้ว
    และการ์ดสรุป (รับเข้า/เบิกใช้/มูลค่าต้นทุน) เดิมบวกจาก**แถวในหน้าเดียว** แต่พาดหัวว่าเป็นยอดของทั้งช่วง
    = ตัวเลขผิด ตอนนี้คิดจากทั้งช่วงจริง (มีเพดาน 5,000 แถวและขึ้นเตือนเมื่อชน);
    `/pos/daily-entry` ยังกรองฝั่ง client แต่เลิกตัดข้อมูลเงียบๆ — ขึ้นแถบบอกเมื่อโหลดมาไม่ครบ
    และ `fetchRecentDailySales` เลิก `select *` ทั้งตาราง `sc_payments` (ดึงเฉพาะวันที่โหลดมาจริง)
15. **[เสร็จสมบูรณ์] CSV สำรองรายเดือน** — `scripts/export-monthly-csv.mjs` + `scripts/backup-monthly-csv.sh`
    เสริม `backup-db-to-r2.sh` (pg_dump รายวัน กู้ได้แต่เปิดอ่านเองไม่ได้) ด้วย CSV ที่เปิดด้วย Excel
    ได้ทันทีและส่งให้ผู้ทำบัญชีได้ เก็บ 5 ปีตามอายุเอกสารบัญชี — **ทดสอบกับฐานข้อมูลจริงแล้ว**
    (ส.ค. 2569: ยอดขาย 27 แถว, รับชำระ 6, ค่าใช้จ่าย 45, audit คลัง 518, สต๊อก 34)

## สถานะงานก่อนหน้า (2026-08-31)

1. **[เสร็จสมบูรณ์] คืนค่ารายการสินค้าในคลังครบ 100% (46 รายการ)** — เชื่อมต่อ `items` และ `item_stock` ตรงกัน แสดงยอดคงเหลือจริง, จุดสั่งซื้อขั้นต่ำ และต้นทุน COGS ถูกต้อง
2. **[เสร็จสมบูรณ์] เพิ่มสินค้าใหม่ขณะรับของเข้า (`/stock-in`)** — มีปุ่มสลับโหมด `[เลือกสินค้าเดิม]` / `[+ เพิ่มสินค้าใหม่]` สร้างแคตตาล็อกและรับเข้าสต๊อกจบในขั้นตอนเดียว
3. **[เสร็จสมบูรณ์] ฟอร์มบันทึกยอดขายรายวัน (`/pos/daily-entry`)** — ถอดแบบจากระบบเดิมของ SneakerCare บันทึกจำนวนคู่ตามขนาด (S/M/L/XL), ยอดเงินสด, เงินโอน, ส่วนลด และคำนวณยอดสุทธิลง `sc_sales` แบบ Real-time
4. **[เสร็จสมบูรณ์] ดึงข้อมูลพนักงานจริง + รายจ่ายร้านจริง 100%** — ดึง 327 รายการจาก `sc_opex` (10 เดือนย้อนหลัง) แสดงสลิปพนักงานจริง (น.ส.สุทธินันท์ นนทจันทร์, นายธีรภัทร ทาแผ) พร้อมรายการหัก WHT, ประกันสังคม, ค่าใช้จ่ายดำเนินงานร้าน และรายรับห้องเช่าชั้น 3
5. **[เสร็จสมบูรณ์] แถบเลือกช่วงเวลามาตรฐาน (Universal Time Range Presets)** — ปุ่ม `[วันนี้]`, `[เมื่อวาน]`, `[สัปดาห์นี้]`, `[เดือนนี้]`, `[เดือนที่แล้ว]`, `[ปีนี้]`, `[ทั้งหมด]` และ Dropdown เลือกเดือนในทุกหน้าสรุป
6. **[เสร็จสมบูรณ์] ลบข้อมูลสมมุติ ("สมชาย", "สมศรี") ออกหมด 100%** — ทุกหน้าและทุก Placeholder ใช้ข้อมูลจริงและนิติบุคคลจดทะเบียนจริง
7. **[เสร็จสมบูรณ์] Deploy บน Production VPS** — `https://sneakercare.ddserviceth.com` PM2 process `sneakercare` สถานะ Online 100%
8. **[แก้ไขสำเร็จ] ปัญหาเข้าเว็บแล้วขึ้นให้ดาวน์โหลดไฟล์** — เกิดจาก Next.js 16 Webpack runtime ใน `middleware.ts` อ้างอิง `self` จนเกิด Server 500 error แบบไม่มี Header ทำให้ Browser เข้าใจว่าเป็นไฟล์ดาวน์โหลด ได้เปลี่ยนมาใช้ Guard ระดับ Server Component (`requireProfile()`) แทนทั้งหมด ทำให้เว็บโหลดหน้า HTML 200/307 ได้เร็วและสมบูรณ์ 100%
9. **[เสร็จสมบูรณ์] ระบบเคลียร์เงินเดือนสิ้นเดือน (31 ส.ค. 2569) & พิมพ์สลิปเงินเดือน A4** — คำนวณยอดโอนเงินเดือนสุทธิ น.ส.สุทธินันท์ นนทจันทร์ (11,900.00 ฿) และ นายธีรภัทร ทาแผ (12,575.00 ฿) รวม 24,475.00 ฿ พร้อมประกันสังคม 2,400 ฿ และปุ่มออกใบแจ้งเงินเดือนพนักงาน (Official Payslip A4) พร้อมช่องลงนามผู้มีอำนาจและพนักงาน
10. **[เสร็จสมบูรณ์] โมดูลตารางการทำงาน & ปฏิทินกะ 1 ปีเต็ม (`/roster`) และระบบค่าจ้างทดลองงาน (350฿/วัน)** — แก้ไขการ Parse Prefix ชื่อพนักงานไม่ให้ซ้ำซ้อน (`json_...`, `total_...`), เพิ่มระบบสลับโหมดพนักงานประจำ (เงินเดือน) vs พนักงานทดลองงาน (วันละ 350฿ บันทึกตามจำนวนวันทำงานจริง), และสร้างปฏิทินกะ 1 ปีเต็ม (1 ก.ย. 2569 - 31 ส.ค. 2570) กำหนดกะเช้า-กะสาย, วันหยุดประจำตัว (เชียง หยุด พุธ, เจ หยุด ศุกร์, มิ้ว หยุด อาทิตย์) พร้อมไฮไลท์วันหยุดตามกฎหมายแรงงานไทย และปุ่มพิมพ์ตารางงานขนาด A4

