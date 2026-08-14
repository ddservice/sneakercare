# สถาปัตยกรรมระบบบริหารคลังสินค้า — ร้านบริการทำความสะอาด/ซ่อมแซมรองเท้า

## 1. ทำไมต้อง "สร้างใหม่" แทนที่จะแก้ระบบเดิม

ระบบเดิม (`SneakerCare_GAS.js`, `sneakercare_gas_backend.js`, `sneakercare_dashboard.html`) เป็น
Google Sheets + Apps Script + HTML/JS ไฟล์เดียว ซึ่งพบข้อจำกัดเชิงโครงสร้างที่แก้ไขแบบเดิมไม่ได้จริง:

| ปัญหาที่พบในโค้ดเดิม | ผลกระทบ |
|---|---|
| อ่าน-แก้ยอดคงเหลือแบบ `getRange → คำนวณ → setValue` ไม่มี transaction | เกิด race condition ได้เมื่อพนักงาน 2 คนเบิกพร้อมกัน ยอดสต๊อกเพี้ยน |
| Admin/Co-Admin มีสิทธิ์เปิด Google Sheet ตรงได้เสมอ | ใครก็แก้/ลบแถวใน Sheet ได้โดยไม่ผ่านแอป ทำให้ "Audit Log ห้ามแก้ไข/ลบเด็ดขาด" **เป็นไปไม่ได้จริง** ในสถาปัตยกรรมนี้ |
| ไม่มีตาราง Audit Log เลย มีแค่คอลัมน์ `LastUpdated` | ตรวจสอบย้อนหลังไม่ได้ว่าใครแก้อะไร ค่าเดิมคืออะไร |
| `sneakercare_gas_backend.js` แฮชรหัสผ่านด้วย SHA-256 ไม่ใส่ salt, ส่วน `SneakerCare_GAS.js` เก็บรหัสผ่านเป็น plain text | เสี่ยงข้อมูลรั่วไหลรุนแรงหากมีคน export ชีตออกไป |
| สต๊อกเป็นจำนวนเต็มต่อ "ชิ้น" เท่านั้น | ไม่รองรับการตัดสต๊อกน้ำยาเป็น "มิลลิลิตร" ตามที่ใช้จริง |
| ไม่มีกลไกแจ้งเตือนสต๊อกต่ำอัตโนมัติ (มีแค่ค่า `min_alert` เฉยๆ) | ของหมดโดยไม่รู้ตัว |
| RBAC ทำที่ชั้นแอป (if role !== 'admin') เท่านั้น ไม่มีการบังคับที่ชั้นข้อมูล | บั๊กใน frontend เพียงจุดเดียวเปิดช่องให้ staff แก้ข้อมูลการเงินได้ |

ข้อกำหนดของระบบใหม่ — โดยเฉพาะ **"Audit Log ห้ามลบ/แก้ไขได้เด็ดขาดแม้แต่ Admin"** และ **"ตัดสต๊อกตามปริมาณจริงระดับมิลลิลิตร"** —
ต้องพึ่งพา constraint/transaction/permission ที่บังคับใช้ได้จริงในระดับฐานข้อมูลเชิงสัมพันธ์ (RDBMS)
ซึ่ง Google Sheets ให้ไม่ได้โดยธรรมชาติ จึง**แนะนำให้สร้างระบบใหม่**

## 2. Stack ที่แนะนำ

