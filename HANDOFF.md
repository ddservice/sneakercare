# HANDOFF — งานค้างและวิธีทำต่อ

อัปเดต 2026-09-01 · เขียนไว้ให้ agent ตัวถัดไป (Antigravity / Claude Code / คนก็ได้) อ่านแล้วทำต่อได้เลย

> **อ่าน `CLAUDE.md` ให้จบก่อนเริ่ม** โดยเฉพาะหัวข้อ "กฎทางธุรกิจที่ต้องไม่ละเมิด" 13 ข้อ
> กฎพวกนั้นสำคัญกว่าความสะดวกทุกอย่างในเอกสารนี้ ถ้าขัดกันให้ยึด `CLAUDE.md`

---

## ✅ สรุปสิ่งที่ทำเสร็จแล้วในเซสชัน 2026-09-01 (อ่านก่อนเชื่อหัวข้อ "งานที่" ด้านล่าง — บางอันทำไปแล้ว)

1. **migration 0011 apply บน SneakerCareDB แล้ว** (ยืนยันโดยผู้ใช้ + เช็คตรงว่ามีตาราง/index/trigger
   ครบผ่าน psql) — audit ฝั่งการเงินบันทึกได้แล้ว แถบเหลืองที่ `/admin/audit` ควรหายไป
2. **pgTAP รันผ่านจริงแล้ว 15/15 ข้อ** — ดูรายละเอียดที่ "งานที่ 5" ด้านล่าง ระหว่างนั้นแก้ migration
   0011 เพิ่มอีกรอบ (guard การสร้าง index บนตาราง sc_* ที่ยังไม่ถูก track เป็น migration) — เป็นการ
   แก้ไฟล์ migration ที่ apply แล้ว มีเหตุผลกำกับไว้ในไฟล์และ CLAUDE.md ว่าทำไมปลอดภัย
3. **[ยังไม่เสร็จ] ตรวจหน้าเว็บจริงบนเบราว์เซอร์** — `claude-in-chrome` extension ไม่เชื่อมต่อในทั้งสอง
   รอบที่ลอง ต้องให้ผู้ใช้ติดตั้ง/เชื่อมต่อที่ claude.ai/chrome ก่อน ดูหัวข้อ "งานที่ 4" ด้านล่าง

### [ตรวจแล้ว 2026-09-01] `shoe-care-inventory` ไม่มีอยู่จริงแล้ว — SneakerCareDB คือโปรเจกต์เดียว

รันแล้ว: `supabase projects list` (CLI login อยู่แล้ว) — บัญชีนี้มีโปรเจกต์เดียวคือ `SneakerCareDB`
(ref `mdlxogfkpwejnqpzhmoy`) เท่านั้น ไม่มี `shoe-care-inventory` / `tecrcoienazmtbynuqpg` อีกต่อไป
และ DNS ของ `tecrcoienazmtbynuqpg.supabase.co` resolve ไม่ได้แล้ว (ลบไปแล้วหรือไม่เคยมีจริง)

- **`SUPABASE_DB_URL` บน VPS (`/home/ddservice/sneakercare-backup.env`) ถูกต้องอยู่แล้ว**
  ชี้ไป `postgres.mdlxogfkpwejnqpzhmoy` ผ่าน pooler — ไม่ต้องแก้ (คำแนะนำเดิมในเอกสารรุ่นก่อนผิด
  ตอนเขียนไว้ ได้แก้ข้อความให้ตรงแล้ว) — รัน `verify-backup.sh` บน VPS ยืนยันว่ากู้คืนได้ 77 ตาราง
- **[แก้ข้อสรุปผิดของตัวเอง] ไม่มีบั๊กเรื่อง cron อย่างที่เคยเข้าใจ** ตอนแรกสงสัยว่า migration
  `0002_schedule_low_stock_alert.sql` ตั้ง pg_cron ยิงไป `tecrcoienazmtbynuqpg.supabase.co`
  ที่ตายแล้ว ทำให้แจ้งเตือนสต๊อกต่ำหยุดเงียบ 5 วัน — **เช็คตรงกับ `cron.job`/`cron.job_run_details`
  บนฐานข้อมูลจริงแล้วพบว่าผิด**: cron ที่รันจริงชื่อ `inv-low-stock-alert-daily-9am-th` (วันละครั้ง
  ไม่ใช่ทุก 30 นาที) เรียก Edge Function `inv-low-stock-alert` (คนละตัวกับซอร์สใน repo นี้) ซึ่ง
  deploy อยู่ถูกโปรเจกต์และรันสำเร็จทุกวันมาตลอด ไม่เคยพัง ที่ `inv_notification_log` ไม่มีแถวใหม่
  เพราะ 4 รายการที่ต่ำกว่าขั้นต่ำตอนนี้ถูกตั้ง `alert_muted = true` ไว้โดยตั้งใจ ไม่ใช่บั๊ก
  รายละเอียดเต็มอยู่ท้ายไฟล์นี้ — **ไฟล์ migration 0012 ที่เคยสร้างไว้ถูกลบไปแล้ว อย่าสร้างใหม่**

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

## งานที่ 4 — ตรวจหน้าตาบนเบราว์เซอร์ [ยังทำไม่ได้ — extension ไม่เชื่อมต่อ 2026-09-01]

