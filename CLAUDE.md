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

- Project นี้ (inventory) = `shoe-care-inventory`, ref `tecrcoienazmtbynuqpg`, org `SneakerCare` — link ไว้แล้ว
  ผ่าน `supabase link` (ไฟล์ `supabase/.temp/` ไม่ได้ commit)
- **ห้ามสับสนกับ `SneakerCareDB` (ref `mdlxogfkpwejnqpzhmoy`)** — นั่นคือโปรเจกต์เดิมที่มีข้อมูลขายจริง
  (`sc_sales`, `sc_payments`, ...) จากระบบ legacy อยู่ ห้าม `supabase link` ไปที่ project นั้นเด็ดขาดถ้าไม่ได้
  ตั้งใจจะยุ่งกับข้อมูลเดิม
- Edge Function `low-stock-alert` deploy แล้ว และมี `pg_cron` (ดู `supabase/migrations/0002_schedule_low_stock_alert.sql`)
  เรียกทุก 30 นาที โดยดึง service_role key จาก `supabase.vault` (ไม่มี secret อยู่ในไฟล์ migration ที่ commit)
- มี branch แรกในระบบแล้ว: "SneakerCare สาขาหลัก" และมี Admin account เดียว (เชิญผ่านอีเมลแล้ว)
- **⚠️ พบ schema แปลกปลอม prefix `inv_` (`inv_v_inventory_value`, `inv_notification_log`, ...) ใน
  `SneakerCareDB` (2026-08-26)** — ไม่ได้มาจาก migration ใน repo นี้ (ไม่มีที่ไหนอ้าง prefix `inv_`) และไม่มีใคร
  ในทีมตั้งใจสร้าง ยังไม่ได้ลบเพราะเป็น production ที่มีข้อมูลขายจริง ต้องตรวจสอบผ่าน dashboard ของ
  `SneakerCareDB` เอง (list ตาราง/view ที่ขึ้นต้น `inv_%`, เช็คว่าไม่มี FK ไปโยง `sc_*`) ก่อน drop ด้วยมือ —
  งานนี้ยังค้างอยู่

## กฎทางธุรกิจที่ต้องไม่ละเมิด (Non-negotiable business rules)

1. **`audit_logs` ห้ามมี UPDATE/DELETE จากโค้ดแอปเด็ดขาด แม้แต่ endpoint ที่ role เป็น admin**
   การเขียน log เกิดจาก DB trigger เท่านั้น (`fn_write_audit_log`) — อย่าสร้าง API route หรือ Supabase RPC
   ที่ไปแก้ไขตาราง `audit_logs` ตรงๆ ไม่ว่ากรณีใด
2. **`stock_transactions` เป็น append-only ledger** ห้าม UPDATE/DELETE แถวเดิมเพื่อ "แก้ตัวเลขที่พิมพ์ผิด"
   ให้สร้างแถวใหม่ที่อ้าง `corrects_txn_id` แทนเสมอ ยอดคงเหลือ (`item_stock.current_qty` — แยกต่อสาขา ไม่ใช่
   คอลัมน์ใน `items`) เป็นแค่ cache ที่มาจากผลรวมของ ledger — ห้ามให้ UI ไปแก้ `item_stock` ตรงๆ (ถูก
   `REVOKE insert/update/delete` จาก `authenticated` ไว้แล้ว เขียนได้ผ่าน trigger กับ `fn_set_min_stock_level()`
   เท่านั้น)
3. **Adjustment (ปรับปรุงสต๊อกจากตรวจนับ) ที่สร้างโดย Co-Admin ต้องมีสถานะ `pending_approval` เสมอ**
   และมีผลกับยอดคงเหลือก็ต่อเมื่อ Admin เรียก `fn_approve_adjustment()` แล้วเท่านั้น — ห้าม bypass logic นี้
   ที่ชั้น frontend