| ชั้น | เทคโนโลยี | เหตุผล |
|---|---|---|
| Frontend | **Next.js 14+ (App Router, TypeScript) + Tailwind CSS + shadcn/ui** | UI แบบ Minimal ปรับ responsive ให้ใช้บนแท็บเล็ต/PC ง่าย, deploy ฟรีบน Vercel |
| Backend/DB | **Supabase (PostgreSQL + Auth + Row Level Security + Storage + Edge Functions)** | RLS บังคับ RBAC ที่ชั้นฐานข้อมูลจริง, Transaction/Trigger ป้องกัน race condition, Free tier เพียงพอสำหรับร้านขนาดเล็ก-กลาง, มี Auth พร้อมใช้ไม่ต้องเขียน token ระบบเอง |
| Audit trail | Postgres trigger + `REVOKE UPDATE, DELETE` บนตาราง `audit_logs` และ `stock_transactions` | บังคับ immutability ที่ชั้น DB จริง ไม่ใช่แค่ซ่อนปุ่มในหน้าเว็บ |
| แจ้งเตือนสต๊อกต่ำ | **Telegram Bot API (sendMessage)** ผ่าน Supabase Edge Function ที่รันตาม cron (`pg_cron` หรือ Supabase Scheduled Edge Function) | ตัดสินใจแล้ว (2026-07-10) — ใช้ Telegram แทน LINE เพราะ ⚠️ **LINE Notify ถูกยกเลิกให้บริการแล้วตั้งแต่ 31 มี.ค. 2025** และ LINE Messaging API ต้องขอสร้าง LINE Official Account ก่อน ส่วน Telegram Bot สร้างผ่าน `@BotFather` ได้ทันที ไม่มี business verification และไม่จำกัดจำนวนข้อความ/เดือน Email (Resend) ยังคงเป็นช่องทางสำรอง |
| Hosting | Vercel (frontend) + Supabase Cloud (DB/Auth) | ต้นทุนต่ำ ดูแลง่าย ไม่ต้องมี DevOps เอง |

### 2.1 การแจ้งเตือนสต๊อกต่ำผ่าน Telegram — ขั้นตอนตั้งค่า

**Bot Token ตั้งค่าผ่านหน้าเว็บ (Settings → เฉพาะ Admin เห็นเมนูนี้) ไม่ใช่ Supabase Secret ที่ต้องเข้า CLI**
เพราะเจ้าของร้านต้องแก้ token เองได้โดยไม่ต้องพึ่งนักพัฒนา — ออกแบบเป็น pattern **"write-only secret"**:
Admin กรอก token แล้วกดบันทึกได้ แต่**ดึงค่าจริงกลับมาแสดงไม่ได้อีก แม้แต่ Admin เอง** หน้า Settings จะโชว์แค่
สถานะ "ตั้งค่าแล้ว (ลงท้าย ****1234)" กับวันที่แก้ไขล่าสุด เพื่อไม่ให้ token รั่วไหลผ่าน browser devtools,
extension ที่เป็นอันตราย, หรือใครก็ตามที่ยืมเครื่อง Admin ไปใช้

กลไกที่รองรับ (ดู `docs/database-schema.sql`):
- ตาราง `integration_secrets` — `REVOKE SELECT/INSERT/UPDATE/DELETE` จาก `authenticated` ทั้งหมด ไม่มีใคร
  query ตรงได้แม้แต่ Admin
- RPC `fn_set_integration_secret(key, value)` — Admin เท่านั้นเรียกได้ ใช้บันทึก/แก้ไข token (เขียนได้ทางเดียว)
- RPC `fn_integration_secret_status(key)` — คืนแค่ `is_set`, 4 ตัวท้าย, และวันที่แก้ไข ไม่คืนค่าเต็ม
- Edge Function อ่านค่าจริงได้ทางเดียวคือผ่าน **service_role key** (bypass RLS) ซึ่งรันอยู่ฝั่งเซิร์ฟเวอร์เท่านั้น
  ไม่มีทางเข้าถึงจาก browser ได้เลย
- `audit_logs` ที่บันทึกการแก้ไข `integration_secrets` ถูก mask คอลัมน์ `value` เป็น `***masked***` ไว้แล้วใน
  trigger `fn_write_audit_log` เพื่อไม่ให้ token จริงหลุดไปอยู่ใน audit trail

ขั้นตอนตั้งค่าจริง:
1. คุยกับ `@BotFather` บน Telegram → `/newbot` → ได้ **Bot Token**
2. เพิ่มบอทเข้า**กลุ่ม Telegram ของพนักงาน** (ตัดสินใจแล้ว — ใช้กลุ่มรวม ไม่ใช่แชทส่วนตัวคนเดียว เพื่อให้ทุกคน
   ในสาขาเห็นแจ้งเตือนพร้อมกัน) แล้วหา **chat_id** ด้วยการส่งข้อความทดสอบในกลุ่มครั้งเดียว แล้วเรียก
   `https://api.telegram.org/bot<token>/getUpdates` เพื่ออ่านค่า `chat.id`
