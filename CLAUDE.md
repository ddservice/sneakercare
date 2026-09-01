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
- **🔴 พบบั๊กจากความสับสนนี้: แจ้งเตือนสต๊อกต่ำผ่าน Telegram หยุดทำงานเงียบๆ มาตั้งแต่ 2026-08-27**
  (5 วันก่อนพบ) เพราะ `pg_cron` (migration `0002`) ยิง Edge Function ไปที่โปรเจกต์เก่าที่ตายแล้ว
  แก้ไว้ที่ `supabase/migrations/0012_fix_low_stock_alert_cron_url.sql` **แต่ยังไม่ deploy/apply**
  เพราะต้อง deploy Edge Function ไปที่โปรเจกต์ที่ถูกต้องก่อน (`supabase functions deploy
  low-stock-alert --project-ref mdlxogfkpwejnqpzhmoy`) แล้วค่อยรัน migration — ทั้งสองเป็นการเปลี่ยน
  production จึงรอการยืนยันจากเจ้าของก่อนทำ ไม่ทำเองเงียบๆ

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
4. **DBD & Juristic Registry Auto-Fill:**
   - ค้นหาเลขนิติบุคคล 13 หลัก หรือชื่อบริษัท ในหน้า `/invoicing` เพื่อดึงชื่อทางการ, ที่อยู่จดทะเบียน และรหัสสาขา `00000` มาเติมให้อัตโนมัติใน 1 วินาที
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
- `node scripts/backup-db.mjs` — สคริปต์สำรองฐานข้อมูลอัตโนมัติบน VPS
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

## สถานะงานล่าสุด (2026-09-01)

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

