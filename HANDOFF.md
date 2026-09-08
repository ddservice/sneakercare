# HANDOFF — งานค้างและวิธีทำต่อ

อัปเดต 2026-09-08 · เขียนไว้ให้ agent ตัวถัดไป (Antigravity / Claude Code / คนก็ได้) อ่านแล้วทำต่อได้เลย

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
- `npm run lint` **สะอาด 0 ปัญหาแล้ว** (2026-09-08 — เดิม 68 error + 71 warning ทำให้ CI แดงทุก push)
  ทางแก้คือ generate types ของตาราง `sc_*`/`extension_layer` แล้วถอด `as any` ออกจริง ไม่ใช่ปิด rule
  **ห้ามเพิ่ม `as any` ใหม่** — ดูรูปแบบที่ใช้แทนในหัวข้อ "lint สะอาด" ของ `CLAUDE.md`
- **ยังไม่เคยรัน**: `supabase test db` (ต้องมี Docker),
  `scripts/verify-backup.sh --deep` (ต้องมี Docker + pg_restore)
- **ยังไม่มีใครเปิดดูหน้าเว็บจริง** ของงานรอบนี้ (ดูงานที่ 4)
 
## กฎเหล็กสำหรับคนทำต่อ
 
1. **ห้าม push/deploy/แตะ production โดยไม่ถามเจ้าของก่อน** งานข้อ 2-3 ด้านล่างเป็นงานที่ต้องมี
   สิทธิ์หรือข้อมูลเฉพาะ ถ้าไม่มีให้บอกตรงๆ ว่าทำไม่ได้ **ห้ามเดา path บนเซิร์ฟเวอร์**
2. **ห้ามแก้ไฟล์ใน `supabase/migrations/` ที่ apply ไปแล้ว** เพิ่มไฟล์ใหม่ตามลำดับเวลาเท่านั้น
3. **ห้ามลบแถบเตือน "ประมาณการ"** ใน `legacy/sneakercare_dashboard.html` และห้ามถอดการแจ้งเตือน
   ตอนสำเร็จออกจาก `scripts/backup-db-to-r2.sh` **เด็ดขาด** — ทั้งสองอย่างมีเหตุผลอยู่ใน `CLAUDE.md`
   (2026-09-02: ทำให้ heartbeat "สำเร็จ" ส่งแบบไม่ปลุกมือถือตอนตีสาม/ตีสี่ได้ ผ่าน `notify "..." silent`
   — ข้อความยังส่งและยังขึ้นในแชทตามปกติ แค่ไม่สั่นไม่ดัง เป็นคนละเรื่องกับการ "ถอด" ที่ห้ามไว้)
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
- ~~⚠️ *สิ่งที่ต้องทำเพิ่มบน VPS:* เปลี่ยน `SUPABASE_DB_URL` ให้ชี้ไป `tecrcoienazmtbynuqpg`~~ **คำแนะนำนี้ผิด ห้ามทำตาม** — โปรเจกต์นั้นไม่มีอยู่จริงแล้ว ค่าปัจจุบันที่ชี้ไป `mdlxogfkpwejnqpzhmoy` ถูกต้องอยู่แล้ว (ยืนยันซ้ำ 2026-09-06 ด้วยการ pg_dump จาก VPS สำเร็จ)

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

## สรุปเซสชัน 2026-09-06 (ยาวมาก — อ่านตรงนี้ก่อนไปดูงานย่อย)

ทำไป 13 commit · migration `0012`–`0020` apply บน production ครบ · production รัน `87520ea`

**ความปลอดภัย (ทำเสร็จ):**
- rotate API key ไป key แบบใหม่ (`sb_publishable_` / `sb_secret_`) ครบ 3 จุด: dev, VPS, Supabase Vault
- **Telegram Bot Token เคยอ่านได้จากอินเทอร์เน็ตโดยไม่ต้องล็อกอิน** — revoke แล้ว + ปิดช่องแล้ว
- ปิดข้อมูลรั่วถึง `anon` ทั้งหมด (`0014`–`0016`): `sc_payments` (เคย**เขียนได้**ด้วย), `customers`,
  `profiles`, `inv_branches` (มี `telegram_chat_id`), `item_stock`/`stock_transactions` (**ข้อมูลต้นทุน**)