3. Admin ล็อกอินเข้าเว็บ → หน้า Settings → กรอก Bot Token ลงฟอร์ม → เรียก `fn_set_integration_secret('telegram_bot_token', token)`
4. บันทึก chat_id ลงคอลัมน์ `branches.telegram_chat_id` ของสาขานั้นผ่านหน้า Settings เดียวกัน (คอลัมน์นี้ไม่ใช่
   ความลับระดับเดียวกับ token จึงเก็บเป็น plain column ที่ Admin แก้ผ่าน UI ปกติได้) — ออกแบบไว้ต่อสาขาล่วงหน้า
   เพราะร้านมีแผนขยายสาขาในอนาคต แต่ละสาขาจะมีกลุ่มพนักงาน/chat_id ของตัวเองได้ ส่วน Bot Token ใช้ตัวเดียวร่วมกัน
   ทุกสาขาได้ (Telegram แยกปลายทางด้วย chat_id ไม่ใช่ด้วย token)
5. Edge Function `low-stock-alert`: อ่าน token จาก `integration_secrets` ด้วย service_role key → วนทุกสาขาที่
   `telegram_chat_id is not null` → query `v_low_stock` กรองตาม `branch_id` → ถ้ามีรายการที่ยังไม่เคยแจ้งวันนี้
   (เช็คกับ `notification_log` ที่ `channel = 'telegram'` และ `branch_id` ตรงกัน) → POST ไปที่ `sendMessage`
   ด้วย chat_id ของสาขานั้น → insert แถวลง `notification_log` กันแจ้งซ้ำ
6. ตั้ง cron รัน Edge Function นี้ทุก 30-60 นาทีผ่าน `pg_cron` (`select cron.schedule(...)`) หรือ Supabase
   Scheduled Functions

**ทางเลือกที่พิจารณาแต่ไม่แนะนำ:**
- *AppSheet / No-Code บน Google Sheets* — แก้ปัญหา UI ได้ แต่ตัว datastore ยังเป็น Sheets เดิม ปัญหา race condition และ audit log ที่แก้ไม่ได้เด็ดขาดยังอยู่เหมือนเดิม
- *PocketBase (SQLite)* — เบากว่า self-host ง่ายกว่า Supabase แต่ SQLite ไม่รองรับ concurrent write หนักเท่า Postgres และการบังคับ "ห้ามแก้ audit log แม้แต่เจ้าของเครื่อง" ทำได้ยากกว่าเพราะไฟล์ฐานข้อมูลอยู่บนเครื่องเดียวกับแอป เหมาะกับร้านที่ไม่ต้องการพึ่ง cloud service เลย แต่ trade-off เรื่องความปลอดภัยของ audit log จะอ่อนกว่า Supabase ที่แยก service account ชัดเจน

## 3. หลักการออกแบบสำคัญ (ดู schema เต็มที่ `docs/database-schema.sql`)

### 3.1 สินค้าคงคลัง vs สิ้นเปลือง
ใช้ตาราง `items` ตารางเดียว แยกด้วยคอลัมน์ `item_type` (`inventory` | `consumable`) แทนการแยกตาราง เพราะ
ทั้งสองประเภทมีโครงสร้างข้อมูล (สต๊อก, ต้นทุน, min stock, unit) เหมือนกันเกือบทั้งหมด ต่างกันแค่ "พฤติกรรมการตัด" —
consumable ตัดสต๊อกละเอียดระดับ `base_unit` (เช่น ml, g) ส่วน inventory ส่วนใหญ่ `base_unit = purchase_unit = 'ชิ้น'`

ระบบหน่วยรองรับการแปลงหน่วยซื้อ → หน่วยตัดสต๊อก: `purchase_unit_qty` บอกว่า 1 หน่วยที่ซื้อ (เช่น 1 ขวด)
เท่ากับกี่หน่วยฐาน (เช่น 1000 ml) ทำให้รับของเข้าเป็น "ขวด" แต่ตัดออกเป็น "ml" ได้ในตารางเดียวกัน