4. **RBAC ต้องบังคับที่ RLS policy ของ Postgres เป็นด่านหลัก** อย่าเขียน authorization logic เฉพาะที่
   frontend/React component แล้วปล่อยให้ Supabase table เปิดกว้าง — ทุก policy ใหม่ต้องผ่าน `fn_current_role()`
5. **Staff ต้องไม่เห็นข้อมูลต้นทุน/COGS เด็ดขาด** — แอปต้อง query view ที่ตัดคอลัมน์ต้นทุน
   (`v_item_stock`, `v_stock_transactions`, `v_top_consumed_qty_30d`) ห้าม SELECT จากตาราง
   `item_stock` / `stock_transactions` ตรงๆ (ถูก `REVOKE SELECT` จาก `authenticated` แล้วใน
   `supabase/migrations/0003_staff_safe_views.sql`) มุมมองที่มีต้นทุน (`v_item_stock_cost`,
   `v_stock_transactions_cost`, `v_inventory_value`, `v_monthly_cogs`, `v_top_consumed_items_30d`)
   คืน 0 แถวให้ Staff แม้จะเดาชื่อ view
6. **ต้นทุนใช้วิธีถัวเฉลี่ยเคลื่อนที่ (moving average)** คำนวณผ่าน trigger `fn_apply_stock_transaction`
   เท่านั้น อย่าคำนวณต้นทุนซ้ำในโค้ด frontend/TypeScript เพราะจะ diverge จากค่าจริงใน DB
7. **สิ้นเปลืองตัดสต๊อกเป็นหน่วยฐาน (`base_unit`) เสมอ** เช่น ml/g ไม่ใช่หน่วยซื้อ (`purchase_unit`)
   ฟอร์มเบิกใช้งานต้องแปลงหน่วยก่อนส่ง qty เข้า `stock_transactions.quantity_delta`
8. **แจ้งเตือนสต๊อกต่ำใช้ Telegram Bot API** (ตัดสินใจแล้ว — ไม่ใช่ LINE) ห้ามอ้างอิงหรือใช้ LINE Notify
   เพราะเลิกให้บริการแล้ว (31 มี.ค. 2025) ส่งเข้า**กลุ่มพนักงาน** (ไม่ใช่แชทส่วนตัว) ผ่าน `branches.telegram_chat_id` ต่อสาขา
9. **Bot Token ตั้งค่าผ่านหน้าเว็บ Settings (เห็นเฉพาะ Admin) ไม่ใช่ Supabase Secret/env var** — เขียนได้
   ทางเดียวผ่าน RPC `fn_set_integration_secret()` เท่านั้น **ห้ามสร้าง endpoint/query ที่ SELECT ค่าจริงจาก
   `integration_secrets` กลับไปแสดงใน UI เด็ดขาด แม้แต่ให้ Admin ดู** — ใช้ `fn_integration_secret_status()`
   ที่คืนแค่สถานะ + ท้ายรหัส 4 ตัวแทน ค่าจริงอ่านได้เฉพาะ Edge Function ผ่าน service_role key เท่านั้น
   ดูรายละเอียดที่ `docs/architecture.md` §2.1
10. **`items` (แคตตาล็อกกลาง) กับ `item_stock` (ยอดคงเหลือ/ต้นทุน/min stock ต่อสาขา) เป็นคนละตาราง**
    อย่ารวมยอดคงเหลือกลับเข้า `items` แม้ตอนนี้จะมีสาขาเดียว — เขียน query/RPC ใหม่ทุกครั้งให้ join ผ่าน
    `(item_id, branch_id)` เสมอ เพื่อไม่ให้พังตอนเปิดสาขาที่ 2
11. **`profiles.branch_id`**: role `admin` ปล่อย null ได้ (เห็นทุกสาขา), role `co_admin`/`staff` ต้องมีค่าเสมอ
    (บังคับด้วย DB constraint) ทุก query/RLS ใหม่ที่เกี่ยวกับสต๊อกต้อง filter ด้วย `fn_current_branch()`
    ไม่ใช่ปล่อยให้เห็นข้ามสาขาโดยไม่ตั้งใจ