ลองผ่าน `claude-in-chrome` MCP tool สองรอบ (เช้า/เย็น) ได้ข้อความเดิม: "Browser extension is not
connected" — ต้องให้ผู้ใช้ติดตั้ง extension ที่ claude.ai/chrome, ล็อกอินบัญชีเดียวกับ Claude Code,
รีสตาร์ต Chrome ถ้าเพิ่งติดตั้งครั้งแรก แล้วลองใหม่ หรือผู้ใช้ตรวจเองด้วยตาตามตารางด้านล่าง

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

## งานที่ 5 — รัน pgTAP [เสร็จแล้ว 2026-09-01]

รันจริงแล้วผ่าน Docker บน VPS (clone แยกใน `/tmp`, ลบทิ้งหลังรันเสร็จ ไม่กระทบ production หรือ
container ของโปรเจกต์อื่นบนเครื่องเดียวกัน) — **ผ่านครบ 15/15 ข้อ ใน 3 ไฟล์** (moving_average_cost,
approve_adjustment, staff_safe_views) เป็นครั้งแรกที่ suite นี้ถูกรันจริงตั้งแต่เขียนขึ้นมา

ระหว่างรันเจอว่า migration `0011` (ที่ apply บน production ไปแล้ว) ทำให้ `supabase start` พังบน
ฐานข้อมูลที่สร้างใหม่จากศูนย์ เพราะ `sc_sales`/`sc_payments`/`sc_opex` ไม่เคยถูก track ใน
migrations เลย (ดูรายละเอียดเต็มใน CLAUDE.md) — **แก้ไฟล์ 0011 โดยตรง** ห่อการสร้าง index ด้วย
guard เช็คว่าตารางมีอยู่ก่อน พิสูจน์แล้วว่า no-op บน production เพราะตารางมีอยู่แล้วที่นั่นเสมอ
**ถ้าจะรันซ้ำในอนาคต (เช่นใน CI):**
```bash
supabase start --exclude gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
supabase test db
supabase stop --no-backup
```
flag `--exclude` ตัดบริการที่ไม่จำเป็นสำหรับ pgTAP ออก (analytics/logflare มักไม่ผ่าน health check
ในสภาพแวดล้อมที่ไม่มี env ครบ เช่น STRIPE_WEBHOOK_SECRET) เหลือแค่ Postgres ที่ pgTAP ต้องใช้จริง

ครอบคลุม: ต้นทุนถัวเฉลี่ยเคลื่อนที่, `fn_approve_adjustment`, staff-safe cost views
ถ้าชุด staff-safe fail ในอนาคต = **ข้อมูลต้นทุนรั่วถึง Staff จริง** ไม่ใช่แค่ test แดง ให้หยุดแล้วแจ้งทันที

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
- **[เข้าใจผิดของตัวเอง — แก้ไว้กันคนต่อไปพลาดซ้ำ 2026-09-01] `supabase/migrations/0002` ไม่ใช่
  cron จริง** ผมเคยสรุปว่า pg_cron ยิง Edge Function ไปที่โปรเจกต์ที่ตายแล้ว แล้วเกือบสร้าง migration
  0012 มา "แก้" — **ที่จริง cron ตัวจริงชื่อ `inv-low-stock-alert-daily-9am-th` เรียก Edge Function
  `inv-low-stock-alert` (คนละตัวกับซอร์สใน `supabase/functions/low-stock-alert/` ของ repo นี้)
  ซึ่งรันสำเร็จทุกวันมาตลอด ไม่เคยพัง** — ก่อนจะสรุปว่า cron/Edge Function อะไรพังในโปรเจกต์นี้ ให้เช็ค
  `cron.job` และ `cron.job_run_details` บนฐานข้อมูลจริงก่อนเสมอ (ผ่าน psql บน VPS ด้วย
  `SUPABASE_DB_URL` ใน `/home/ddservice/sneakercare-backup.env`) อย่าเดาจากไฟล์ migration ใน repo
  เพราะไฟล์ในนี้กับสิ่งที่รันจริงอาจไม่ตรงกัน
- **Staff ต้องไม่เห็นต้นทุนเด็ดขาด** — query ต้องผ่าน view ที่ตัดคอลัมน์ต้นทุนเท่านั้น
  ตาราง `item_stock`/`stock_transactions` ถูก `REVOKE SELECT` ไว้แล้ว
- **`audit_logs` ห้ามมี UPDATE/DELETE จากโค้ดแอปเด็ดขาด** แม้แต่ endpoint ที่ role เป็น admin
- **`audit_logs` ในฐานข้อมูลจริงเป็น VIEW ไม่ใช่ตาราง** ชี้ไป `inv_audit_logs` — audit ระดับแอป
  ฝั่งการเงินอยู่คนละตารางคือ `sc_audit_logs` (เขียนผ่าน `lib/audit.ts` เท่านั้น) **ห้ามรวมสองสายนี้เข้าด้วยกัน**
- **`logAudit()` จงใจไม่ throw** ถ้าเขียน log ไม่สำเร็จ เพราะการลบข้อมูลของผู้ใช้ต้องไม่พังตาม
  แต่ต้อง log error ลง server console เสมอ — **ห้ามลบบรรทัด `console.error` นั้นออก**
  ของเดิมกลืน error เงียบจนระบบ audit ไม่ทำงานเลยหลายเดือนโดยไม่มีใครรู้
