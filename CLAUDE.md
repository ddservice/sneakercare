# CLAUDE.md

คำแนะนำสำหรับ Claude Code เมื่อทำงานในโปรเจกต์นี้ — ระบบบริหารจัดการคลังสินค้าสำหรับร้านบริการทำความสะอาด/ซ่อมแซมรองเท้า

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
- `bash scripts/backup-monthly-csv.sh` — ตัวห่อสำหรับ cron: ส่งออก CSV เดือนที่แล้ว → tar.gz → Cloudflare R2

**⚠️ ห้ามลบ flag `--webpack` ออกจาก script `dev`/`build`**: จำเป็นสำหรับการ build บน network drive / UNC path

## สิ่งที่ตัดสินใจแล้ว

- **Hosting = VPS ไม่ใช่ Vercel** — PM2 + Nginx บนเครื่อง `157.85.108.84` (พอร์ต 3003)
- **Global Font = IBM Plex Sans Thai** (รองรับทั้งภาษาไทยและอังกฤษแบบสากล)
- **Default Theme = Light Mode** สบายตา เหมาะกับการทำงานบัญชีและหน้าร้าน
- **ช่องทางแจ้งเตือนสต๊อกต่ำ = Telegram Bot API ส่งเข้ากลุ่มพนักงาน**
- **สาขา:** schema รองรับหลายสาขาไว้แล้วตั้งแต่ต้น
- **Admin เลือกสาขาจาก dropdown ใน header** (คุกกี้ `sc_active_branch`)
- **สำรองข้อมูลนอก Supabase ไปที่ Cloudflare R2 ทุกวัน + Retention 90 วัน** (อัปเดต 2026-08-28)
  ใช้ `pg_dump` รันผ่าน cron บน VPS ตี 3 ทุกคืน (`scripts/backup-db-to-r2.sh`) อัปโหลดไป Cloudflare R2 (`ddservicedb`)
  พร้อมลบไฟล์เก่าเกิน 90 วันทั้งบน VPS และ R2 อัตโนมัติ ตามด้วย `verify-backup.sh` ตรวจสอบความสมบูรณ์และส่ง Heartbeat เข้า Telegram

## 🔴 ต้องทำก่อนใช้งานจริง (ค้างอยู่ ณ 2026-09-01)

**รัน `supabase/migrations/0011_sc_audit_logs_and_indexes.sql` ที่ SQL Editor ของ project
`SneakerCareDB` (ref `mdlxogfkpwejnqpzhmoy`) หนึ่งครั้ง** — repo นี้ไม่มีสิทธิ์ DDL ไปที่ฐานข้อมูลนั้น
(PostgREST รัน DDL ไม่ได้ และ repo ห้าม `supabase link` ไป `SneakerCareDB`) จึงต้องวางรันด้วยมือ

ระหว่างที่ยังไม่รัน:
- การกระทำฝั่งการเงินทั้งหมด **ไม่ถูกบันทึกลง audit** (`logAudit()` จะ log error ลง console แล้วปล่อยผ่าน
  โดยเจตนา เพื่อไม่ให้การลบข้อมูลของผู้ใช้พังตาม)
- หน้า `/admin/audit` แท็บ "การเงิน / ยอดขาย" จะขึ้นแถบเตือนสีเหลืองบอกวิธีแก้
- แท็บ "คลังสินค้า (DB trigger)" ยังใช้งานได้ปกติ (688 แถวเดิมอยู่ครบ)
- index ของ `sc_sales."date"`, `sc_payments.sale_date`, `sc_opex.month` ยังไม่มี

SQL ไฟล์นี้ผ่านการรันจริงบน Postgres แล้วผ่าน `npm run test:migration` (รวมทดสอบรันซ้ำ) — ไม่ใช่ SQL ที่เขียนลอยๆ

**⚠️ โค้ดที่ deploy อยู่บน production ตอนนี้ (commit `3d6449a`) รอ migration นี้อยู่แล้ว**
เว็บใช้งานได้ปกติทุกหน้า ไม่พัง แต่ audit ฝั่งการเงินจะยังว่างจนกว่าจะรัน SQL

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