- ต้นเหตุที่หายากที่สุด: **SECURITY DEFINER view** — ปิด RLS ของตารางแน่นแค่ไหนก็ไร้ผลถ้ายังเข้าทาง view ได้
- เติม `requireModuleView()` ให้ครบทุกหน้า (เดิม `/expenses`, `/tax-filing` ฯลฯ พิมพ์ URL เข้าตรงได้)
- รวมแหล่งตัดสิน role ให้เหลือ `profiles` ที่เดียว (`sc_get_my_role` + `inv_fn_current_role`)

**ความถูกต้องของตัวเลข (ทำเสร็จ):**
- หน้าภาพรวมนับค่าใช้จ่ายขาด ฿6,600.51/เดือน (whitelist ชื่อหมวด) → รวมสูตรไว้ที่ `lib/expense-totals.ts`
  ที่เดียว มีเทสต์ 23 ข้อใน CI · ยอด ส.ค. 69 ตรงกับ Excel ที่เจ้าของคำนวณมือเป๊ะ (฿82,067.51)
- ลงค่าใช้จ่ายที่ยังไม่เคยบันทึก ฿24,496 (ค่าหุ้นส่วน + ของใช้ 11 รายการ)

**คุณภาพโค้ด (ทำเสร็จ):**
- generate `database.types.ts` จาก production จริง → ถอด `as any` 133 จุด → **เผยบั๊กที่พังเงียบ 7 จุด**
  (ดูตารางใน CLAUDE.md) · lint error 244 → 110 · type error 0

**เครื่องมือ/ความเสถียร (ทำเสร็จ):**
- migration baseline ของตาราง `sc_*` (`0012`) — เดิมกู้ระบบจากศูนย์แล้วไม่มีโมดูลการเงินเลย
- ลบ cron ที่ยิง 404 วันละ 48 ครั้ง (`0013`) · แก้ `test:migration` ที่คืน exit 127 เสมอ
- `verify-backup.sh` ตรวจครบ 18 ตาราง (เดิมขาด 5 ตารางรวมข้อมูลเงินเดือน)
- ปุ่มปิด/เปิดแจ้งเตือน backup ตี 3 ที่หน้า `/settings` (ตอนนี้ตั้ง **ปิด** ไว้)
- ปลดชนวน timestamp ที่ถูกเก็บในคอลัมน์จำนวนเงิน

---

## 🔔 Dead-man switch — โค้ดพร้อมแล้ว รอแค่ URL (2026-09-07)

`scripts/backup-db-to-r2.sh` และ `scripts/backup-monthly-csv.sh` รองรับ heartbeat ภายนอกแล้ว
**ยังไม่เปิดใช้** เพราะต้องมีบัญชี healthchecks.io ก่อน — ถ้าไม่ตั้งค่า สคริปต์ทำงานเหมือนเดิมทุกประการ

**ทำไมต้องมีทั้งที่มี Telegram อยู่แล้ว:** Telegram บอกได้แค่ "สิ่งที่เกิดขึ้น" ถ้า cron ตายทั้งตัว
(crontab หาย / เซิร์ฟเวอร์ไม่บูต / ไฟล์ env พัง) จะ**ไม่มีอะไรเกิดขึ้นเลย** จึงไม่มีข้อความส่ง และ
ไม่มีใครรู้จนถึงวันที่ต้องใช้ backup จริง — ยิ่งตอนนี้ปิดข้อความ "สำเร็จ" เข้ากลุ่มพนักงานไปแล้ว
(2026-09-06) ความเงียบยิ่งกลายเป็นสภาพปกติ

**วิธีเปิดใช้ (5 นาที):**
1. สมัคร https://healthchecks.io (แผนฟรีพอ)
2. สร้าง check ตัวที่ 1: ชื่อ "RRS DB backup" · **Period = 1 day · Grace = 2 hours**
3. สร้าง check ตัวที่ 2: ชื่อ "RRS CSV รายเดือน" · **Period = 1 month · Grace = 2 days**
   (ต้องแยก check เพราะรอบทำงานคนละความถี่ ใช้ตัวเดียวกันจะแยกไม่ออกว่าอันไหนขาด)
4. เพิ่ม 2 บรรทัดนี้ใน `/home/ddservice/sneakercare-backup.env` บน VPS:
   ```
   HEALTHCHECK_URL=https://hc-ping.com/<uuid-ของ-check-ตัวที่-1>
   HEALTHCHECK_CSV_URL=https://hc-ping.com/<uuid-ของ-check-ตัวที่-2>
   ```
5. คืนถัดไปถ้า backup ไม่ทำงาน healthchecks.io จะส่งอีเมลเตือนเองเมื่อเลย Grace