12. **Admin เลือกสาขาทำงานผ่านคุกกี้ `sc_active_branch`** (ดู `lib/branch.ts`) — ค่าว่าง = ดูรวมทุกสาขา
    ได้เฉพาะหน้าอ่าน (แดชบอร์ด/รายงาน/ประวัติ) การเบิก-รับ-ปรับ-ของเสียต้องเลือกสาขาให้ชัดก่อน
    Staff/Co-Admin ไม่ใช้คุกกี้นี้ ใช้ `profiles.branch_id` เสมอ
13. **เชิญผู้ใช้ทำได้ทางหน้า `/admin/users` เท่านั้น** ใช้ `SUPABASE_SERVICE_ROLE_KEY` ฝั่งเซิร์ฟเวอร์
    (`lib/supabase/admin.ts`) — ห้าม import ไฟล์นี้จาก Client Component และห้ามใส่ prefix `NEXT_PUBLIC_`
    ให้ service_role key ลิงก์ในอีเมลเชิญใช้ `NEXT_PUBLIC_SITE_URL`

## โครงสร้างโฟลเดอร์

```
/app                      Next.js pages: dashboard, stock-in, stock-out, history, adjustments, reports, admin
/app/actions              Server Actions (stock, users, settings, auth, branch)
/components               shared UI components (shadcn/ui)
/lib/permissions.ts       แผนที่สิทธิ์มองเห็น vs กรอก/แก้ไข ต่อเมนู (ต้องสอดคล้อง RLS)
/lib/supabase             browser client / server client / admin (service_role) client
/scripts                  one-time tools เช่น migrate-from-legacy.mjs
/supabase/migrations      SQL migrations (เริ่มจาก 0001_init.sql — ห้ามแก้ไฟล์ที่ apply แล้ว)
/supabase/functions       Edge Functions เช่น low-stock-alert (รันตาม cron)
/legacy                   ระบบเดิม (Google Apps Script) — อ้างอิง migration เท่านั้น
docs/architecture.md      เหตุผลการออกแบบทั้งหมด
docs/database-schema.sql  schema เริ่มต้น (ดู migrations สำหรับของที่เพิ่มทีหลัง)
CLAUDE.md                 คู่มือนี้ — อัปเดตทุกครั้งที่จบงานใหญ่
```

## แนวทางการเขียนโค้ด

- ทุกการเขียน/แก้ข้อมูลสต๊อกต้องผ่าน Supabase RPC หรือ insert ปกติที่ trigger ดักไว้แล้ว — อย่าคำนวณยอด
  คงเหลือฝั่ง client แล้วยิง UPDATE ตรงไปที่ `item_stock.current_qty`
- ทุก query ที่ดึงสต๊อก/รายการเบิกจ่ายต้อง filter ด้วย `branch_id` ของผู้ใช้ปัจจุบันเสมอ (ยกเว้น Admin ที่
  เลือกดูรวมได้) — RLS บังคับไว้แล้วที่ชั้น DB แต่ query ฝั่งแอปควรระบุ `branch_id` explicit ด้วยเพื่อความชัดเจน
- ฟอร์มเบิก-จ่าย (`Stock In / Stock Out`) ต้องเรียบง่ายพอให้พนักงานหน้าร้านกรอกได้ไว — เลือกสินค้าจาก
  dropdown/search, กรอกจำนวนตามหน่วยที่ใช้จริงหน้างาน (ไม่ใช่หน่วยฐานเสมอไป ต้องแปลงให้ในโค้ด ไม่ใช่ให้ user คำนวณเอง)
  ค้างเทียบสไตล์เดิมที่ `legacy/sneakercare_dashboard.html` ไว้เป็น reference ด้าน UX ได้ แต่ห้าม copy โครงสร้างข้อมูลเดิมมาใช้ตรงๆ
