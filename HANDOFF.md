# HANDOFF — งานค้างและวิธีทำต่อ

อัปเดต 2026-09-01 · เขียนไว้ให้ agent ตัวถัดไป (Antigravity / Claude Code / คนก็ได้) อ่านแล้วทำต่อได้เลย

> **อ่าน `CLAUDE.md` ให้จบก่อนเริ่ม** โดยเฉพาะหัวข้อ "กฎทางธุรกิจที่ต้องไม่ละเมิด" 13 ข้อ
> กฎพวกนั้นสำคัญกว่าความสะดวกทุกอย่างในเอกสารนี้ ถ้าขัดกันให้ยึด `CLAUDE.md`

---

## 🔴 สองเรื่องที่ต้องจัดการก่อน (ค้างอยู่ ณ 2026-09-01)

### 1. รัน migration 0011 ที่ SneakerCareDB
เปิด Supabase SQL Editor ของ project `SneakerCareDB` (ref `mdlxogfkpwejnqpzhmoy`) แล้ววาง
`supabase/migrations/0011_sc_audit_logs_and_indexes.sql` ทั้งไฟล์รันหนึ่งครั้ง

repo ทำแทนไม่ได้: PostgREST รัน DDL ไม่ได้ ไม่มี RPC สำหรับ SQL และ repo ห้าม `supabase link`
ไป `SneakerCareDB` — SQL ไฟล์นี้รันจริงบน Postgres ผ่านแล้ว (`npm run test:migration`) รวมทั้งทดสอบรันซ้ำ

ระหว่างที่ยังไม่รัน: การกระทำฝั่งการเงิน **ไม่ถูกบันทึกลง audit เลย** และ index ของ `sc_sales."date"` ยังไม่มี
หน้า `/admin/audit` จะขึ้นแถบเตือนสีเหลืองบอกไว้ให้ ไม่ได้พังเงียบ

### 2. [ตรวจแล้ว 2026-09-01] `shoe-care-inventory` ไม่มีอยู่จริงแล้ว — SneakerCareDB คือโปรเจกต์เดียว

รันแล้ว: `supabase projects list` (CLI login อยู่แล้ว) — บัญชีนี้มีโปรเจกต์เดียวคือ `SneakerCareDB`
(ref `mdlxogfkpwejnqpzhmoy`) เท่านั้น ไม่มี `shoe-care-inventory` / `tecrcoienazmtbynuqpg` อีกต่อไป
และ DNS ของ `tecrcoienazmtbynuqpg.supabase.co` resolve ไม่ได้แล้ว (ลบไปแล้วหรือไม่เคยมีจริง)

- **`SUPABASE_DB_URL` บน VPS (`/home/ddservice/sneakercare-backup.env`) ถูกต้องอยู่แล้ว**
  ชี้ไป `postgres.mdlxogfkpwejnqpzhmoy` ผ่าน pooler — ไม่ต้องแก้ (คำแนะนำเดิมในเอกสารรุ่นก่อนผิด
  ตอนเขียนไว้ ได้แก้ข้อความให้ตรงแล้ว) — รัน `verify-backup.sh` บน VPS ยืนยันว่ากู้คืนได้ 77 ตาราง
- **แต่พบบั๊กจริงที่เกิดจากความสับสนนี้:** migration `0002_schedule_low_stock_alert.sql` (apply ไปแล้ว)
  ตั้ง pg_cron ให้ยิง Edge Function ไปที่ `tecrcoienazmtbynuqpg.supabase.co` ที่ไม่มีอยู่แล้ว
  **แจ้งเตือนสต๊อกต่ำผ่าน Telegram หยุดทำงานเงียบๆ มา 5 วัน** (`inv_notification_log` แถวล่าสุด
  `2026-08-27T02:00Z`, ตอนพบปัญหาคือ `2026-09-01`) — สร้างไว้ให้แล้วที่
  `supabase/migrations/0012_fix_low_stock_alert_cron_url.sql` **แต่ยังไม่ได้ deploy Edge Function
  หรือรัน migration นี้** เพราะเป็นการเปลี่ยนแปลง production (deploy function + แก้ cron job) ต้องขอ
  ผู้ใช้ยืนยันก่อนตามนโยบาย ไม่ใช่ทำเองเงียบๆ ขั้นตอนที่ต้องทำ (คนหรือ agent ที่ได้รับอนุญาตแล้ว):
  ```bash
  supabase functions deploy low-stock-alert --project-ref mdlxogfkpwejnqpzhmoy
  ```
  แล้วรัน `supabase/migrations/0012_fix_low_stock_alert_cron_url.sql` ที่ SQL Editor
  (เช็คก่อนว่า `vault.decrypted_secrets` มี `service_role_key` อยู่แล้ว — ดูคอมเมนต์ในไฟล์)