สคริปต์ยิง `/start` ตอนเริ่ม · URL เปล่าตอนสำเร็จ · `/fail` ตอน trap ERR ทำงาน
ทดสอบแล้วบน VPS: ไม่ตั้งค่า = ข้ามเงียบ · ปลายทางล่ม = ยังคืน 0 ไม่ทำให้ backup พังตาม

---

## 🔜 งานถัดไปที่แนะนำ (ทบทวนใหม่ 2026-09-08 — ตรวจกับ production จริงทุกข้อ)

**✅ งานที่ต้องกดบน Dashboard/VPS — ปิดครบแล้ว 2026-09-08** (รายละเอียดใน `CLAUDE.md`)
1. ~~disable legacy API key~~ **เสร็จ** · ตรวจแล้วไม่มีอะไรพัง — `inv-low-stock-alert` ยังคืน 200
2. ~~เปิด Leaked Password Protection~~ **ทำไม่ได้บนแผน FREE (Pro only) — ปิดเคส ห้ามไล่ให้ทำซ้ำ**
   แทนด้วยการตั้ง Minimum password length = 12 ก่อนเชิญพนักงานเข้าระบบ
3. ~~Dead-man switch~~ **เสร็จ** · ทดสอบขึ้นเขียวแล้ว
   ⬜ เหลือ: cron ของ **CSV รายเดือน** ยังไม่เคยถูกใส่ใน crontab เลย (ถ้าต้องการใช้ ดูคำสั่งใน CLAUDE.md)

**งานโค้ด:**
4. **แตก `sc_opex` ออกจาก key-value store — ทำไปแล้ว 5 ขั้นจาก 6 (2026-09-08)**
   ค่าใช้จ่าย/ห้องเช่าอ่านจากตารางใหม่แล้ว · เงินเดือนยังอ่านจาก `sc_opex` ตามที่เจ้าของเลือก
   **งานที่เหลือ: รอพนักงานกรอกฐานเงินเดือน มี.ค.–มิ.ย. 69 ให้ครบ แล้วค่อยสลับการอ่านเงินเดือน**
   (8 จาก 21 ใบไม่มีข้อมูลนี้ใน `sc_opex` เลย แอปเติม 12,000 ให้เองในโค้ด — ห้ามเดาแทน)
   · ขั้นที่ 6 (เลิกใช้ `sc_opex`) ยังทำไม่ได้จนกว่าหน้าการเงินของระบบเดิมจะถูกแทนที่
   <details><summary>บริบทเดิม</summary>
   ต้นตอบั๊กเงินทุกตัวที่เจอมา
   **📄 แผนละเอียดพร้อมลงมือแล้วที่ `docs/sc-opex-refactor-plan.md`** (6 ขั้น · ขั้น 0–4
   ประมาณ 3–4 วัน ได้ผลตอบแทนเกือบทั้งหมด) — มีสำรวจไว้แล้วว่า `sc_opex` เก็บของ **20 รูปแบบ**
   ปนกันใน 385 แถว และมีข้อจำกัดสำคัญ: **หน้าการเงินของระบบเดิมยังอ่าน/เขียน `sc_opex` ตรงๆ
   ผ่าน Google Apps Script** จึงต้องเป็นการ "เพิ่มตารางใหม่ข้างๆ" ไม่ใช่ "ย้ายแล้วทิ้งของเดิม"
   </details>
5. ~~เพิ่มตัวเลือกเกณฑ์ "ตามบิล / เงินเข้าจริง"~~ **เสร็จแล้ว 2026-09-08** (ปุ่มที่ `/dashboard`
   ค่าเริ่มต้นยังเป็นเงินเข้าจริงเสมอ)
6. ~~เก็บกวาด `as any` + lint error~~ **เสร็จแล้ว 2026-09-08 — lint 0 ปัญหา CI เขียวได้แล้ว**
   (เดิม 68 error + 71 warning ⇒ CI ล้มตั้งแต่ขั้น lint ทุก push เทสต์ที่เหลือไม่เคยได้รันเลย)
7. **ตรวจหน้าเว็บจริงด้วยตา** โดยเฉพาะ `/inventory` (แก้จำนวนสต๊อก), `/adjustments`, `/pos`
   — ลอง `claude-in-chrome` อีกครั้ง 2026-09-08 ยังได้ "Browser extension is not connected"
   เหมือนทุกเซสชันก่อนหน้า **ต้องให้เจ้าของตรวจเองหรือเชื่อม extension ที่ claude.ai/chrome ก่อน**