- Migration SQL ใหม่ให้ใส่ใน `/supabase/migrations` เป็นไฟล์แยกตามลำดับเวลา ห้ามแก้ไฟล์ migration เก่าที่ apply ไปแล้ว
- เขียน RLS policy ใหม่ทุกครั้งที่เพิ่มตาราง อย่าปล่อยตารางใหม่ไว้แบบไม่มี RLS (ค่า default ของ Supabase
  คือเปิดกว้างจนกว่าจะ `enable row level security`)

## คำสั่งที่ใช้บ่อย

- `npm run dev` — รัน Next.js dev server (บังคับ `--webpack` ไว้ใน package.json แล้ว)
- `npm run build` — production build (บังคับ `--webpack` เช่นกัน)
- `npm run typecheck` — `tsc --noEmit` ใช้เช็คเร็วๆ ระหว่าง dev ไม่ต้องรอ build เต็ม
- `npm run test:legacy` — ตรวจว่าแถบเตือน "ประมาณการ" ในหน้าภาพรวมของ legacy ยังทำงาน
  (ดึงฟังก์ชันจาก HTML จริงมารันบน DOM ปลอมใน Node — ไม่ต้องเปิดเบราว์เซอร์)
- `npm run test:reports` — ตรรกะช่วงเดือน/CSV/เลขหน้า (`lib/reports-range.ts`, `lib/pagination.ts`)
  ทั้งสองตัวไม่ต้องต่อ Supabase ไม่ต้องล็อกอิน จึงรันใน CI ได้
  ⚠️ ถ้าเจอ error ใน `.next/types/validator.ts` แปลว่า `.next` ค้างจาก build เก่า ไม่ใช่โค้ดเราผิด —
  รัน `npm run build` ใหม่ให้ regenerate แล้วค่อย typecheck (ใน CI ไม่เจอปัญหานี้เพราะ `.next` ยังไม่มี)
- `npm start` — production server ฟังที่ `127.0.0.1` (ให้อยู่หลัง Nginx บน VPS)
- `supabase db push` — apply migrations ไปยัง Supabase project (ต้อง `supabase link` ก่อน)
- `supabase db diff` — ตรวจสอบ schema drift ก่อน commit migration ใหม่
- `supabase test db` — รัน pgTAP test ใน `supabase/tests/database/` (ต้องมี Docker Desktop เปิดอยู่ในเครื่อง
  — CLI จะสร้าง local Postgres ชั่วคราวมารัน migration ทั้งหมดแล้วรัน test) ครอบคลุมต้นทุนถัวเฉลี่ยเคลื่อนที่,
  `fn_approve_adjustment` (role check + กันอนุมัติซ้ำ + กัน silent no-op ตอนไม่มี item_stock), และ
  staff-safe cost views คืน 0 แถวจริง
- `bash scripts/backup-db-to-r2.sh` — สำรอง DB แบบ `pg_dump` แล้วอัปโหลดไป Cloudflare R2 (อ่านรายละเอียด/
  ตัวแปร env ที่ต้องตั้งในคอมเมนต์บนสุดของไฟล์) รันบน VPS ผ่าน cron ทุกวัน ไม่ใช่ผ่าน Supabase
- `bash scripts/verify-backup.sh [--deep]` — ตรวจว่าไฟล์สำรองล่าสุด **กู้คืนได้จริง** ต่อท้าย cron
  หลัง backup เสมอ (`backup-db-to-r2.sh && verify-backup.sh`) โหมดปกติอ่าน TOC ด้วย `pg_restore --list`
  ไม่ต้องใช้ Docker · `--deep` กู้ลง Postgres ชั่วคราวใน Docker แล้วนับแถวจริง
- `npm run migrate:legacy -- --branch-id <uuid> --performed-by <admin-uuid> --stock ./import/SC_Stock_Status.csv --dry-run`
  — นำเข้า CSV จาก Google Sheets (ดูหัวข้อใน `scripts/migrate-from-legacy.mjs`) ห้าม copy รหัสผ่านจากระบบเดิม
  วางไฟล์ CSV ไว้ที่ `/import` (gitignored) อย่า commit ข้อมูลร้าน