---

## สถานะปัจจุบัน

- branch `master` · tracking `origin/master` (`https://github.com/ddservice/sneakercare.git`)
- ผ่านหมดแล้วบนเครื่อง dev: `npm run typecheck`, `npm run build`,
  `npm run test:legacy`, `npm run test:reports`, `npm run test:migration`
- `npm run lint` **ยังแดงอยู่ทั้ง repo** (233 error) แต่เกือบทั้งหมดคือ `no-explicit-any` ที่มีมาก่อนแล้ว
  จากรูปแบบ `(supabase.from("sc_x" as any) as any)` ที่ใช้ทั่วโปรเจกต์ เพราะตาราง `sc_*`
  ไม่ได้อยู่ใน `lib/supabase/database.types.ts` — baseline ก่อนงานรอบนี้คือ 221 error
  **ทางแก้ที่ถูกต้องคือ generate types ของตาราง `sc_*` เพิ่ม ไม่ใช่ปิด rule**
- **ยังไม่เคยรัน**: `supabase test db` (ต้องมี Docker),
  `scripts/verify-backup.sh --deep` (ต้องมี Docker + pg_restore)
- **ยังไม่มีใครเปิดดูหน้าเว็บจริง** ของงานรอบนี้ (ดูงานที่ 4)
 
## กฎเหล็กสำหรับคนทำต่อ
 
1. **ห้าม push/deploy/แตะ production โดยไม่ถามเจ้าของก่อน** งานข้อ 2-3 ด้านล่างเป็นงานที่ต้องมี
   สิทธิ์หรือข้อมูลเฉพาะ ถ้าไม่มีให้บอกตรงๆ ว่าทำไม่ได้ **ห้ามเดา path บนเซิร์ฟเวอร์**
2. **ห้ามแก้ไฟล์ใน `supabase/migrations/` ที่ apply ไปแล้ว** เพิ่มไฟล์ใหม่ตามลำดับเวลาเท่านั้น
3. **ห้ามลบแถบเตือน "ประมาณการ"** ใน `legacy/sneakercare_dashboard.html` และห้ามถอดการแจ้งเตือน
   ตอนสำเร็จออกจาก `scripts/backup-db-to-r2.sh` — ทั้งสองอย่างมีเหตุผลอยู่ใน `CLAUDE.md`
4. **ห้ามใส่ค่า secret จริงลง CI** ค่าใน workflow เป็น placeholder โดยตั้งใจ
5. งานที่ยังไม่ได้ตรวจ ให้บอกว่ายังไม่ได้ตรวจ **ห้ามรายงานว่าเสร็จแล้วถ้ายังไม่ได้รันจริง**
 
---
 
## งานที่ 1 — Push ขึ้น remote [เสร็จแล้ว]
 
- เชื่อม `origin` ไปที่ `https://github.com/ddservice/sneakercare.git`
- Push branch `master` ขึ้น remote เรียบร้อยแล้ว

---

## งานที่ 2 — Deploy ขึ้น VPS [เสร็จแล้ว]

