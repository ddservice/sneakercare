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
- Edge Function `low-stock-alert` deploy แล้ว และมี `pg_cron` เรียกทุก 30 นาที

## กฎทางธุรกิจที่ต้องไม่ละเมิด (Non-negotiable business rules)

1. **`audit_logs` / `inv_audit_logs` ห้ามมี UPDATE/DELETE จากโค้ดแอปเด็ดขาด แม้แต่ endpoint ที่ role เป็น admin**
   การเขียน log เกิดจาก DB trigger เท่านั้น (`fn_write_audit_log`) — อย่าสร้าง API route หรือ Supabase RPC
   ที่ไปแก้ไขตาราง `audit_logs` ตรงๆ ไม่ว่ากรณีใด
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
/scripts                  เครื่องมือ: deploy-vps.mjs, backup-db-to-r2.sh, verify-backup.sh, inspect-inv-schema.sql, test-*.mjs
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

## คำสั่งที่ใช้บ่อย

- `npm run dev` — รัน Next.js dev server (บังคับ `--webpack` ไว้ใน package.json แล้ว)
- `npm run build` — production build (บังคับ `--webpack` เช่นกัน)
- `npm run typecheck` — `tsc --noEmit` ใช้เช็คเร็วๆ ระหว่าง dev
- `npm run test:legacy` — ตรวจแถบเตือน "ประมาณการ" ในหน้าภาพรวมของ legacy
- `npm run test:reports` — ตรวจตรรกะช่วงเดือน/CSV/เลขหน้า (46 ข้อ)
- `npm run deploy` — คำสั่ง Deploy ไปยัง VPS (`157.85.108.84`) อัตโนมัติในคลิกเดียว
- `bash scripts/backup-db-to-r2.sh` — สำรอง DB แบบ `pg_dump` แล้วอัปโหลดไป Cloudflare R2 พร้อมลบไฟล์เก่าเกิน 90 วัน
- `bash scripts/verify-backup.sh [--deep]` — ตรวจว่าไฟล์สำรองล่าสุดกู้คืนได้จริง

**⚠️ ห้ามลบ flag `--webpack` ออกจาก script `dev`/`build`**: จำเป็นสำหรับการ build บน network drive / UNC path

## สิ่งที่ตัดสินใจแล้ว

- **Hosting = VPS ไม่ใช่ Vercel** — PM2 + Nginx บนเครื่อง `157.85.108.84` (พอร์ต 3003)
- **ช่องทางแจ้งเตือนสต๊อกต่ำ = Telegram Bot API ส่งเข้ากลุ่มพนักงาน**
- **สาขา:** schema รองรับหลายสาขาไว้แล้วตั้งแต่ต้น
- **Admin เลือกสาขาจาก dropdown ใน header** (คุกกี้ `sc_active_branch`)
- **สำรองข้อมูลนอก Supabase ไปที่ Cloudflare R2 ทุกวัน + Retention 90 วัน** (อัปเดต 2026-08-28)
  ใช้ `pg_dump` รันผ่าน cron บน VPS ตี 3 ทุกคืน (`scripts/backup-db-to-r2.sh`) อัปโหลดไป Cloudflare R2 (`ddservicedb`)
  พร้อมลบไฟล์เก่าเกิน 90 วันทั้งบน VPS และ R2 อัตโนมัติ ตามด้วย `verify-backup.sh` ตรวจสอบความสมบูรณ์และส่ง Heartbeat เข้า Telegram

## เพิ่มเติม 2026-08-28

- **ลบข้อมูลและสินค้าทดสอบออกจากฐานข้อมูล** — ลบสินค้าเทส `RLS35 verify item` ออกถาวรแล้ว ปัจจุบันมีสินค้าจริง 46 รายการถ้วน
- **ระบบ Deploy ผ่านคำสั่งเดียว (`npm run deploy` / `scripts/deploy-vps.mjs`)** — ซิงก์โค้ดและรีสตาร์ต PM2 บน VPS ทันที
- **แถบเตือน "ประมาณการ" ในหน้าภาพรวมของ legacy** (`legacy/sneakercare_dashboard.html`) — มี badge และแถบเตือนเมื่อ opex ไม่ครบ มีเทสต์ครอบคลุม (`npm run test:legacy`) **ห้ามลบแถบเตือนนี้**
- **เทสต์ JS 2 ชุด** — `scripts/test-legacy-estimate-banner.mjs` และ `scripts/test-reports-range.mjs` (46 ข้อ) รันใน CI ได้
- **แบ่งหน้า (pagination) ที่ประวัติกับ Audit Log** — หน้าละ 50 รายการ
- **หน้ารายงานเพิ่มตัวกรองช่วงเดือน + ดาวน์โหลด CSV** — query รวมที่ `lib/reports.ts` พร้อมใส่ BOM สำหรับ Excel
- **ตรวจ backup ว่ากู้ได้จริง + heartbeat (`scripts/verify-backup.sh`)** — ตรวจโครงสร้างข้อมูล 55 ตาราง และ `auth.users` ครบถ้วน

## งานค้าง ณ 2026-08-28

1. **[เสร็จแล้ว] Push ขึ้น remote** — เชื่อม remote `origin` (`https://github.com/ddservice/sneakercare.git`) และ push branch `master` เรียบร้อยแล้ว
2. **[เสร็จแล้ว] Deploy ขึ้น VPS** — deploy ไปที่ `/var/www/sneakercare` รัน PM2 บนพอร์ต 3003 พร้อมคำสั่ง `npm run deploy`
3. **[เสร็จแล้ว] สำรองข้อมูล & ตรวจสอบ (Backup & Verify + Retention 90 วัน)** — อัปเดต credentials ของ `SneakerCareDB` บน VPS, รัน `backup-db-to-r2.sh` และ `verify-backup.sh` ผ่านฉลุย (✅ ไฟล์กู้คืนได้ โครงสร้าง ข้อมูลทุกตาราง และ auth.users ครบ 100% พร้อมลบไฟล์เก่าเกิน 90 วันอัตโนมัติ)
4. **[ตรวจสอบแล้ว] สะสาง schema `inv_` ใน `SneakerCareDB`** — รัน `scripts/inspect-inv-schema.sql` แล้วพบว่า `sc_users` ผูก FK กับ `inv_branches` และมีข้อมูล 46 items / 108 transactions จึงห้าม DROP เด็ดขาด (บันทึกข้อควรระวังไว้แล้ว)
5. **[เสร็จแล้ว] เคลียร์ข้อมูลทดสอบ & จัดระเบียบ VPS** — ลบสินค้าเทส `RLS35 verify item` ออกจาก DB (เหลือสินค้าจริง 46 รายการ) และเคลียร์ Docker cache / temp files บน VPS คืนพื้นที่ได้ ~3.48GB
6. **ตรวจหน้าตาบนเบราว์เซอร์**: แถบเตือน "ประมาณการ" ใน legacy, ปุ่มดาวน์โหลด CSV, ปุ่มแบ่งหน้า — logic ผ่านเทสต์ครบถ้วนแล้ว
7. **`verify-backup.sh --deep`** — ทดสอบกู้คืนลง Postgres ชั่วคราวใน Docker

## งานที่จงใจยังไม่ทำ

- **ไม่เชื่อม SC_Sales (POS) แบบ live** ในเฟสนี้ — พนักงานกรอกเลขบิลใน `reference_note` ตอนเบิก
  ดู `docs/architecture.md` §5
- ย้ายผู้ใช้เดิมจาก `SC_Users` ต้องเชิญใหม่ผ่าน `/admin/users` ห้ามนำเข้ารหัสผ่านเดิม