### 3.1.1 รองรับหลายสาขา (ตอนนี้มี 1 สาขา แต่ออกแบบไว้ล่วงหน้า)
ปัจจุบันร้านมีสาขาเดียว แต่ schema แยก **"นิยามสินค้า" (`items`)** ออกจาก **"ยอดคงเหลือต่อสาขา" (`item_stock`)**
ตั้งแต่ต้น เพื่อไม่ให้ต้อง migrate schema แบบ breaking change ตอนเปิดสาขาใหม่ในอนาคต:
- `items` = แคตตาล็อกสินค้ากลาง ใช้ร่วมกันทุกสาขา (ชื่อ, หน่วย, หมวดหมู่) แก้ไขได้เฉพาะ Admin เพราะกระทบทุกสาขา
- `item_stock` = ยอดคงเหลือ, ต้นทุนถัวเฉลี่ย, จุดสั่งซื้อขั้นต่ำ **แยกอิสระต่อสาขา** (unique ต่อคู่ `item_id`+`branch_id`)
- `stock_transactions`, `profiles`, `notification_log` มีคอลัมน์ `branch_id` ทุกตาราง — staff/co_admin ถูกผูกกับ
  สาขาเดียวผ่าน `profiles.branch_id` (บังคับด้วย constraint) ส่วน Admin ปล่อย `branch_id = null` ได้ = มองเห็นทุกสาขา
- ตอนเปิดสาขาใหม่ในอนาคต: เพิ่มแถวใน `branches` แล้วให้ Admin/Co-Admin ทำ `stock_in` ครั้งแรกของสาขานั้น
  ระบบจะสร้างแถว `item_stock` ให้อัตโนมัติผ่าน trigger (ไม่ต้อง seed ข้อมูลมือ)

### 3.2 Stock Transactions เป็น Ledger แบบ Append-only
ยอดคงเหลือ (`items.current_qty`) เป็นแค่ cache ที่อัปเดตผ่าน trigger เท่านั้น ที่มาที่แท้จริงคือผลรวมของ
`stock_transactions` การแก้ไขข้อมูลผิดพลาดทำโดย**สร้างรายการใหม่ที่อ้างอิง `corrects_txn_id`** แทนการ UPDATE
แถวเดิม — ทำให้ audit trail สมบูรณ์แบบธรรมชาติ ไม่ต้องพึ่งตาราง log แยกสำหรับ stock movement

### 3.3 ต้นทุน/COGS — Moving Average Cost
ใช้วิธีต้นทุนถัวเฉลี่ยเคลื่อนที่ (คำนวณอัตโนมัติผ่าน trigger `fn_apply_stock_transaction`):
- รับเข้า (`stock_in`): ต้นทุนเฉลี่ยใหม่ = (ของเดิม×ต้นทุนเดิม + ของเข้า×ต้นทุนใหม่) / จำนวนรวม
- เบิกออก (`stock_out`/`waste`): ใช้ต้นทุนเฉลี่ย ณ ขณะนั้นเป็น COGS ที่บันทึกลง `unit_cost_snapshot`

เลือกวิธีนี้เพราะเรียบง่ายกว่า FIFO/LIFO และเหมาะกับร้านขนาดเล็กที่ไม่ต้องการ track lot/batch แยกราย

### 3.4 RBAC บังคับที่ชั้นฐานข้อมูล (Row Level Security)
ทุก policy ผูกกับ `profiles.role` ผ่านฟังก์ชัน `fn_current_role()` สรุปสิทธิ์:

| การกระทำ | Admin | Co-Admin | Staff |
|---|:---:|:---:|:---:|
| ขอบเขตสาขาที่มองเห็น | ทุกสาขา | เฉพาะสาขาตัวเอง (`profiles.branch_id`) | เฉพาะสาขาตัวเอง |
| ดูยอดคงเหลือ/รายการสินค้า | ✅ | ✅ | ✅ |
| ดูต้นทุน/กำไร/COGS | ✅ | ✅ | ❌ view แยกไม่มีคอลัมน์ cost + REVOKE SELECT บนตารางฐาน (ดู migration 0003) |
| รับเข้า/เบิกออก (ปกติ) | ✅ ทุกสาขา | ✅ เฉพาะสาขาตัวเอง | เบิกออกได้เฉพาะของตัวเอง ในสาขาตัวเอง |
| แก้ไขแคตตาล็อกสินค้ากลาง (`items`) | ✅ | ❌ (กระทบทุกสาขาถ้าแก้ได้) | ❌ |
| แก้จุดสั่งซื้อขั้นต่ำต่อสาขา (`item_stock`) | ✅ ทุกสาขา ผ่าน `fn_set_min_stock_level()` | ✅ เฉพาะสาขาตัวเอง | ❌ |
| ปรับปรุงสต๊อก (Adjustment) | ✅ สร้าง+อนุมัติได้ทันที | ✅ สร้างได้ แต่สถานะ `pending_approval` | ❌ |
| อนุมัติ Adjustment | ✅ ผ่าน `fn_approve_adjustment()` | ❌ | ❌ |
| จัดการสิทธิ์ผู้ใช้/สาขา | ✅ | ❌ | ❌ |
| อ่าน Audit Log | ✅ ทุกสาขา (read-only) | ✅ เฉพาะสาขาตัวเอง (read-only) | ❌ |
| แก้ไข/ลบ Audit Log | ❌ ไม่มีใครทำได้ (`REVOKE` ระดับ DB) | ❌ | ❌ |

### 3.5 Audit Log ที่แก้ไม่ได้เด็ดขาด
`audit_logs` ถูก `REVOKE UPDATE, DELETE, INSERT` จาก role `authenticated` ทั้งหมด — การเขียน log
ทำได้ทางเดียวคือผ่าน trigger function ที่รันด้วยสิทธิ์ `SECURITY DEFINER` (เจ้าของฟังก์ชันคือ superuser
ของโปรเจกต์ ไม่ใช่ผู้ใช้แอป) แปลว่า **แม้แต่ Admin ก็ไม่มีสิทธิ์ทาง SQL ที่จะ UPDATE/DELETE แถวใน
audit_logs ได้ ต่อให้เดา query ตรงก็ยังโดนบล็อกด้วย GRANT/REVOKE ของ Postgres เอง** ไม่ใช่แค่ซ่อน UI

## 4. Dashboard (สรุปตาม view ที่เตรียมไว้)
ทุก view คืนคอลัมน์ `branch_id` มาด้วย — frontend ต้อง `where branch_id = current_user_branch` เสมอ
ยกเว้น Admin ที่เลือกดูรวมทุกสาขาได้ (หรือ filter ทีละสาขาจาก dropdown)
- **สินค้าที่ต้องสั่งซื้อด่วน** → `v_low_stock`
- **มูลค่าคลังสินค้าปัจจุบัน** → `v_inventory_value` (แยก inventory/consumable ต่อสาขา)
- **เบิกใช้บ่อยที่สุด 3 อันดับ (30 วัน)** → `v_top_consumed_items_30d` (แยกอันดับต่อสาขา)
- **สรุป COGS รายเดือน** → `v_monthly_cogs` (แยกต่อสาขา)

## 5. การเชื่อมกับระบบขาย/POS เดิม (`SC_Sales`) — ตัดสินใจแล้ว: ไม่เชื่อมแบบ live ในเฟสนี้

**เหตุผล:** `SC_Sales` เองยังเป็น Google Sheets ที่มีปัญหาโครงสร้างแบบเดียวกับที่เอกสารนี้เพิ่งอธิบายไปทั้งหมด
(§1) การสร้างสะพานเชื่อม (sync job หรือเรียก Apps Script Web App จาก Supabase Edge Function) ระหว่างระบบ
2 ธรรมชาติต่างกัน (Sheets ↔ Postgres) จะเพิ่มจุดล้มเหลวและทำให้ COGS ที่คำนวณได้อิงข้อมูลที่อาจ sync ไม่ทัน
เวลาจริง ซึ่งขัดกับเป้าหมายเรื่องความแม่นยำของต้นทุนที่ระบบนี้ถูกออกแบบมาเพื่อแก้ปัญหานี้โดยเฉพาะ