**เก็บกวาด:**
8. ~~บัญชีทดสอบค้างใน `profiles`~~ **ลบแล้ว 2026-09-08** (`stafftest_1788747294645` ทั้ง
   `profiles` และ Supabase Auth · ตรวจก่อนว่าไม่มี FK ผูก ledger)
   **⚠️ `rlsverify35.tmp.1787803110265@local.test` ลบไม่ได้และห้ามลบ** — มี 2 แถวใน
   `inv_audit_logs.performed_by` ผูกอยู่ ลบเท่ากับแก้ audit ย้อนหลัง ผิดกฎข้อ 1
   (ไม่มี `profiles` row จึงเข้าแอปไม่ได้อยู่แล้ว ปลอดภัย)
9. **`token github.txt` ที่ root ของโปรเจกต์** — เป็น token จริงในไฟล์ข้อความล้วน
   `.gitignore` กันไว้แล้วจึงไม่เคยหลุดขึ้น git แต่ถ้าไม่ได้ใช้แล้วควรลบทิ้ง (ไม่ลบให้เอง
   เพราะอาจเป็นตัวที่ใช้ push อยู่)

**[เสร็จแล้ว — ตัดออก]** ~~สร้าง staff-safe view~~ (`0021`) · ~~rotate Telegram token~~ (ยืนยัน
2026-09-08 ว่า token ไม่ตรงกับตัวที่หลุดแล้ว) · ~~เติม `requireModuleView` ให้ครบ~~ (20/22 หน้า)
· ~~revoke สิทธิ์ anon~~ (`0016` · ยิงจริงได้ 401) · ~~ปิด `sc_opex` จาก staff~~ (`0017`)

---

## งานที่ 6 — rotate `service_role` key + รหัสผ่าน Postgres [ทำไป 4/5 ขั้นแล้ว 2026-09-06]

**ทำไมยังค้าง:** ขั้นตอนที่ 1 และขั้นตอนสุดท้ายทำได้เฉพาะบนหน้าเว็บ Supabase Dashboard
เครื่อง dev และ VPS **ไม่มี `supabase` CLI และไม่มี Personal Access Token** (ตรวจแล้ว 2026-09-06)
Management API จึงเรียกไม่ได้ — อย่าเสียเวลาหาทางอ้อม ให้เจ้าของกดเอง

**สถานะ key ปัจจุบัน (2026-09-06):** `.env.local` ยังใช้ legacy JWT ทั้ง anon และ service_role
(ขึ้นต้น `eyJhbGciOiJI…` ยาว 219 ตัว) — ยังไม่เคยย้ายไป key แบบใหม่

### สถานะ (อัปเดต 2026-09-06 12:20)

| ขั้น | สถานะ |
|---|---|
| 1. สร้าง key แบบใหม่ที่ Dashboard | ✅ เจ้าของสร้างให้แล้ว (publishable + secret) |
| 2. สลับ `.env.local` ทั้ง dev และ VPS + rebuild | ✅ (rebuild ไม่ใช่แค่ restart — `NEXT_PUBLIC_*` ฝังตอน build) |
| 3. ทดสอบล็อกอิน / service_role / production | ✅ ผ่านหมด |
| 4. อัปเดต Vault `inv_service_role_key` + ทดสอบ cron จริง | ✅ ได้ 200 |
| 5. **disable legacy key ที่ Dashboard** | ⬜ **ยังไม่ได้ทำ — เหลือขั้นนี้ขั้นเดียว** |

⚠️ ก่อน/หลังกดขั้นที่ 5 อ่านหัวข้อ 🔴 ใน `CLAUDE.md` ให้จบก่อน — มีความเสี่ยงเรื่อง Edge Function
`inv-low-stock-alert` ที่ซอร์สไม่ได้อยู่ใน repo นี้ พร้อมคำสั่ง SQL สำหรับตรวจทันทีหลังกด และเงื่อนไข
ที่ต้องรีบกลับไป enable ใหม่

### ลำดับที่ปลอดภัย (ห้ามสลับขั้นตอน)

1. **[เจ้าของ]** Dashboard → Project Settings → API Keys → สร้าง key แบบใหม่
   (`sb_publishable_…` แทน anon, `sb_secret_…` แทน service_role) **ยังไม่ต้อง disable ของเก่า**
2. **[agent ทำได้]** แก้ `.env.local` บนเครื่อง dev + `/var/www/sneakercare/.env.local` บน VPS
   (ยืนยันแล้วว่าเป็นไฟล์เดียวที่มี key อยู่บน VPS) แล้ว `pm2 restart sneakercare`