**⚠️ ห้ามลบ flag `--webpack` ออกจาก script `dev`/`build`**: บนเครื่องที่ repo อยู่บน mapped network
drive (UNC path) Turbopack ของ Next.js เวอร์ชันนี้ resolve path ผิดพลาด (`Cannot depend on path ... outside
of root directory`) เพราะเทียบ UNC path กับ drive-letter path ไม่ตรงกัน ทำให้ build พังเฉพาะบนเครื่องแบบนี้
เท่านั้น (โค้ดแอปไม่ได้ผิด) `--webpack` เป็นทางแก้ที่ยืนยันแล้วว่าใช้ได้จริง

## สิ่งที่ตัดสินใจแล้ว

- **Hosting = VPS ไม่ใช่ Vercel** (ตัดสินใจแล้ว 2026-08-14) — PM2 + Nginx บนเครื่องเดียวกับเว็บร้านอื่น พอร์ตต้องไม่ชน service อื่น (เช็ค `ss -tlnp` บนเซิร์ฟเวอร์ก่อน)
- **Supabase project มีอยู่แล้ว** ใช้เป็น backend/DB หลักตามแผน ไม่ต้องประเมิน PocketBase/ทางเลือกอื่นซ้ำ
- **ช่องทางแจ้งเตือนสต๊อกต่ำ = Telegram Bot API ส่งเข้ากลุ่มพนักงาน** (ไม่ใช่ LINE, ไม่ใช่แชทส่วนตัว)
  ดู `docs/architecture.md` §2.1
- **สาขา: ปัจจุบันมี 1 สาขา แต่ schema ออกแบบรองรับหลายสาขาไว้แล้วตั้งแต่ต้น** (`branches`, `item_stock`
  แยกยอดต่อสาขา, `profiles.branch_id`) — เมื่อเปิดสาขาใหม่ในอนาคตแค่เพิ่มแถวใน `branches` ไม่ต้อง migrate
  schema ใหม่ ดู `docs/architecture.md` §3.1.1
- **Admin เลือกสาขาจาก dropdown ใน header** (คุกกี้ `sc_active_branch`) ไม่ผูก `profiles.branch_id`
  ของบัญชี Admin — บัญชี Admin ยังปล่อย branch_id เป็น null ได้ตาม constraint เดิม
- **สิทธิ์ 3 ระดับ (admin / co_admin / staff) เพียงพอ** ไม่ทำเมทริกซ์ปรับสิทธิ์สดจากหน้าเว็บ
  เพราะจะชนกับ RLS — แผนที่สิทธิ์อยู่ที่ `lib/permissions.ts` และโชว์ใน Settings เป็นปุ่มอ่านอย่างเดียว
  แยก **มองเห็น** กับ **กรอก/แก้ไข** แล้ว (สินค้า: ทุกคนดูได้ แก้ได้เฉพาะ Admin)
- **ไม่เปิด Supavisor transaction pooler / ไม่ต่อ Postgres ตรงจากแอป** — แอปทั้งหมดคุยกับ Supabase ผ่าน
  `@supabase/supabase-js` (PostgREST เหนือ HTTPS) ไม่มี connection string (`pg`/`postgres`/ORM ตรง) อยู่ใน
  โค้ดแอปเลยสักจุด (`low-stock-alert` เองก็ใช้ supabase-js เหมือนกัน) การเปิด pooler mode ที่ dashboard จึง
  ไม่ช่วยลด connection overhead ของแอปนี้ตามที่มักเข้าใจกัน — ปรับ mode ได้เฉพาะตอนมีอะไรต่อ Postgres ตรง
  (เช่น `pg_dump` ใน `scripts/backup-db-to-r2.sh` ซึ่งต้องใช้ **Session/direct connection เท่านั้น** ห้ามใช้
  transaction-mode pooler เพราะ `pg_dump` ต้องการ session คงที่ตลอดการ dump)
