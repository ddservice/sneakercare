# CLAUDE.md

คำแนะนำสำหรับ Claude Code เมื่อทำงานในโปรเจกต์นี้ — ระบบบริหารจัดการคลังสินค้าสำหรับร้านบริการทำความสะอาด/ซ่อมแซมรองเท้า

## ภาพรวมโปรเจกต์

ระบบนี้แทนที่ระบบเดิมที่เขียนด้วย Google Apps Script + Google Sheets + HTML ไฟล์เดียว (เก็บไว้ที่ `legacy/`
เพื่ออ้างอิงตอน migrate ข้อมูลเท่านั้น — **ห้ามแก้ไขหรือรันไฟล์ใน `legacy/` เป็นระบบ production**)

อ่านบริบทการตัดสินใจทั้งหมดที่ `docs/architecture.md` ก่อนเริ่มงานทุกครั้งที่ไม่แน่ใจว่า "ทำไมถึงออกแบบแบบนี้"
และดู schema เต็มที่ `docs/database-schema.sql`

## Stack

- Frontend: Next.js (App Router, TypeScript) + Tailwind CSS + shadcn/ui
- Backend/DB: Supabase (PostgreSQL + Auth + Row Level Security + Edge Functions)
- Hosting: Vercel (frontend) + Supabase Cloud

## Supabase project ที่ใช้งานจริง

- Project นี้ (inventory) = `shoe-care-inventory`, ref `tecrcoienazmtbynuqpg`, org `SneakerCare` — link ไว้แล้ว
  ผ่าน `supabase link` (ไฟล์ `supabase/.temp/` ไม่ได้ commit)
- **ห้ามสับสนกับ `SneakerCareDB` (ref `mdlxogfkpwejnqpzhmoy`)** — นั่นคือโปรเจกต์เดิมที่มีข้อมูลขายจริง
  (`sc_sales`, `sc_payments`, ...) จากระบบ legacy อยู่ ห้าม `supabase link` ไปที่ project นั้นเด็ดขาดถ้าไม่ได้
  ตั้งใจจะยุ่งกับข้อมูลเดิม
- Edge Function `low-stock-alert` deploy แล้ว และมี `pg_cron` (ดู `supabase/migrations/0002_schedule_low_stock_alert.sql`)
  เรียกทุก 30 นาที โดยดึง service_role key จาก `supabase.vault` (ไม่มี secret อยู่ในไฟล์ migration ที่ commit)
- มี branch แรกในระบบแล้ว: "SneakerCare สาขาหลัก" และมี Admin account เดียว (เชิญผ่านอีเมลแล้ว)

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
- `supabase db push` — apply migrations ไปยัง Supabase project (ต้อง `supabase link` ก่อน)
- `supabase db diff` — ตรวจสอบ schema drift ก่อน commit migration ใหม่
- `npm run migrate:legacy -- --branch-id <uuid> --performed-by <admin-uuid> --stock ./import/SC_Stock_Status.csv --dry-run`
  — นำเข้า CSV จาก Google Sheets (ดูหัวข้อใน `scripts/migrate-from-legacy.mjs`) ห้าม copy รหัสผ่านจากระบบเดิม
  วางไฟล์ CSV ไว้ที่ `/import` (gitignored) อย่า commit ข้อมูลร้าน

**⚠️ ห้ามลบ flag `--webpack` ออกจาก script `dev`/`build`**: บนเครื่องที่ repo อยู่บน mapped network
drive (UNC path) Turbopack ของ Next.js เวอร์ชันนี้ resolve path ผิดพลาด (`Cannot depend on path ... outside
of root directory`) เพราะเทียบ UNC path กับ drive-letter path ไม่ตรงกัน ทำให้ build พังเฉพาะบนเครื่องแบบนี้
เท่านั้น (โค้ดแอปไม่ได้ผิด) `--webpack` เป็นทางแก้ที่ยืนยันแล้วว่าใช้ได้จริง

## สิ่งที่ตัดสินใจแล้ว

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

## สถานะที่ทำแล้ว (อัปเดต 2026-08-14)

- หน้าเว็บหลัก: แดชบอร์ด, เบิกใช้งาน (+แท็บของเสีย), รับของเข้า, ปรับปรุงสต๊อก, ประวัติ, รายงาน,
  สินค้า, ผู้ใช้, Audit Log, ตั้งค่า (Telegram + แผนที่สิทธิ์)
- Staff-safe views + `REVOKE SELECT` บน `item_stock` / `stock_transactions` (`0003_staff_safe_views.sql`)
- แก้จุดสั่งซื้อขั้นต่ำต่อสาขาจากแดชบอร์ด ผ่าน `fn_set_min_stock_level()`
- เชิญผู้ใช้ / เปลี่ยนบทบาท / ผูกสาขา / ปิดใช้งาน ที่ `/admin/users`
- สคริปต์นำเข้า CSV ระบบเดิม: `scripts/migrate-from-legacy.mjs`

## งานที่จงใจยังไม่ทำ

- **ไม่เชื่อม SC_Sales (POS) แบบ live** ในเฟสนี้ — พนักงานกรอกเลขบิลใน `reference_note` ตอนเบิก
  ดู `docs/architecture.md` §5
- ย้ายผู้ใช้เดิมจาก `SC_Users` ต้องเชิญใหม่ผ่าน `/admin/users` ห้ามนำเข้ารหัสผ่านเดิม