3. **[agent ทำได้]** ทดสอบว่าใช้งานได้จริงก่อนไปต่อ — อย่างน้อย: ล็อกอิน (`scripts/test-login.mjs`),
   เปิด `/dashboard`, และหน้าที่ใช้ `service_role` จริงคือ `/admin/users` (เชิญผู้ใช้)
4. **⚠️ [เจ้าของ] อัปเดต Supabase Vault ด้วย** — cron `inv-low-stock-alert-daily-9am-th` อ่าน
   service_role key จาก `vault.decrypted_secrets` ชื่อ **`inv_service_role_key`** ไม่ได้อ่านจาก
   env var ของแอป **ถ้าลืมข้อนี้ แจ้งเตือนสต๊อกต่ำจะหยุดทำงานเงียบๆ โดยไม่มีใครรู้**
   (ตรวจว่ายังทำงานได้: ดู `net._http_response` ต้องเป็น 200 ไม่ใช่ 401)
5. **[เจ้าของ]** ค่อย disable legacy key ที่ Dashboard เป็นขั้นตอนสุดท้าย
6. เฝ้าดู 1 วันเต็ม: `pm2 logs sneakercare`, cron 9 โมงเช้าต้องได้ 200, backup ตี 3 ต้องส่ง
   heartbeat เข้า Telegram ตามปกติ

### รหัสผ่าน Postgres (`SUPABASE_DB_URL`)

เคยหลุดใน `scripts/backup-db.mjs` (ลบไฟล์ทิ้งไปแล้ว) ถ้า rotate ต้องแก้
`/home/ddservice/sneakercare-backup.env` บน VPS **ในคืนเดียวกันทันที** ไม่งั้น backup ตี 3
กับ `verify-backup.sh` จะพังคืนนั้นเลย — และ Telegram จะเงียบ ซึ่งตามกฎข้อ 3 แปลว่า "ผิดปกติ"

---

## งานที่ 7 — cron `low-stock-alert-30min` ยิง 404 ทุก 30 นาที [เสร็จแล้ว 2026-09-06]

พบ 2026-09-06 จากการตรวจ `cron.job` จริง: มี cron **สองตัว** ที่ `active = true` ไม่ใช่ตัวเดียว
อย่างที่เอกสารรุ่นก่อนสรุปไว้

| jobid | ชื่อ | schedule | เป้าหมาย | ผลจริง |
|---|---|---|---|---|
| 3 | `inv-low-stock-alert-daily-9am-th` | `0 2 * * *` (9 โมงเช้าไทย) | `inv-low-stock-alert` | **200 OK** ปกติ |
| 4 | `low-stock-alert-30min` | `*/30 * * * *` | `low-stock-alert` (ถูกลบไปแล้ว) | **404 ทุกครั้ง** |

Edge Function `low-stock-alert` ถูกลบออกจากโปรเจกต์เมื่อ 2026-09-01 แต่ **ไม่มีใครลบ cron ที่เรียกมัน**
ตั้งแต่นั้นมาระบบยิง HTTP 404 วันละ 48 ครั้งเปล่าๆ (`{"code":"NOT_FOUND"}` ใน `net._http_response`)
ไม่กระทบข้อมูลหรือการแจ้งเตือนจริง แต่เป็นขยะที่ทำให้คนอ่าน log ในอนาคตเข้าใจผิดได้

**แก้แล้ว (เจ้าของอนุมัติ 2026-09-06):** รัน `select cron.unschedule('low-stock-alert-30min')`
บน production เรียบร้อย ตรวจซ้ำแล้วเหลือ job เดียวคือ `inv-low-stock-alert-daily-9am-th` (active)
และเพิ่ม `supabase/migrations/0013_unschedule_dead_low_stock_cron.sql` ให้ repo ตรงกับของจริง
(0002 ยังคงสร้าง job นี้บนฐานข้อมูลใหม่ แล้ว 0013 ลบทิ้งทีหลัง — ไม่แก้ 0002 ตามกฎข้อ 2)

**บทเรียนสำคัญ:** `cron.job_run_details.status = 'succeeded'` **ไม่ได้แปลว่า HTTP สำเร็จ** —
pg_net ทำงานแบบ async สถานะนั้นบอกแค่ว่า "ยิงคำสั่งออกไปแล้ว" การตรวจว่าปลายทางตอบอะไรจริงต้องดู
ตาราง `net._http_response` เสมอ (เอกสารรุ่นก่อนสรุปว่า cron ทำงานปกติจากคอลัมน์นี้ ซึ่งไม่พอ)

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