- **ไม่ทำ cross-request in-memory cache แบบ custom (`unstable_cache`/Map เอง) สำหรับ query ที่ผ่าน
  Supabase client ปกติ** เพราะทุก query วิ่งผ่าน RLS ที่ผูกกับ session ของผู้ใช้ (`fn_current_role()`/
  `fn_current_branch()` อ่านจาก `auth.uid()`) — client ที่ใช้ (`lib/supabase/server.ts`) ต้องเรียก `cookies()`
  เสมอ ซึ่ง `unstable_cache` ของ Next.js ห้ามเรียก `cookies()`/`headers()` ข้างในอยู่แล้ว แคชข้ามผู้ใช้แบบนี้
  เสี่ยงข้อมูลรั่วข้าม role/สาขาโดยไม่ตั้งใจด้วย ที่ทำได้และปลอดภัยคือ React `cache()` ระดับ "ต่อ request เดียว"
  (`requireProfile` ใน `lib/auth.ts`, `getActiveBranches` ใน `lib/branch.ts`) ซึ่งไม่มีความเสี่ยงข้อมูลเก่าข้าม
  request เลย เพราะ cache reset ทุกครั้งที่มี request ใหม่
- **สำรองข้อมูลนอก Supabase ไปที่ Cloudflare R2 ทุกวัน** (ตัดสินใจแล้ว 2026-08-26) เพราะ project อยู่บน
  Free plan ที่ไม่มี automated backup/PITR ให้เลย — ใช้ `pg_dump` รันผ่าน cron บน VPS (ไม่ใช่ `pg_cron` ของ
  Supabase เพราะต้องมี process ภายนอกอัปโหลดไฟล์ได้) ดู `scripts/backup-db-to-r2.sh`

## สถานะที่ทำแล้ว (อัปเดต 2026-08-26)

- หน้าเว็บหลัก: แดชบอร์ด, เบิกใช้งาน (+แท็บของเสีย), รับของเข้า, ปรับปรุงสต๊อก, ประวัติ, รายงาน,
  สินค้า, ผู้ใช้, Audit Log, ตั้งค่า (Telegram + แผนที่สิทธิ์)
- Staff-safe views + `REVOKE SELECT` บน `item_stock` / `stock_transactions` (`0003_staff_safe_views.sql`)
- แก้จุดสั่งซื้อขั้นต่ำต่อสาขาจากแดชบอร์ด ผ่าน `fn_set_min_stock_level()`
- เชิญผู้ใช้ / เปลี่ยนบทบาท / ผูกสาขา / ปิดใช้งาน ที่ `/admin/users`
- สคริปต์นำเข้า CSV ระบบเดิม: `scripts/migrate-from-legacy.mjs`
- แก้ Supabase Security Advisor errors/warnings (`0004_notification_log_rls.sql`,
  `0005_harden_function_search_path.sql`): เปิด RLS ที่หลุดไปบน `notification_log` (deny-all เหมือน
  `integration_secrets`) และ pin `search_path` ให้ฟังก์ชัน `SECURITY DEFINER` ทั้ง 8 ตัว กัน search_path
  hijacking — error "Security Definer View" อีก 4 รายการ (`v_inventory_value`, `v_monthly_cogs`,
  `v_top_consumed_items_30d`, `v_low_stock`) เป็นดีไซน์ตั้งใจตามข้อ 5 ด้านบน ไม่ต้องแก้ ให้ dismiss ใน
  dashboard ได้เลย
- แก้บั๊ก `fn_approve_adjustment` 2 จุด (`0006`, `0007`): (1) ไม่ lock แถวก่อน update ทำให้กดอนุมัติ/ปฏิเสธ
  รายการเดียวกันพร้อมกันสองครั้งนับสต๊อกซ้ำได้ (2) อนุมัติปรับปรุงสต๊อกของ item ที่ยังไม่เคยมี `item_stock`
  ที่สาขานั้นมาก่อน จะผ่านเงียบๆ โดยไม่มีผลอะไรกับยอดจริงเลย — พร้อมเพิ่ม pgTAP test ครอบคลุมไว้ที่
  `supabase/tests/database/` (รันด้วย `supabase test db`)
