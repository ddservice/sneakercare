# HANDOFF — งานค้างและวิธีทำต่อ

อัปเดต 2026-08-28 · เขียนไว้ให้ agent ตัวถัดไป (Antigravity / Claude Code / คนก็ได้) อ่านแล้วทำต่อได้เลย

> **อ่าน `CLAUDE.md` ให้จบก่อนเริ่ม** โดยเฉพาะหัวข้อ "กฎทางธุรกิจที่ต้องไม่ละเมิด" 13 ข้อ
> กฎพวกนั้นสำคัญกว่าความสะดวกทุกอย่างในเอกสารนี้ ถ้าขัดกันให้ยึด `CLAUDE.md`

---

## สถานะปัจจุบัน
 
- branch `master` · tracking `origin/master` (`https://github.com/ddservice/sneakercare.git`) · push สำเร็จแล้ว
- ผ่านหมดแล้วบนเครื่อง dev: `npm run lint`, `npm run typecheck`, `npm run build`,
  `npm run test:legacy`, `npm run test:reports`
- **ยังไม่เคยรัน**: `supabase test db` (ต้องมี Docker),
  `scripts/verify-backup.sh --deep` (ต้องมี Docker + pg_restore)
 
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

## งานที่ 2 — Deploy ขึ้น VPS ⚠️ ต้องถามเจ้าของก่อน

**รอบนี้ไม่มี migration ใหม่** เป็น code-only ไม่ต้อง `supabase db push`

```bash
# บน VPS
cd <path-ของ-RRS>          # ถามเจ้าของ อย่าเดา
git pull
npm ci
npm run build              # ห้ามถอด --webpack ออก (ดู CLAUDE.md)
pm2 restart <ชื่อ-app>      # ถามเจ้าของ อย่าเดา
```

**หลัง deploy ต้องทำเพิ่ม 2 อย่าง:**

1. แก้ crontab ให้ตรวจ backup ต่อท้ายทุกคืน:
   ```
   0 3 * * * /usr/bin/env bash -c 'set -a; source /etc/rrs-backup.env; set +a; \
     <path>/scripts/backup-db-to-r2.sh && <path>/scripts/verify-backup.sh' \
     >> /var/log/rrs-backup.log 2>&1
   ```
2. รัน `bash scripts/verify-backup.sh --deep` **ด้วยมือหนึ่งครั้ง** ก่อนไว้ใจมัน
   (ต้องมี Docker + `postgresql-client-17` บน VPS) โหมดนี้ยังไม่เคยรันจริงที่ไหนเลย

**หมายเหตุ:** `legacy/sneakercare_dashboard.html` deploy คนละทางกับแอป Next.js
ต้องถามเจ้าของว่าไฟล์นั้นเสิร์ฟจากไหน แถบเตือน "ประมาณการ" อยู่ในไฟล์นี้

---

## งานที่ 3 — สะสาง schema `inv_` ใน SneakerCareDB ⚠️ production ที่มีข้อมูลขายจริง

**บริบท:** พบตาราง/view prefix `inv_` โผล่ใน `SneakerCareDB` (ref `mdlxogfkpwejnqpzhmoy`) เมื่อ
2026-08-26 ไม่ได้มาจาก migration ใน repo นี้ และไม่มีใครในทีมตั้งใจสร้าง

**ขั้นตอน:**

1. เปิด Supabase Dashboard → SQL Editor ของโปรเจกต์ **`SneakerCareDB`**
   **ห้าม `supabase link` ไปที่โปรเจกต์นั้นเด็ดขาด** repo นี้ link อยู่กับ `shoe-care-inventory`
   (ref `tecrcoienazmtbynuqpg`) ซึ่งเป็นคนละตัว
2. รัน `scripts/inspect-inv-schema.sql` — **อ่านอย่างเดียวทั้งไฟล์ ไม่มี DROP สักบรรทัด**
3. อ่านผลทั้ง 6 ส่วน โดยเฉพาะ §3 (FK) และ §5 (จำนวนแถว)
4. drop ได้ก็ต่อเมื่อครบ checklist ท้ายไฟล์: §3 ว่าง, §4 ว่าง, §5 ทุกตาราง 0 แถว, มี backup แล้ว
5. **ห้าม drop แบบ loop ตาม pattern และห้ามใช้ `cascade`** — พลาดครั้งเดียวกินตาราง `sc_*`
   ที่มีข้อมูลขายจริงได้

---

## งานที่ 4 — ตรวจหน้าตาบนเบราว์เซอร์ (ยังไม่มีใครเห็น)

logic ผ่านเทสต์หมดแล้ว แต่ CSS/layout ยังไม่มีใครตรวจ ต้องดู 3 จุด:

| จุด | ดูอะไร |
|---|---|
| แถบเตือน "ประมาณการ" (หน้าภาพรวม legacy) | สีเหลืองอ่านออกไหม ตำแหน่งใต้การ์ดกำไรสุทธิถูกไหม badge ไม่ล้นกรอบ |
| `/reports` | ฟอร์มช่วงเดือนเรียงสวยบนมือถือไหม ปุ่ม CSV โหลดไฟล์ได้จริงไหม เปิดใน Excel แล้วภาษาไทยไม่เพี้ยน |
| `/history`, `/admin/audit` | ปุ่มก่อนหน้า/ถัดไปทำงาน ข้อความ "แสดง x–y จาก z" ตรงกับข้อมูลจริง |

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
- **มี Supabase 2 โปรเจกต์ที่สับสนกันได้ง่ายมาก** — `shoe-care-inventory` (repo นี้ link อยู่) กับ
  `SneakerCareDB` (ข้อมูลขายจริงจากระบบเดิม) เช็คให้แน่ทุกครั้งก่อนรันอะไรที่เขียนข้อมูล
- **Staff ต้องไม่เห็นต้นทุนเด็ดขาด** — query ต้องผ่าน view ที่ตัดคอลัมน์ต้นทุนเท่านั้น
  ตาราง `item_stock`/`stock_transactions` ถูก `REVOKE SELECT` ไว้แล้ว
- **`audit_logs` ห้ามมี UPDATE/DELETE จากโค้ดแอปเด็ดขาด** แม้แต่ endpoint ที่ role เป็น admin