**แนวทางที่ใช้แทน (ระยะสั้น):** ฟอร์มเบิกใช้งาน (`stock_out`) ให้พนักงานกรอกเลขบิล/เลขออเดอร์ลงในช่อง
`stock_transactions.reference_note` เอง (`reference_type = 'service_order'`) วิธีนี้ยังคง**สืบย้อนได้ว่าเบิก
วัสดุไปเพื่อออเดอร์ไหน** เพียงแค่ไม่ใช่ foreign key ที่บังคับ integrity จริง — เพียงพอสำหรับการตรวจสอบย้อนหลัง
และคำนวณ COGS รวมรายเดือน/รายวันได้ตามสเปกเดิม (§4) แม้จะดึง COGS ต่อออเดอร์แบบอัตโนมัติทันทีไม่ได้

**แผนระยะถัดไป:** เมื่อทีมพร้อม ให้ย้าย `SC_Sales` เข้ามาเป็นตาราง `service_orders` ในฐานข้อมูลเดียวกัน
(Supabase) แล้วเปลี่ยน `stock_transactions.reference_id` จาก text แบบ loose เป็น foreign key จริงไปยัง
`service_orders.id` ตอนนั้นจะคำนวณ COGS ต่อออเดอร์บริการแบบอัตโนมัติได้ทันที ไม่ต้องรออนุมัติ schema ใหม่
เพราะ `reference_type`/`reference_note` ที่มีอยู่แล้ววันนี้ถูกออกแบบเผื่อ path นี้ไว้ตั้งแต่ต้น

## 6. แผนการย้ายข้อมูล (Migration จากระบบเดิม)
1. สร้างแถวแรกใน `branches` แทนสาขาปัจจุบัน (1 แถว) — ทุกอย่างที่ import ต่อจากนี้ผูกกับ `branch_id` นี้
2. Export ทุกชีตจาก Google Sheets เป็น CSV (`SC_Stock_Status`, `SC_Expenses`, `SC_Stock_Transactions`, `SC_Employees`)
3. เขียนสคริปต์ one-time (Node.js) แปลง `SC_Stock_Status` → `items` (ตั้ง `item_type` ด้วยมือตามหมวดสินค้าจริง เพราะข้อมูลเดิมไม่ได้แยกประเภทนี้ไว้) แล้วสร้างแถว `item_stock` คู่กับ `branch_id` จากข้อ 1
4. แปลงประวัติ `SC_Stock_Transactions` → `stock_transactions` เป็นชุด `stock_in`/`stock_out` (ใส่ `branch_id` เดียวกันทุกแถว) เพื่อให้ moving-average cost เริ่มต้นถูกต้อง
5. ผู้ใช้เดิมใน `SC_Users` → สร้างใหม่ผ่าน Supabase Auth (invite email) แล้ว map เข้า `profiles` พร้อมตั้ง `branch_id` ให้ตรงสาขา (Admin ปล่อย null ได้) —**ห้าม copy รหัสผ่านเดิมเพราะเก็บแบบไม่ปลอดภัย ต้องบังคับ reset ทุกบัญชี**
6. เก็บไฟล์ระบบเดิมไว้ใต้ `legacy/` เพื่ออ้างอิงระหว่าง migration เท่านั้น ไม่ใช้เป็น production ต่อ

## 7. โครงสร้างโปรเจกต์ใหม่ที่แนะนำ
```
/app                      → Next.js App Router pages (dashboard, stock-in, stock-out, adjustments, reports, admin)
/components               → shared UI (shadcn/ui based)
/lib/supabase             → Supabase client (browser + server)
/supabase/migrations      → SQL migration files (เริ่มจาก docs/database-schema.sql)
/supabase/functions       → Edge Function: low-stock-alert (cron)
/legacy                   → ไฟล์ระบบเดิม (SneakerCare_GAS.js ฯลฯ) เก็บไว้อ้างอิง migration เท่านั้น
docs/architecture.md      → เอกสารนี้
docs/database-schema.sql  → schema เต็ม
CLAUDE.md                 → คู่มือสำหรับ Claude Code เมื่อพัฒนาโปรเจกต์นี้ต่อ
```