- แก้ `createStockIn` ไม่กัน `NaN` (ยอดจ่ายกรอกผิดรูปแบบเคยหลุดเข้า `unit_cost_snapshot` ได้) และแก้ปุ่ม
  อนุมัติ/ปฏิเสธ + เปิด-ปิดสินค้าที่เคย throw error แบบเงียบไม่มี toast แจ้ง (`app/actions/stock.ts`,
  `pending-list.tsx`, `toggle-active-button.tsx`)
- ลดโค้ดซ้ำใน `app/actions/stock.ts` (logic ตรวจสิทธิ์สาขาที่ซ้ำกัน 5 จุด) และ dedupe query รายชื่อสาขาที่
  `(app)/layout.tsx` กับ `/admin/users` เคย query ซ้ำกันทุก request ด้วย React `cache()` (`getActiveBranches`
  ใน `lib/branch.ts`)

## เพิ่มเติม 2026-08-28

- **CI (`.github/workflows/ci.yml`)** — ก่อนหน้านี้ไม่มีอะไรรัน test/lint/build อัตโนมัติเลย ทั้งที่มี pgTAP
  ครอบกฎธุรกิจสำคัญอยู่แล้ว มี 2 job: `web` (lint → typecheck → build ด้วย env ปลอม) และ `database`
  (`supabase start` → `supabase test db`) — env ใน job `web` เป็นค่าปลอมโดยตั้งใจ เพราะทุกหน้าที่ query
  ข้อมูลเป็น dynamic route (เรียก `cookies()` ผ่าน `requireProfile()`) จึงไม่มีการต่อ DB จริงตอน build
  **ถ้าวันหนึ่ง build พังเพราะต่อ DB ไม่ได้ = มีหน้าที่กลายเป็น static ไปแล้ว ให้แก้หน้านั้น ห้ามเอา secret จริงใส่ CI**
- **แบ่งหน้า (pagination) ที่ประวัติกับ Audit Log** (`lib/pagination.ts`, `components/pagination.tsx`) —
  ของเดิมใช้ `.limit(100)` ตายตัวโดยไม่บอกผู้ใช้ พอข้อมูลเกิน 100 แถวจะตัดของเก่าทิ้งเงียบๆ อันตรายที่สุด
  คือ Audit Log ที่ออกแบบมาเพื่อตรวจสอบย้อนหลังแต่ย้อนได้แค่ 100 แถว ตอนนี้ใช้ `.range()` +
  `count: "exact"` แสดงช่วงที่กำลังดูและจำนวนทั้งหมด หน้าละ 50
- **หน้ารายงานเพิ่มตัวกรองช่วงเดือน + ดาวน์โหลด CSV** (`lib/reports.ts`, `lib/reports-range.ts`,
  `app/(app)/reports/export/route.ts`) — query อยู่ที่ `lib/reports.ts` ที่เดียว **ห้ามเขียน query ซ้ำใน
  ฝั่ง route** เพราะตัวเลขบนจอกับในไฟล์ CSV ต้องมาจากชุดเดียวกันเสมอ · route export บังคับสิทธิ์ชุด
  เดียวกับหน้าเว็บและใช้ client ปกติที่ผูกคุกกี้ผู้ใช้ **ห้ามเปลี่ยนไปใช้ admin client (service_role)
  เด็ดขาด** จะพัง RLS ทั้งหมด · CSV ใส่ BOM เพราะ Excel บน Windows อ่าน UTF-8 ไร้ BOM เป็น ANSI
  แล้วภาษาไทยกลายเป็นตัวขยะ
  - **`lib/reports-range.ts` แยกไว้ไม่มี `server-only`โดยตั้งใจ** เพื่อให้เขียนเทสต์ได้ ส่วนที่พลาดง่าย
    ที่สุดคือขอบเดือน — ใช้ `[gte, lt)` โดย `lt` = ต้นเดือนถัดจาก `to` **ห้ามเปลี่ยนเป็น `lte`
    กับต้นเดือน `to`** เพราะจะได้ข้อมูลแค่วันที่ 1 ของเดือนสุดท้ายแทนที่จะได้ทั้งเดือน