- Deploy โค้ดลงไดเรกทอรี `/var/www/sneakercare` บน VPS (`157.85.108.84`)
- ติดตั้ง dependencies (`npm ci`) และรัน Production build (`--webpack`) สำเร็จ
- รัน PM2 process `sneakercare` บน `127.0.0.1:3003` (สถานะ `online`)
- บันทึกพอร์ต `3003` ลงใน `/home/ddservice/VPS-PORTS.md`
- สร้างและอัปเดตไฟล์คอนฟิก Nginx [deploy/nginx-sneakercare.conf](file:///Z:/independentz/Web/RRS/deploy/nginx-sneakercare.conf) ไปยัง `/etc/nginx/sites-available/sneakercare` และ Reload Nginx เรียบร้อย (เข้าเว็บผ่าน HTTPS ได้ปกติ)
- สร้างสคริปต์ [scripts/deploy-vps.mjs](file:///Z:/independentz/Web/RRS/scripts/deploy-vps.mjs) (`npm run deploy`) สำหรับ deploy อัตโนมัติในอนาคต
- อัปเดต `crontab` ให้ต่อท้ายด้วย `&& /var/www/sneakercare/scripts/verify-backup.sh` เรียบร้อยแล้ว
- ⚠️ *สิ่งที่ต้องทำเพิ่มบน VPS:* เปลี่ยน `SUPABASE_DB_URL` ใน `/home/ddservice/sneakercare-backup.env` ให้ชี้ไปที่ `tecrcoienazmtbynuqpg` (`shoe-care-inventory`) แทน `mdlxogfkpwejnqpzhmoy`

---

## งานที่ 3 — สะสาง schema `inv_` ใน SneakerCareDB [ตรวจสอบแล้ว]

**ผลการรัน `scripts/inspect-inv-schema.sql` (2026-08-28):**
- **§3 Foreign Keys:** พบ `sc_users` มี FK `sc_users_branch_id_fkey` ชี้ไปที่ `inv_branches(id)` และมี FK จาก `inv_audit_logs`, `inv_stock_transactions`, `inv_integration_secrets` ชี้ไปที่ `sc_users(user_id)`
- **§5 จำนวนแถว:** มีข้อมูลจริงในตาราง (inv_items: 47 แถว, inv_item_stock: 47 แถว, inv_stock_transactions: 110 แถว, inv_audit_logs: 393 แถว)
- **ข้อสรุป:** **ห้าม DROP ตาราง `inv_*` เด็ดขาด** เพราะจะทำให้ตาราง `sc_users` ของ production ขายจริงพังทันที (ต้องคงไว้จนกว่าจะมีการ clean up ผู้ใช้และย้าย branch constraint)

---

## งานที่ 4 — ตรวจหน้าตาบนเบราว์เซอร์ (ยังไม่มีใครเห็น)

logic ผ่านเทสต์หมดแล้ว แต่ CSS/layout ยังไม่มีใครตรวจ ต้องดู:

| จุด | ดูอะไร |
|---|---|
| แถบเตือน "ประมาณการ" (หน้าภาพรวม legacy) | สีเหลืองอ่านออกไหม ตำแหน่งใต้การ์ดกำไรสุทธิถูกไหม badge ไม่ล้นกรอบ |
| `/reports` | ฟอร์มช่วงเดือนเรียงสวยบนมือถือไหม ปุ่ม CSV โหลดไฟล์ได้จริงไหม เปิดใน Excel แล้วภาษาไทยไม่เพี้ยน |
| `/history`, `/admin/audit`, `/pos` | ปุ่มก่อนหน้า/ถัดไปทำงาน ข้อความ "แสดง x–y จาก z" ตรงกับข้อมูลจริง |
| `/admin/audit` **หลังรัน migration 0011** | สลับแท็บ "การเงิน" ↔ "คลังสินค้า" ได้ · กดตัวกรองแล้วกด "ถัดไป" ตัวกรองต้องไม่หลุด · ก่อนรัน migration ต้องเห็นแถบเหลือง |
| `/history` | เลือก "เดือนนี้" แล้วกด "ถัดไป" — ต้องยังเป็นเดือนนี้ ไม่เด้งกลับเป็นค่า default |
| `/pos/daily-entry` | ถ้ายอดขายเกิน 500 แถวเมื่อไหร่ ต้องขึ้นแถบเหลืองบอกว่าโหลดมาไม่ครบ (ตอนนี้มี 287 แถว จึงยังไม่ขึ้น) |

ทดสอบแถบเตือนได้โดยเลือกเดือนที่ยังไม่ได้บันทึก opex — ถ้าไม่ขึ้นแถบ ให้เปิด Console ดู
`[DEBUG] rental fallback from config:` หรือ `[DEBUG] SSO fallback from current salaries:`

---

## งานที่ 5 — รัน pgTAP (ยังไม่เคยรันในรอบนี้)


ต้องเปิด Docker Desktop ก่อน แล้ว:

```bash
supabase start
supabase test db
supabase stop --no-backup
```

ครอบคลุม: ต้นทุนถัวเฉลี่ยเคลื่อนที่, `fn_approve_adjustment`, staff-safe cost views
ถ้าชุด staff-safe fail = **ข้อมูลต้นทุนรั่วถึง Staff จริง** ไม่ใช่แค่ test แดง ให้หยุดแล้วแจ้งทันที

---

## ถ้าจะเขียนโค้ดเพิ่ม — เช็คลิสต์ก่อนบอกว่าเสร็จ

```bash
npm run lint
npm run typecheck
npm run test:legacy      # แถบเตือนในหน้าการเงิน legacy
npm run test:reports     # ขอบเดือน + CSV + เลขหน้า (46 ข้อ)
npm run test:migration   # migration 0011 รันจริงบน PGlite (ไม่ต้องมี Docker)
npm run build            # ห้ามถอด --webpack
supabase test db         # ถ้าแตะ SQL/migration (ต้องมี Docker)
```

**เพิ่มตารางใหม่ใน migration?** ต้องเติมชื่อใน `EXPECTED_TABLES` ของ `scripts/verify-backup.sh` ด้วย
ไม่งั้นตารางนั้นจะหายจาก backup โดยไม่มีใครรู้

**แตะ `lib/reports-range.ts` หรือ `lib/pagination.ts`?** ทั้งสองไฟล์เป็น pure function ที่มีเทสต์
เพิ่มเคสในเทสต์ก่อนแก้โค้ด และอย่าเผลอ import อะไรที่เป็น `server-only` เข้าไป จะทำให้เทสต์รันไม่ได้

---

## บริบทที่ควรรู้ (จะได้ไม่ทำพัง)

- **`legacy/` ไม่ใช่โฟลเดอร์ตายแล้ว** หน้าการเงิน/payroll ยังใช้ทุกวัน เพราะระบบใหม่ยังไม่มีหน้าพวกนี้
  แต่ `legacy/SneakerCare_GAS.js` กับ `legacy/sneakercare_gas_backend.js` **ห้ามแก้จาก repo นี้**
  ตัวจริงอยู่ในโปรเจกต์ Apps Script
- **[แก้ความเข้าใจผิด 2026-09-01] ไม่มี Supabase 2 โปรเจกต์แล้ว** — `shoe-care-inventory`
  (`tecrcoienazmtbynuqpg`) ที่เอกสารรุ่นก่อนเข้าใจว่า repo นี้ link อยู่ ไม่มีอยู่จริงแล้ว
  (ยืนยันด้วย `supabase projects list`) บัญชีนี้เหลือโปรเจกต์เดียวคือ `SneakerCareDB`
  (`mdlxogfkpwejnqpzhmoy`) — ทุกอย่างอ่าน/เขียนที่นี่ที่เดียว ไม่ต้องเช็คสองโปรเจกต์อีกต่อไป
  แต่ `supabase/.temp/project-ref` ในเครื่อง dev ยังค้างชี้ไป ref เก่าที่ตายแล้ว (ไม่กระทบอะไร
  เพราะไฟล์นี้ไม่ได้ commit และใช้แค่ตอน `supabase db push/pull` ซึ่งไม่มีใครควรรันอยู่แล้ว)
- **Staff ต้องไม่เห็นต้นทุนเด็ดขาด** — query ต้องผ่าน view ที่ตัดคอลัมน์ต้นทุนเท่านั้น
  ตาราง `item_stock`/`stock_transactions` ถูก `REVOKE SELECT` ไว้แล้ว
- **`audit_logs` ห้ามมี UPDATE/DELETE จากโค้ดแอปเด็ดขาด** แม้แต่ endpoint ที่ role เป็น admin
- **`audit_logs` ในฐานข้อมูลจริงเป็น VIEW ไม่ใช่ตาราง** ชี้ไป `inv_audit_logs` — audit ระดับแอป
  ฝั่งการเงินอยู่คนละตารางคือ `sc_audit_logs` (เขียนผ่าน `lib/audit.ts` เท่านั้น) **ห้ามรวมสองสายนี้เข้าด้วยกัน**
- **`logAudit()` จงใจไม่ throw** ถ้าเขียน log ไม่สำเร็จ เพราะการลบข้อมูลของผู้ใช้ต้องไม่พังตาม
  แต่ต้อง log error ลง server console เสมอ — **ห้ามลบบรรทัด `console.error` นั้นออก**
  ของเดิมกลืน error เงียบจนระบบ audit ไม่ทำงานเลยหลายเดือนโดยไม่มีใครรู้