- **`scripts/inspect-inv-schema.sql`** — สคริปต์ **อ่านอย่างเดียว** สำหรับสะสาง schema แปลกปลอม `inv_`
  ใน `SneakerCareDB` รันใน SQL Editor ของ **โปรเจกต์นั้น** (ห้าม `supabase link` ไป) ตรวจ 6 ส่วน: รายการ
  object, สถิติการใช้งาน, **FK ที่โยงกับตารางอื่น**, object ที่พึ่งพา `inv_*`, จำนวนแถวจริง, function ที่เกี่ยวข้อง
  คำสั่ง drop คอมเมนต์ไว้ท้ายไฟล์พร้อม checklist — **ห้าม drop แบบ loop ตาม pattern และห้ามใช้ `cascade`**
  → **งานนี้ยังค้าง รอรันสคริปต์แล้วตัดสินใจ**

- **ตรวจ backup ว่ากู้ได้จริง + heartbeat (`scripts/verify-backup.sh`)** — โปรเจกต์ข้างเคียง
  (`cnxhaircutz`) เจอเมื่อ 2026-08-28 ว่าไฟล์สำรองที่ขึ้น "สำเร็จ" ทุกคืนติดต่อกันนาน แท้จริงกู้ไม่ได้เลย
  เพราะไม่มี `auth.users` ในไฟล์ ทั้งที่ `profiles.id` เป็น FK ไป `auth.users(id)` — **RRS มีโครงสร้าง
  เดียวกันเป๊ะ** (`0001_init.sql:42`) ต่างกันแค่เราใช้ `pg_dump` ทั้ง DB ซึ่งควรได้ schema `auth` มาด้วย
  สคริปต์นี้มีไว้พิสูจน์ว่าได้จริง ไม่ใช่เชื่อว่าน่าจะได้ · ตรวจ 5 อย่าง: ไฟล์ไม่เสีย, ขนาดสมเหตุสมผล,
  **ไฟล์ไม่เก่าเกิน 48 ชม.** (จับเคส cron ตาย), ทุกตารางใน `EXPECTED_TABLES` มี `TABLE DATA` จริง,
  และมี `auth.users` · **เพิ่มตารางใหม่ใน migration เมื่อไหร่ ต้องเติมชื่อใน `EXPECTED_TABLES` ด้วย**
  ไม่งั้นสคริปต์จะไม่รู้ว่าตารางนั้นหายไปจาก backup ซึ่งเป็นบั๊กประเภทเดียวกับที่มันมีไว้ดักพอดี
- **`backup-db-to-r2.sh` แจ้งเตือนตอนสำเร็จด้วยแล้ว ไม่ใช่เฉพาะตอนล้มเหลว** — ของเดิมเงียบสนิทเวลาปกติ
  ทำให้ "เงียบ" แยกไม่ออกระหว่าง *สำรองสำเร็จ* กับ *cron ตายไปแล้วจึงไม่มีอะไรรันและไม่มีอะไร fail*
  พอมีข้อความทุกวัน ความเงียบจึงกลายเป็นสัญญาณผิดปกติที่คนสังเกตได้เอง **ห้ามถอดการแจ้งเตือนตอนสำเร็จออก**
  ด้วยเหตุผลว่า "รก" — มันคือ heartbeat ไม่ใช่ log

## งานที่จงใจยังไม่ทำ

- **ไม่เชื่อม SC_Sales (POS) แบบ live** ในเฟสนี้ — พนักงานกรอกเลขบิลใน `reference_note` ตอนเบิก
  ดู `docs/architecture.md` §5
- ย้ายผู้ใช้เดิมจาก `SC_Users` ต้องเชิญใหม่ผ่าน `/admin/users` ห้ามนำเข้ารหัสผ่านเดิม
