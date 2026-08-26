# CLAUDE.md

คำแนะนำสำหรับ Claude Code เมื่อทำงานในโปรเจกต์นี้ — **ระบบจัดการร้าน SneakerCare (DD Service)**
อัปเดตไฟล์นี้ทุกครั้งหลังแก้ไข/deploy อะไรใหม่ — ห้ามปล่อยให้ไฟล์นี้ล้าหลังโค้ดจริง

## ⚠️ อัปเดตสถาปัตยกรรมครั้งใหญ่ (2026-07-29) — อ่านก่อนอ่านหัวข้อถัดไป

ทั้งระบบถูกย้ายจากไฟล์ HTML เดียวไปเป็น **Vite + React + TypeScript** (โฟลเดอร์ `app/`) ครบทั้ง 6 แท็บ
(ภาพรวม/ยอดขาย/คลังสินค้า/ค่าใช้จ่าย+พนักงาน/สถิติ/ตั้งค่า) แล้ว **`app/` คือระบบเดียวที่ใช้งานจริงตอนนี้**
— **ปิด `/legacy/` ถาวรแล้ว (2026-07-29)** หลังจากทดสอบใช้งานจริงแล้วมั่นใจ: nginx ไม่มี location
`/legacy/` อีกต่อไป (ดู `deploy/nginx-sneakercare.conf`), ไฟล์ `sneakercare_dashboard.html` /
`SneakerCare_GAS.js` / `supabase_setup_v2.sql` ถูกย้ายไปเก็บที่ `legacy/` เป็นแค่ archive อ้างอิงในโค้ด
ไม่ได้ deploy ขึ้นเซิร์ฟเวอร์อีกแล้ว, และ**ตาราง `sc_stock_status`/`sc_stock_transactions` ถูก DROP ออก
จากฐานข้อมูลจริงแล้ว** (migration 0020 — ตรวจสอบแล้วว่าไม่มี view/trigger อ้างอิง และไม่มีโค้ดฝั่งไหนอ่าน/
เขียนตารางนี้อีกต่อไปหลังถอด dual-write helper `syncLegacyStock`/`invSyncLegacyStock` ออกแล้ว) **ห้ามอ้างอิง
ตาราง `sc_stock_status`/`sc_stock_transactions` ในโค้ดใหม่เด็ดขาด — ไม่มีอยู่แล้ว**

**จุดสำคัญของระบบใหม่:**
- Deploy key ที่ผูกกับ `deploy.yml` ถูกจำกัดฝั่งเซิร์ฟเวอร์ให้รันได้แค่ `git pull` เท่านั้น (ไม่มี Node บน
  เซิร์ฟเวอร์) ดังนั้น CI ต้อง build แอปก่อนแล้ว **commit `app/dist` กลับเข้า `main` เอง** (job `build-app`
  ใน `deploy.yml`) — ห้ามลบขั้นตอนนี้ออกหรือคิดว่า `.gitignore` ที่ exclude `app/dist` แปลว่าไม่ต้อง commit
  (CI ใช้ `git add -f` เพื่อ override ignore เฉพาะตอน build เท่านั้น)
- **แก้บั๊กสำคัญระหว่างย้าย**: หน้าภาพรวม/สถิติเดิมอ่าน "ต้นทุนวัสดุคลัง" จาก `sc_stock_transactions` (ตาราง
  เก่า, dual-write จาก `invSyncLegacyStock`) ซึ่ง **ข้ามสินค้าที่ `purchase_unit_qty !== 1` แบบเงียบๆ** ระบบ
  ใหม่อ่านจาก `inv_stock_transactions` (ledger จริง) ตรงๆ แทน — **ห้ามใช้คอลัมน์ `total_cost` (generated
  column = `abs(quantity_delta)*unit_cost_snapshot`) รวมยอดตรงๆ เด็ดขาด** เพราะ `abs()` ทำให้รายการยกเลิก/
  แก้ไข (quantity_delta ติดลบ) กลายเป็นบวกแทนที่จะหักออก ต้องคำนวณ `quantity_delta * unit_cost_snapshot` เอง
- **`inv_stock_transactions.transaction_date` ของแถวที่ถูกสร้างก่อน migration 0015** (ก่อน ~13 ก.ค.) **ไม่
  น่าเชื่อถือ** เพราะตอนเพิ่มคอลัมน์นี้ (`default current_date`) มันถูก backfill เป็นวันที่รัน migration ไม่ใช่
  วันที่ซื้อจริง — เจอปัญหานี้จนต้องลบข้อมูล ledger ทั้งหมดแล้วกรอกยอด เม.ย.-ก.ค. 2026 ใหม่ (migration 0019)
  ยืนยันกับ user แล้วว่าตรงกับความจริง — **แถวใหม่ที่สร้างหลังจากนี้ (ผ่านฟอร์ม backdate) เชื่อถือได้ปกติ**
- **Auth site_url/redirect allowlist ถูกอัปเดตแล้ว** (ผ่าน Management API `/config/auth`) จาก
  `http://localhost:3000` (ค่า default ที่ไม่เคยตั้ง) เป็น `https://sneakercare.ddserviceth.com` +
  `uri_allow_list: https://sneakercare.ddserviceth.com/**` — จำเป็นสำหรับฟีเจอร์ "ลืมรหัสผ่าน" (ใช้
  `resetPasswordForEmail` + route `/reset-password`) ถ้าไม่ตั้งค่านี้ลิงก์อีเมลจะ redirect ไป localhost
- **`sc_users.role`**: ค่าที่ใช้จริงคือ `'admin' | 'co-admin' | 'manager'` — `'staff'` เป็นค่าเก่าที่เลิกใช้
  แล้ว (ตอนนี้ไม่มีแถวไหนเป็น staff) สร้างผู้ใช้ใหม่ให้ใช้ `'manager'` เสมอ
- **Token `sbp_...`** ที่ใช้รัน migration ตรงๆ ผ่าน Management API ตลอดการย้ายระบบครั้งนี้ **ควร revoke แล้ว**
  หลังงานย้ายระบบเสร็จ (เช็คใน Supabase Dashboard > Account > Access Tokens ว่ายังอยู่ไหมก่อนใช้ pattern
  เดิมซ้ำ)
- มีเทสแล้ว (`app/src/**/*.test.ts`, รันด้วย `npm test` ใน `app/`) ครอบคลุมสูตรคำนวณสำคัญ (ประกันสังคม/ภาษี
  เงินเดือน, กำไรสุทธิแบบเงินสด, แปลงวันที่ตอน import Excel) — เพิ่มเทสทุกครั้งที่แก้สูตรการเงิน

## ภาพรวมระบบเดิม (ปิดใช้งานแล้ว — เก็บไว้แค่อ้างอิงประวัติศาสตร์ที่ `legacy/`)

**⚠️ ระบบนี้ปิดใช้งานถาวรแล้วตั้งแต่ 2026-07-29 — ไม่ได้ deploy อยู่บนเซิร์ฟเวอร์ ไม่มี route ใดเข้าถึงได้
อีกต่อไป และตารางฐานข้อมูลที่มันเคยใช้ก็ถูกลบไปแล้ว** เนื้อหาด้านล่างนี้เก็บไว้เผื่อต้องขุดประวัติ/เหตุผลการ
ออกแบบเก่าเท่านั้น ห้ามใช้เป็นข้อมูลอ้างอิงสถานะปัจจุบันของระบบเด็ดขาด (ดูหัวข้อด้านบนแทน):

- **Frontend**: ไฟล์ HTML เดียว `legacy/sneakercare_dashboard.html` (~7,000+ บรรทัด) vanilla JavaScript
  ไม่มี build step, ไม่มี framework, เรียก Supabase ตรงจาก browser ด้วย anon/publishable key — **ไม่มี
  backend server เลย** (ยกเว้น Supabase Edge Functions ที่ deploy แยกสำหรับงานเฉพาะทาง)
- **Backend/DB**: Supabase project เดียวชื่อ **`SneakerCareDB`** (ref `mdlxogfkpwejnqpzhmoy`) — เคยมี
  project ทดลองอีกอันชื่อ `shoe-care-inventory` แต่**ลบทิ้งแล้ว** (2026-07-11) ไม่ต้องกังวลเรื่องนี้อีก
- **Deploy**: auto-deploy ผ่าน GitHub Actions (`.github/workflows/deploy.yml`) — push ขึ้น `main` แล้ว
  SSH เข้าเซิร์ฟเวอร์ (`/var/www/sneakercare/`) รัน `git pull` ให้อัตโนมัติภายในไม่กี่วินาที **ไม่ต้อง SSH
  เข้าไป pull เองแล้ว**
- **Repo**: `github.com/ddservice/sneakercare` — push ตรงเข้า `main` ได้เลย (ไม่ใช้ branch/PR) ตามที่ผู้ใช้
  ยืนยันไว้แล้ว

## กฎเหล็ก — ต้องทำทุกครั้งก่อน deploy

1. **Syntax check ก่อน push ทุกครั้ง**: ไฟล์นี้ใหญ่มาก แก้พลาดจุดเดียวพังทั้งเว็บได้ ใช้คำสั่งนี้เช็คก่อน commit เสมอ:
   ```bash
   node -e "
   const fs = require('fs');
   const html = fs.readFileSync('sneakercare_dashboard.html', 'utf8');
   const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
   scripts.forEach((s, i) => { try { new Function(s); console.log('block', i, 'OK'); } catch (e) { console.log('SYNTAX ERROR:', e.message); } });
   "
   ```
2. **เช็ค dangling reference ทุกครั้งที่ลบฟังก์ชัน/ตัวแปร/element ใดๆ** — เคยพังมาแล้วหลายรอบเพราะลบ
   ฟังก์ชันแต่ลืมลบจุดที่เรียกใช้ (เช่น `renderStockPurchaseHistory`, `outSelect`) ทำให้ `ReferenceError`
   ขึ้นตั้งแต่ตอน page load และพังทั้งแอปตั้งแต่จุดนั้นเป็นต้นไป (initApp มักไม่มี try/catch ครอบทุกบรรทัด)
   ใช้ `grep -n` หาทุกจุดที่อ้างชื่อนั้นก่อนลบเสมอ
3. **Push แล้วต้องยืนยันว่า deploy สำเร็จจริง** ผ่าน GitHub API (ไม่ต้องรอ user เช็คเอง):
   ```bash
   curl -s "https://api.github.com/repos/ddservice/sneakercare/actions/runs?per_page=1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d).workflow_runs[0];console.log(r.head_sha.slice(0,7),r.status,r.conclusion)})"
   ```
4. **ไฟล์นี้อยู่บนไดรฟ์ C: ไม่ใช่ Z:** (`C:/Users/Home/dev/sneakercare`) — ไดรฟ์ Z: (network drive) มีปัญหา
   git "dubious ownership" ทำงานไม่ได้ปกติบนเครื่องนี้ ห้ามย้าย repo ไปทำงานที่ Z: อีก

## RBAC — 3 ระดับสิทธิ์ (มีจุดที่ต้องระวัง!)

**⚠️ ระวังชื่อ role ไม่ตรงกัน**: ฟอร์มสร้าง/แก้ไขผู้ใช้ (`nu_role`, `eu_role`) ใช้ค่า `'admin'` /
`'co-admin'` (มีขีด) / `'manager'` — **ไม่มี `'staff'` เป็นตัวเลือกเลย** แต่ข้อมูลเก่าของ user "milo" ใช้ค่า
`'staff'` (เซ็ตไว้ตอนสร้างระบบ ก่อนรู้ว่า UI จริงใช้ 'manager') **โค้ด/RLS ทุกจุดที่เช็ค role ระดับล่างสุด
ต้องรับทั้ง `'staff'` และ `'manager'` เป็นค่าเดียวกันเสมอ** อย่าลบการรองรับ `'staff'` ออกแม้จะดูเหมือนไม่ได้ใช้
เพราะ milo ยังใช้ค่านี้อยู่จริง

- **Admin**: เห็น/ทำได้ทุกอย่างเสมอ ไม่ต้องตั้งค่าอะไร (hardcode ไว้ใน `uiVisible()` — คืน `true` เสมอถ้า
  `_auth.role === 'admin'`)
- **Co-Admin (เปลี่ยนแล้ว 2026-07-13)**: **สิทธิ์เท่า Admin ทุกอย่าง ยกเว้น 2 จุดเท่านั้น** ที่ตั้งใจสงวนไว้
  เฉพาะ Admin:
  1. จัดการบัญชีผู้ใช้งานระบบ (`card_user_mgmt`, RLS `sc_users_admin_all`) — สร้าง/แก้ไข/ลบ user, เปลี่ยน
     role, Edge Function `create-user`
  2. หน้า "สิทธิ์การมองเห็นเมนู" (`card_ui_permissions`, RLS `ui_permissions_write`) — เพราะถ้าให้ Co-Admin
     แก้ตารางนี้เองได้ จะเปิดสิทธิ์ตัวเองเพิ่มแบบไม่มีการตรวจสอบ (circular — ห้ามแก้เป็นอันขาด)

  ทุกอย่างอื่น (รวมถึงทำความสะอาดข้อมูล, ตั้งค่า Telegram, จัดการสาขา, **อนุมัติปรับปรุงสต๊อกของตัวเอง**)
  Co-Admin ทำได้เท่า Admin แล้ว (migration `0012_coadmin_equals_admin.sql`) — เดิมเคย hardcode
  admin-only ไว้หลายจุด (RLS + `inv_fn_approve_adjustment` + `invIsAdmin()` ใน JS) ตอนนี้เปลี่ยนเป็น
  `invCanManageStock()` (= admin หรือ co-admin) เกือบทั้งหมด **ยกเว้น 2 จุดข้างต้นเท่านั้นที่ยังเป็น
  `invIsAdmin()`/`_auth.role === 'admin'` ตรงๆ** — ถ้าจะเพิ่มฟีเจอร์ admin-only ใหม่ในอนาคต ต้องถามก่อนว่า
  เข้าข่ายข้อยกเว้น 2 ข้อนี้จริงไหม ไม่ใช่ default ไปเป็น admin-only ตามความเคยชิน
- **Manager/Staff**: เห็นเฉพาะเบิกใช้งานสต๊อก + กรอกข้อมูลประจำวัน กรอกย้อนหลังไม่ได้ (`s_date` ถูกล็อกไว้)

### ระบบสิทธิ์แบบ checkbox (ใหม่ 2026-07-11)

ตาราง `ui_permissions(role, feature_key, visible)` — Admin ปรับได้เองผ่านการ์ด **"สิทธิ์การมองเห็นเมนู"**
ในหน้าตั้งค่า (ไม่ต้องแก้โค้ดอีกต่อไปเวลาต้องการเปิด/ปิดเมนูให้ role ไหน) **Co-Admin ตอนนี้ = `true` ทุก
feature_key ยกเว้น `card_user_mgmt`**

- โหลดผ่าน `loadUiPermissions()` (ตอน login, เก็บใน global `UI_PERMISSIONS`), เช็คด้วย `uiVisible(featureKey)`
- **คุมแค่ "มองเห็นเมนู" เท่านั้น ไม่ใช่สิทธิ์เขียนข้อมูลจริง** — สิทธิ์เขียน/ลบข้อมูลจริงยังคุมด้วย RLS
  แยกต่างหาก ถ้าจะเปิดเมนูใหม่ให้ role ไหนเห็น **ต้องเช็ค RLS ของตารางที่เกี่ยวข้องด้วยเสมอ** ว่า role นั้น
  เขียนข้อมูลได้จริงไหม ไม่งั้นจะเห็นปุ่มแต่กดแล้ว error (เคยเกิดแล้วตอนเปิด `inv_card_items` ให้ Co-Admin —
  ต้องแก้ RLS `inv_p_items_write_admin_co_admin` คู่กันไปด้วย)
- `card_ui_permissions` **ไม่ได้อยู่ในตาราง `ui_permissions` เลย** — คุมด้วย `_auth.role === 'admin'` ตรงๆ
  ในโค้ด (`showIf('card_ui_permissions', _auth.role === 'admin')`) ตั้งใจให้เป็นแบบนี้ตลอดไป
- การอนุมัติปรับปรุงสต๊อก (`inv_fn_approve_adjustment`) ตอนนี้ Co-Admin อนุมัติเองได้แล้ว (จำกัดแค่สาขาตัวเอง
  ส่วน Admin อนุมัติได้ทุกสาขา) — adjustment ที่ Co-Admin สร้างเองก็ `status='approved'` ทันทีเหมือน Admin
  ไม่ต้องรออนุมัติอีกต่อไป (เปลี่ยนจากเดิมที่บังคับ `pending_approval` เสมอ)
- Feature keys ทั้งหมดที่มีตอนนี้: `card_user_mgmt`, `card_data_purge`, `card_data_import`, `tab_settings`,
  `inv_card_items`, `inv_card_suppliers`, `inv_card_stock_in`, `inv_card_adjustment`, `inv_card_pending`,
  `inv_card_audit`, `inv_card_purchase_history`, `inv_card_settings`, `inv_cost_col_head`

## ระบบคลังสินค้าใหม่ (inv_*) — เพิ่มเข้าไปแบบ additive เมื่อ 2026-07-10/11

ไม่แตะ/ลบตาราง `sc_*` เดิมเลย เพิ่มตารางใหม่ prefix `inv_` ข้างๆ กัน:

- `inv_branches`, `inv_items` (แคตตาล็อกกลาง), `inv_item_stock` (ยอดคงเหลือต่อสาขา), `inv_stock_transactions`
  (ledger แบบ append-only), `inv_audit_logs` (แก้ไข/ลบไม่ได้เด็ดขาด แม้แต่ Admin — revoke สิทธิ์ระดับ DB),
  `inv_integration_secrets` (Telegram token แบบ write-only), `inv_notification_log`,
  `inv_suppliers` (master data ผู้ขาย/ร้านค้า — เพิ่ม 2026-07-12 ดูหัวข้อ Supplier ด้านล่าง)
- **ต้นทุนคำนวณแบบถัวเฉลี่ยเคลื่อนที่ (moving average)** อัตโนมัติผ่าน DB trigger `inv_fn_apply_stock_transaction`
  ห้ามคำนวณต้นทุนซ้ำฝั่ง JS
- **สินค้าคงคลัง vs สิ้นเปลือง**: ถ้าใช้ครั้งเดียวหมดไปจริง (น้ำยา, ทิชชู่) = สิ้นเปลือง (consumable) หน่วยฐาน
  ควรเป็นหน่วยละเอียด (ml/g) ถ้าใช้ซ้ำได้แต่สึกหรอตามเวลา (แปรง) = คงคลัง (inventory) หน่วยฐาน=หน่วยซื้อ=ชิ้น
  ถ้าเป็นทรัพย์สิน/อุปกรณ์สำนักงานที่ไม่เกี่ยวการบริการ (เก้าอี้ โต๊ะ) = **ไม่ควรเข้าระบบคลังสินค้าเลย**
  บันทึกเป็นรายจ่ายครั้งเดียวในแท็บ "ค่าใช้จ่าย" แทน
- **Dual-write ไปตาราง sc_stock_status/sc_stock_transactions เดิม** เฉพาะตอน stock-in ของสินค้าที่
  `purchase_unit_qty === 1` (หน่วยซื้อ=หน่วยฐาน 1:1) เพื่อไม่ให้กระทบยอด "ต้นทุนวัสดุคลัง" ในแท็บภาพรวม และ
  Material analysis ในแท็บสถิติที่ยังอ้างอิงตารางเก่าอยู่ (ดูฟังก์ชัน `invSyncLegacyStock`)
- **กรอกวันที่ย้อนหลังได้ (2026-07-13)**: `inv_stock_transactions.transaction_date` (คอลัมน์ใหม่ migration
  0015 แยกจาก `created_at` ซึ่งเป็น audit timestamp จริงว่ากดบันทึกเมื่อไหร่ ห้ามแก้) — ฟอร์ม "รับของเข้าคลัง"
  และ "เพิ่มสินค้าใหม่" (initial stock) มีช่องเลือกวันที่ ค่าเริ่มต้น=วันนี้ เลือกย้อนหลังได้ (ห้ามเลือก
  อนาคต, เช็คทั้ง client-side และควร cross-check กับ business logic เสมอ) ต้องส่งวันที่นี้ต่อให้
  `invSyncLegacyStock(..., txnDate)` ด้วยเสมอ ไม่งั้น `sc_stock_transactions.date` (ตัวที่ตัดสินว่า
  "ต้นทุนวัสดุคลัง" เข้าเดือนไหน) จะยังใช้วันนี้อยู่ดี ทำให้ backdate ไม่มีผลจริงกับรายงาน — Purchase History
  โชว์ `transaction_date` แทน `created_at` แล้ว
- แจ้งเตือนสต๊อกต่ำผ่าน Telegram Bot `@SneakerCareStockBot` → กลุ่ม "SneakerCare Team" (chat_id
  `-5034072774`) ทุก 30 นาทีผ่าน `pg_cron` เรียก Edge Function `inv-low-stock-alert`
- **Supplier (2026-07-12)**: `inv_suppliers` เป็น master data แยกต่างหาก ไม่ใช่แค่ช่องข้อความอิสระ — เลือกได้
  จาก dropdown ตอน "รับของเข้าคลัง" และตอน "เพิ่มสินค้าใหม่" (initial stock) `inv_stock_transactions.supplier_id`
  เป็น FK แบบ nullable (ของเก่าที่นำเข้าไปก่อนหน้าจะเป็น null) การ์ด "ประวัติการซื้อเข้า" โชว์ supplier ของแต่ละ
  รายการซื้อ ทำให้เทียบราคาข้าม supplier ได้จากตารางเดียว RLS ของ `inv_suppliers` จำกัดแค่ admin/co-admin
  เหมือน `inv_items`
- **แก้ไข/ลบรายการซื้อเข้าที่กรอกผิด (2026-07-13, แก้บั๊กแล้ว)**: ปุ่ม "แก้ไข"/"ลบ" ที่การ์ด
  "ประวัติการซื้อเข้า" **ไม่ได้ UPDATE แถวเดิมเด็ดขาด** (ผิดกฎ #2 append-only ledger) แต่ insert แถวใหม่
  อ้าง `corrects_txn_id` กลับไปที่รายการต้นฉบับแทน — **ข้อควรระวังสำคัญ**: `inv_stock_transactions` มี check
  constraint `inv_chk_delta_sign` บังคับว่า `txn_type='stock_in'` ต้อง `quantity_delta > 0` เท่านั้น (ลองใช้
  stock_in ติดลบเพื่อ "หักล้าง" ตอนแรกแล้ว insert พังทันทีด้วย constraint นี้ — **ห้ามใช้ stock_in สำหรับการ
  ลด/หักล้างจำนวนเด็ดขาด**) ขั้นตอนที่ถูกต้อง:
  - ขั้น "หักล้าง/ลบ" ของเดิม → ต้องใช้ `txn_type='adjustment_decrease'` (`quantity_delta` ติดลบ, ต้องมี
    `reason` ไม่ว่างตาม constraint `inv_chk_reason_required`) — ซึ่งทำให้เข้ากฎ #3 โดยอัตโนมัติ: **ถ้า
    Co-Admin เป็นคนกด ต้อง `status='pending_approval'` เสมอ ยอดคงเหลือจะยังไม่เปลี่ยนจนกว่า Admin จะกด
    อนุมัติที่การ์ด "อนุมัติการปรับปรุงสต๊อก"** (Admin กดเองจะเป็น `approved` ทันที) มี hint ข้อความเตือนไว้
    ใน modal ทั้งสองให้ผู้ใช้เห็นสถานะนี้ล่วงหน้า
  - ขั้น "บันทึกรายการที่แก้ไขแล้ว" (เฉพาะปุ่ม "แก้ไข" ไม่มีในปุ่ม "ลบ") → ใช้ `txn_type='stock_in'` ปกติ
    (quantity_delta บวก) ใช้ทันทีไม่ต้องรออนุมัติ เหมือนการรับของเข้าคลังทั่วไป
  - ผลข้างเคียง: แถว `adjustment_decrease` ที่เกิดจากการแก้ไข/ลบ **จะไม่โชว์ในการ์ด "ประวัติการซื้อเข้า"
    อีกต่อไป** (เพราะการ์ดนั้น filter เฉพาะ `txn_type='stock_in'`) แต่จะไปโชว์ที่การ์ด
    "ประวัติการเคลื่อนไหวสต๊อก" (audit log ทั่วไป) และ "อนุมัติการปรับปรุงสต๊อก" (ถ้ายัง pending) แทน — ถือว่า
    ถูกต้องแล้ว เพราะมันไม่ใช่ "การซื้อเข้า" อีกต่อไปในทางความหมาย
  - **บทเรียน**: ก่อนจะ insert `inv_stock_transactions` ด้วย `quantity_delta` ติดลบ **ต้องเช็ค
    `inv_chk_delta_sign` ใน `0001_inventory_v2.sql` ก่อนทุกครั้ง** ว่า txn_type ที่ใช้อนุญาตค่าติดลบจริง
  - **บั๊กที่ 2 (แก้แล้ว 2026-07-13)**: ตอนแรกลืมสิ้นเชิงว่ามี "ต้นทุนวัสดุคลัง" ในแท็บภาพรวมที่อ่านจากตาราง
    เดิม `sc_stock_transactions` (ไม่ใช่ `inv_*`) ผ่าน `invSyncLegacyStock()` — ฟังก์ชัน "แก้ไข"/"ลบ" ทั้งคู่
    ไม่เคยเรียก `invSyncLegacyStock()` เลย ทำให้ยอดรายจ่ายเดือนนั้นค้างเป็นค่าเดิมทั้งที่จำนวนสต๊อกถูกแก้ไปแล้ว
    ใน `inv_*` แล้ว แก้โดย (1) แก้ `invSyncLegacyStock()` ให้ใช้ `qtyDelta` แบบมีเครื่องหมายตรงๆ (เดิมใช้
    `Math.abs()` ซึ่งจะทำให้รายการยกเลิกไปบวกเพิ่มยอดแทนที่จะหักออก) (2) เรียก `invSyncLegacyStock()` เพิ่ม
    ในทั้ง `invSaveVoidPurchase`/`invSaveCorrectPurchase` หลัง insert สำเร็จและ status เป็น `approved` แล้ว
    **ถ้าจะเพิ่มฟีเจอร์ใหม่ที่แก้ไข/ยกเลิก stock_in transaction ในอนาคต ต้องเรียก `invSyncLegacyStock()`
    ทุกครั้งเสมอ ไม่ใช่แค่ตอน insert ใหม่ปกติ** เพราะมี 2 ระบบขนานกันอยู่ (inv_* กับ sc_stock_transactions
    เดิม) ที่ยังไม่ได้รวมเป็นระบบเดียว **มี 2 รายการที่ทำก่อนแก้บั๊กนี้ต้องแก้มือ (migration 0013, 0014):
    น้ำยาซักผ้า กับ ค่าน้ำยาซักรองเท้าหนังกลับ** — ถ้าเจอ user รายงานว่ายอด "ต้นทุนวัสดุคลัง" ในแท็บภาพรวมดู
    ไม่ตรงกับที่แก้ไข/ลบไปในหน้าคลังสินค้าอีก **ให้ไล่ trace ledger เต็มของ item นั้นใน
    `inv_stock_transactions` ก่อนเสมอ (ดู `reference_note`/`performed_by` แยกแยะรายการ "นำเข้าข้อมูลเดิม"
    ออกจากรายการซื้อจริงให้ดี — เคยสับสนระหว่าง 2 อย่างนี้มาแล้วรอบหนึ่ง ทำให้คำนวณผิดว่ายอดตรงอยู่แล้วทั้งที่
    จริงๆ ไม่ตรง) แล้วเทียบกับยอดจริงใน `sc_stock_transactions`/`sc_stock_status` ก่อนสรุปว่าตรงหรือไม่ตรง**
  - **บั๊กที่ 3 (แก้แล้ว 2026-07-13)**: การ์ด "ประวัติการซื้อเข้า" เดิมอ่านสถานะ (badge "รออนุมัติ"/"ถูกลบ
    แล้ว") จาก `inv_audit_logs.after_data` ซึ่งเป็นแค่ **snapshot ตอน INSERT เท่านั้น**
    (`inv_trg_audit_stock_transactions` เป็น `after insert` ล้วน ไม่มี `after update`) — พอมีรายการที่สร้าง
    เป็น `pending_approval` แล้วมาอนุมัติทีหลังผ่าน `inv_fn_approve_adjustment` (เป็นการ UPDATE) audit log
    จะไม่เห็นการเปลี่ยนสถานะนั้นเลย badge เลยค้างโชว์ "รออนุมัติ" ตลอดไปทั้งที่อนุมัติจริงแล้ว (ยืนยันแล้วจาก
    ข้อมูลจริง: audit snapshot บอก `pending_approval` แต่ค่าจริงใน `inv_stock_transactions` เป็น `approved`)
    แก้โดยเปลี่ยน `invRenderPurchaseHistory()` ให้อ่านจาก `inv_stock_transactions` ตรงๆ แทน (ปลอดภัยแล้ว
    เพราะ migration 0008 จำกัด RLS SELECT ของตารางนี้ไว้เท่ากับ audit_logs อยู่แล้ว เหตุผลเดิมที่เลี่ยงไปอ่าน
    ผ่าน audit log จึงไม่จำเป็นอีกต่อไป) **บทเรียน: ห้ามใช้ `inv_audit_logs` เพื่อเช็ค "สถานะปัจจุบัน" ของ
    อะไรก็ตามที่อาจถูก UPDATE ทีหลัง (เช่น `status` ของ adjustment) ใช้ได้แค่เป็น log ประวัติ insert/
    update/delete เท่านั้น ไม่ใช่แหล่งข้อมูล live state**
  - **บั๊กที่ 4 (แก้แล้ว 2026-07-13)**: ปุ่ม "บันทึก" ทุกปุ่มในหน้าคลังสินค้า (รับของเข้า, เบิกใช้งาน,
    ปรับปรุงสต๊อก, เพิ่ม/แก้ไขสินค้า, Supplier, แก้ไข/ลบรายการซื้อ) **ไม่เคยกันกดซ้ำซ้อนเลย** — กดสองครั้ง
    ติดกัน (หรือกดซ้ำระหว่างรอผลลัพธ์) สร้างรายการซื้อซ้ำ 2 เท่าจริง (เจอเคสจริง: ผู้ใช้กด "รับของเข้า" ซ้ำ
    ทำให้ยอด "ต้นทุนวัสดุคลัง" ในภาพรวมบวกเพิ่มเป็น 2 เท่า) แก้โดยเพิ่ม `id` ให้ปุ่มบันทึกทุกปุ่ม
    (`inv_in_save_btn`, `inv_out_save_btn`, `inv_adj_save_btn`, `inv_item_save_btn`, `supplier_save_btn`,
    `correct_txn_save_btn`, `void_txn_save_btn`) แล้ว disable ปุ่มตั้งแต่ต้นฟังก์ชัน (เช็ค `if
    (saveBtn.disabled) return` กันเผื่อ event ซ้อนกันด้วย) ครอบ logic ทั้งหมดด้วย `try { ... } finally {
    saveBtn.disabled = false }` **ถ้าเพิ่มปุ่มบันทึกใหม่ในหน้าคลังสินค้า (หรือที่ไหนก็ตามที่เขียน
    inv_stock_transactions/ตารางการเงิน) ต้องใส่ pattern นี้เสมอ ไม่งั้นจะเจอบั๊กเดียวกันซ้ำ**
  - **UX เพิ่มเติม**: การ์ด "ประวัติการซื้อเข้า" ตอนนี้เช็คว่าแต่ละแถวเคยถูกกด "แก้ไข"/"ลบ" ไปแล้วหรือยัง
    (มี `adjustment_decrease` อ้าง `corrects_txn_id` กลับมาไหม) ถ้ามีจะโชว์ badge สถานะ (รออนุมัติ / ถูกลบแล้ว
    ขีดฆ่า / ถูกปฏิเสธ) และปิดปุ่มแก้ไข/ลบซ้ำถ้ายัง pending หรือ approved ไปแล้ว — กัน Co-Admin กดซ้ำซ้อน
    ระหว่างรอ Admin อนุมัติ
  - **ข้อควรระวังเรื่องเดือนบัญชี (2026-07-13)**: การ "แก้ไข/ลบ" รายการซื้อเข้าเก่าจะลงบัญชีที่**เดือนที่กด
    แก้ไข** เสมอ ไม่ใช่เดือนที่ซื้อจริง (เช่น ซื้อของเมษายน มาลบใน ก.ค. → เดือน ก.ค. จะโชว์รายจ่ายติดลบ)
    เป็นพฤติกรรมที่ถูกต้องตามหลักบัญชีทั่วไป แต่ทำให้ตัวเลขเดือนปัจจุบันดูแปลกได้ถ้าเผลอไปแก้ไขของเก่ามาก —
    ถ้า user รายงานว่ายอด "ต้นทุนวัสดุคลัง" ติดลบ/ผิดปกติ ให้เช็คก่อนว่ามีการแก้ไข/ลบรายการเก่าข้ามเดือนไหม
    (เจอเคสจริง: ลบรายการซื้อเดือนเมษายนของ "น้ำยาขจัดคราบสีแดง" ทำให้ยอด ก.ค. ติดลบ 1,660 บาท — สุดท้าย
    user ยืนยันว่าเป็นข้อมูลทดสอบที่ไม่ถูกต้องอยู่แล้ว เลยลบทิ้งออกจาก `sc_stock_transactions` ตรงๆ ทั้งยอด
    เมษายนเดิมและรายการแก้ไขเดือน ก.ค. ที่ค้างอยู่ — **ลบได้เฉพาะตารางเก่า `sc_stock_transactions` เท่านั้น
    ห้ามลบแถวใน `inv_stock_transactions` เด็ดขาดแม้ user จะขอ เพราะเป็น append-only ledger ตามกฎ #2**)
- **ลบสินค้าออกจากแคตตาล็อก (2026-07-13)**: ปุ่ม "ลบ" ที่หน้าจัดการสินค้า เช็คก่อนเสมอว่า
  `inv_stock_transactions` ของ item นั้นมีกี่แถว **ถ้า > 0 บล็อกการลบทันที** (บอกให้ใช้ "ปิดใช้งาน" แทน)
  เพราะการลบ inv_items ที่มี stock_transactions อ้างอิงอยู่จะทำให้ audit trail ขาดหาย/หรือชน FK constraint —
  ลบได้จริงเฉพาะ item ที่สร้างแล้วไม่เคยมีการเคลื่อนไหวสต๊อกเลย และต้องพิมพ์ชื่อ item ให้ตรงเป๊ะก่อนปุ่ม
  "ลบถาวร" จะกดได้ (เรียนรู้จาก incident milo ที่ confirm() ธรรมดาไม่พอ)

## แท็บภาพรวม (สรุปยอดขาย/รายจ่าย/กำไร) — เปลี่ยนหลักการคำนวณกำไรสุทธิเมื่อ 2026-07-13

- **"กำไรสุทธิ" (`sum_profit`) ตอนนี้คำนวณแบบเงินสด (cash basis) ไม่ใช่ตั้งบัญชี (accrual) อีกต่อไป** —
  นับเฉพาะเงินที่ได้รับจริงในช่วงวันที่ที่เลือก ไม่ใช่ยอดขายเต็มจำนวนที่บันทึกไว้ (`updateSummaryData()`
  ใน `sneakercare_dashboard.html`)
- **"รายรับรวมสุทธิ" (`sum_income`)** ยังเป็นยอดขายเต็มจำนวนแบบเดิม (accrual) — เก็บไว้โชว์ภาพรวมยอดขาย
  เฉยๆ **ไม่ได้ใช้คำนวณกำไรสุทธิแล้ว** ห้ามสับสนว่าทำไมตัวเลข 2 อันนี้ไม่ตรงกัน (ตั้งใจให้ต่างกัน)
- **`sc_payments.received_date` (คอลัมน์ใหม่ migration 0018)** คือหัวใจของเรื่องนี้ — เดิมมีช่อง
  "วันที่รับเงิน" ในหน้า modal "รับชำระเงิน" (`openCollectModal`) อยู่แล้ว แต่**ไม่เคยถูกส่งเข้า Supabase
  เลย** เก็บไว้แค่ localStorage (`paymentsSaved`) ทำให้ข้อมูลหายถ้าเปลี่ยนเครื่อง/ล้างเบราว์เซอร์ แก้แล้วให้
  `savePayment()` ส่ง `received_date` เข้า Supabase จริง
- **`loadMonthlyData()` ดึง `sc_payments` เพิ่มอีกตาราง** กรองด้วย `received_date` (ไม่ใช่ `sale_date`) อยู่
  ในช่วง `[df, dt]` ที่เลือกดู เก็บไว้ใน global `paymentsInRangeSaved` — ทำให้เงินที่ขายเดือนก่อนแต่มารับเดือน
  นี้ จะถูกนับเข้ากำไรสุทธิของเดือนที่รับเงินจริง ไม่ใช่เดือนที่ขาย (ตรงตามที่ user ขอ "ไม่ข้ามเดือน")
- **สูตรกำไรสุทธิใหม่**: `netProfit = totalCashCollected + rentalIncomeAmt - grandExpenses` โดย
  `totalCashCollected` = (เงินที่ได้ตอนบันทึกยอดขายเอง ของยอดขายที่อยู่ในช่วงนี้) + (ผลรวม
  `paymentsInRangeSaved`) — **ห้ามเปลี่ยนกลับไปใช้ `totalRevenue`/`serviceRevenue` ในการคำนวณกำไรสุทธิเด็ดขาด**
- **`totalOutstanding` (ยอดค้างชำระ) ยังใช้ `_getReceivedForDate()` แบบเดิม** (อ้างอิง localStorage,
  ไม่จำกัดช่วงวันที่) เพราะต้องการ "ยอดค้างจริง ณ ตอนนี้" ไม่ใช่แค่ในช่วงที่กำลังดู — **จงใจไม่แก้ให้ตรงกับ
  `paymentsInRangeSaved`** เพราะจะทำให้ยอดค้างของรายการเก่าที่จ่ายไปแล้วนอกช่วงที่ดูอยู่ ดูเหมือนยังค้างอยู่
  ทั้งที่จ่ายจริงแล้ว (ยังเป็นข้อจำกัดเดิมที่ AR ไม่ได้ sync ข้าม device แบบสมบูรณ์ — ยังไม่ได้แก้จุดนี้)

## Migrations

อยู่ที่ `supabase/migrations/` เรียงลำดับ 0001-0018+ — **ห้ามแก้ไฟล์ migration เก่าที่ apply ไปแล้ว** สร้าง
ไฟล์ใหม่เสมอ วิธี apply:
```bash
export SUPABASE_ACCESS_TOKEN="<personal access token>"
npx --yes supabase link --project-ref mdlxogfkpwejnqpzhmoy
npx --yes supabase migration list --linked   # ← ทำก่อน push ทุกครั้ง ห้ามข้าม (ดูเหตุการณ์ 2026-08-26)
npx --yes supabase db push --linked --yes
```
(access token เป็นของ session-specific ไม่ persist ระหว่าง session ต้องขอผู้ใช้สร้างใหม่ทุกครั้งที่เริ่ม
session ใหม่ผ่าน supabase.com/dashboard/account/tokens — เตือนให้ revoke ทิ้งหลังใช้เสร็จด้วยทุกครั้ง)

**⚠️ เช็ค `migration list` ก่อน push ทุกครั้งเด็ดขาด** — ถ้าคอลัมน์ `remote` ว่างเปล่าสำหรับ migration ที่รู้อยู่
แล้วว่า apply จริงไปแล้ว (เช่น ผ่าน Management API ตรงๆ ไม่ผ่าน CLI) **ห้ามสั่ง `db push` ต่อทันที** — ให้
`supabase migration repair <version> --status applied --linked` ให้ตรงกับความจริงก่อน ไม่งั้น `db push` จะ
รัน migration นั้นซ้ำ ซึ่งถ้าไฟล์นั้นมี `delete`/`drop`/reset logic (เช่น 0019) จะเกิดเหตุการณ์แบบ 2026-08-26
ทันที (ดูด้านล่าง)

## เหตุการณ์สำคัญที่เคยเกิด (กันไม่ให้พลาดซ้ำ)

- **2026-07-11**: ข้อมูลโปรไฟล์ของ milo ใน `sc_users` หายไปทั้งแถว (บัญชี Auth ยังอยู่ แต่ profile หาย) —
  สาเหตุน่าจะเป็นการกดปุ่มลบ (ถังขยะ) ผิดพลาดตอนทดสอบ UI **ตาราง sc_users ไม่มี audit log เลย** กู้คืนได้
  จากการจำค่าที่เคยเห็นเท่านั้น ถ้าจะลบ user ในอนาคตควรเพิ่ม confirm ที่รัดกุมกว่าเดิม (พิมพ์ชื่อ user ยืนยัน)
- **2026-07-10**: พบ `sc_stock_transactions` มี RLS เปิดกว้างให้ authenticated ทุกคนทำได้ทุกอย่าง
  (`auth_all` policy) และ `sc_opex` DELETE เปิดให้ Co-Admin ด้วย (ตอนนี้แก้เป็น Admin-only ทั้งคู่แล้ว
  ดู migration 0004)
- **2026-07-11**: หน้าเว็บมี global CSS `input, select, textarea { appearance: none }` (ตั้งใจไว้สำหรับ
  custom-style text input) ทำให้ `<input type="checkbox">` ที่เพิ่งเพิ่มเข้าไปใน role permissions grid
  **กดได้แต่มองไม่เห็นเลย** (ไม่มี custom replacement ให้) — **ถ้าจะเพิ่ม checkbox/radio ใหม่ที่ไหนในเว็บนี้
  ต้องใส่ `style="appearance:auto; -webkit-appearance:auto"` เจาะจงเสมอ** ไม่งั้นจะเจอปัญหาเดียวกัน
- **2026-07-11**: `printPayslip()` เดิมเรียก `window.print()` อัตโนมัติทันทีที่เปิดหน้าต่างใหม่ (มี fallback
  `setTimeout` ซ้อนด้วย) ไม่มี preview ให้ดูก่อนพิมพ์เลย — แก้เป็นเปิดหน้าต่างเฉยๆ พร้อมปุ่ม "พิมพ์เอกสาร"
  ในตัวเอกสาร (ซ่อนตอนพิมพ์จริงผ่าน `@media print`) **ถ้าจะเพิ่มฟีเจอร์พิมพ์เอกสารอื่นในอนาคต ให้ใช้ pattern
  เดียวกันนี้เสมอ (เปิดหน้าต่าง + ปุ่มพิมพ์เอง ห้าม auto `.print()`)**
- **2026-07-12**: โลโก้ร้านค้า (`biz_logo_url`) โหลดไม่ขึ้นแม้ URL ถูกต้องแล้ว (ทดสอบแล้วว่าไม่ใช่ hotlink
  protection ของเว็บฝากรูป — เคยสงสัยผิดจุด) **สาเหตุจริงคือ nginx ฝั่งเซิร์ฟเวอร์ตั้ง
  `Content-Security-Policy: img-src 'self' data:'` ไว้ที่ `/etc/nginx/sites-available/sneakercare`
  บล็อกรูปจากทุกโดเมนภายนอกโดยไม่มีข้อยกเว้น** ต้องแก้ที่ nginx config โดยตรง (ไม่ได้อยู่ใน repo/HTML เลย
  ต้อง SSH เข้าไปแก้ + `sudo systemctl reload nginx` ถึงจะมีผลจริง — แค่ `nginx -t` ผ่านไม่พอ ต้อง reload ด้วย)
  แก้แล้วโดยเพิ่ม `https://*.supabase.co` เข้าไปใน `img-src` เพื่อรองรับข้อ 2 ด้านล่าง **ถ้าจะเพิ่มโดเมนรูปภาพ/
  สคริปต์ภายนอกใหม่ในอนาคต ต้องแก้ CSP header ที่ nginx บนเซิร์ฟเวอร์ด้วยเสมอ ไม่ใช่แค่แก้โค้ด HTML**
- **2026-07-12**: เพิ่ม Supabase Storage bucket สาธารณะชื่อ **`branding`** (migration `0006`) สำหรับให้ Admin
  อัปโหลดโลโก้ร้านเองผ่าน Supabase Dashboard โดยตรง แทนการพึ่งเว็บฝากรูปภายนอกที่อาจปิดตัว/บล็อก hotlink ใน
  อนาคต — อ่านได้ทุกคน (ต้อง public เพื่อฝัง `<img>` ได้), เขียน/ลบได้เฉพาะ Admin เท่านั้น (ผ่าน RLS บน
  `storage.objects`) URL ที่ได้จะเป็นรูปแบบ
  `https://mdlxogfkpwejnqpzhmoy.supabase.co/storage/v1/object/public/branding/<ไฟล์>`
- **2026-07-12**: สลิปเงินเดือน (`printPayslip`) แก้ 3 จุดตามที่ขอ: (1) ช่อง "ลงลายมือชื่อผู้จ่ายเงิน" เดิมโชว์
  ชื่อบริษัท เปลี่ยนเป็นชื่อผู้ใช้ที่ login อยู่จริง (`_auth.display_name`) แทน — คนที่กดพิมพ์สลิปคือคนเซ็นจ่าย
  ไม่ใช่บริษัท; (2) เพิ่มช่อง "ตราประทับ (ถ้ามี)" เป็นกล่องเส้นประคั่นกลางระหว่างช่องเซ็นชื่อสองฝั่ง
  (`.footer-grid` ปรับจาก 2 คอลัมน์เป็น 3 คอลัมน์); (3) ขยายโลโก้หัวเอกสารจาก 52px เป็น 84px

- **2026-07-12**: เพิ่มความสามารถให้กรอกราคาตอน "เพิ่มสินค้าใหม่" (ไม่ใช่แค่ตอนรับของเข้าคลังแบบเดิม) —
  ฟอร์มเพิ่มสินค้ามีช่อง "จำนวนสต๊อกเริ่มต้น" + "ยอดที่จ่ายจริงทั้งหมด" (optional ซ่อนตอนแก้ไขสินค้าเดิม)
  ถ้ากรอก จะสร้าง `inv_stock_transactions` แถวใหม่ (txn_type `stock_in`) ให้ผ่าน trigger ปกติ **ไม่ได้เขียน
  `avg_unit_cost` ตรงๆ** เพื่อไม่ผิดกฎ #6 (moving average ต้องมาจาก trigger เท่านั้น) — เพิ่มการ์ดใหม่
  "ประวัติการซื้อเข้า" (`inv_card_purchase_history`) แสดงราคาต่อหน่วย/รวมของแต่ละครั้งที่ซื้อเข้า **อ่านข้อมูล
  จาก `inv_audit_logs` ไม่ใช่ `inv_stock_transactions` ตรงๆ** เพราะ `inv_audit_logs` มี RLS จำกัดเฉพาะ
  admin/co-admin อยู่แล้ว (`inv_p_audit_logs_select`) ในขณะที่ `inv_stock_transactions` เอง (policy
  `inv_p_stock_txn_select`) เปิดให้ทุก role ในสาขาเดียวกัน SELECT ตรงๆ ได้ (รวม unit_cost_snapshot/total_cost)
  **แก้แล้ว (migration 0008)**: `inv_p_stock_txn_select` เดิมอนุญาต role ใดก็ได้ในสาขาเดียวกัน SELECT
  ตรงๆ ได้ (เห็น `unit_cost_snapshot`/`total_cost`) ตอนนี้จำกัดเหลือ admin ทุกสาขา + co-admin เฉพาะสาขาตัวเอง
  เท่านั้น — ตรวจสอบแล้วว่าไม่กระทบฟีเจอร์เดิม (การ์ด "รออนุมัติ" เป็น admin-only อยู่แล้ว, insert ของ
  manager/staff ไม่ chain `.select()` จึงไม่ต้องใช้สิทธิ์ read)

- **2026-07-12**: แก้ปัญหาที่ user รายงานมาหลายครั้งแล้วแต่หาสาเหตุไม่เจอในตอนนั้น ("ใส่ข้อมูลสินค้าเองไม่ได้"
  / "สินค้าคงคลังที่เคยบันทึกไว้ไม่ขึ้นโชว์") — **สาเหตุจริงคือตอนสร้างระบบคลังสินค้าใหม่ (2026-07-10) มีแค่
  สินค้า 1 ตัว (กระดาษปริ้นบิล) ที่ถูกสร้างเข้า `inv_items` จริง ส่วนอีก 4 ตัวที่ user เคยบันทึกไว้ยังค้างอยู่
  ในตารางเก่า `sc_stock_status` เท่านั้น ไม่เคยถูกย้ายเข้าระบบใหม่เลย** (ตรวจสอบผ่าน `inv_audit_logs` ยืนยัน
  แล้วว่า inv_items มีแค่ 1 แถวจริง ไม่ใช่ข้อมูลถูกลบทีหลัง) กู้คืนแล้วผ่าน migration 0009 โดย insert เข้า
  `inv_stock_transactions` แบบ stock_in ตามปกติ (ไม่ใช่เขียน `avg_unit_cost` ตรงๆ) **ถ้าเจอ report แนวนี้อีก
  ในอนาคต ให้เช็ค `sc_stock_status` เทียบกับ `inv_items` ก่อนเป็นอันดับแรก** ว่ามีของค้างอยู่ฝั่งตารางเก่าที่
  ยังไม่ย้ายมาไหม — **แต่ระวัง: `sc_stock_status` เก็บแค่ item ที่มี "ยอดคงเหลือปัจจุบัน" เท่านั้น ไม่ครบ
  ทุกตัว** เจอเพิ่มอีก 5 รายการ (migration 0010) ที่มีประวัติซื้อใน `sc_stock_transactions` (ledger เก่า)
  แต่ไม่เคยมีแถวใน `sc_stock_status` เลย (ซื้อครั้งเดียวไม่เคยมีรายการเบิกใช้งานนับแต่นั้น) **วิธีเช็คที่ครบ
  กว่าคือ `select distinct item_name from sc_stock_transactions` เทียบกับ `inv_items.name` ทั้งคู่ ไม่ใช่แค่
  เทียบกับ `sc_stock_status`**

- **2026-08-26**: แก้ Supabase Security Advisor ตามที่ user ส่งภาพ error มา — พบว่า `inv_v_low_stock`,
  `inv_v_inventory_value`, `inv_v_top_consumed_items_30d`, `inv_v_monthly_cogs` ไม่เคยตั้ง `security_invoker`
  เลยตั้งแต่สร้าง (default ของ Postgres = SECURITY DEFINER) ทำให้ bypass RLS ของ `inv_stock_transactions`/
  `inv_item_stock` ไปเลย — manager/staff ที่ถูก RLS กันไม่ให้เห็นต้นทุนอยู่แล้ว (migration 0008) ยังเรียก REST
  API ของ view พวกนี้ตรงๆ แล้วเห็นต้นทุน/COGS/มูลค่าคลังได้อยู่ดี (หน้าเว็บไม่เคยเรียก view นี้เองก็จริง แต่
  API เปิดให้เรียกได้เสมอถ้า role เดายิงตรง) และ `inv_notification_log` เป็นตารางเดียวใน repo ที่ไม่เคย
  `enable row level security` เลย — แก้ด้วย `0026_fix_security_advisor_findings.sql` (เพิ่ม
  `security_invoker = true` ให้ 4 view โดยไม่แก้ query เลย + เปิด RLS แบบ deny-all ให้ notification_log)

  **⚠️ ระหว่างแก้เกิดอุบัติเหตุข้อมูลหายจริง ต้องกู้คืน — อ่านให้ครบก่อนรัน `db push` ครั้งต่อไป**: สั่ง
  `db push` โดยไม่เช็ค `migration list` ก่อน ทำให้เจอว่า remote `schema_migrations` ไม่เคยบันทึกว่า 0019-0025
  ถูก apply (ของจริง apply ผ่าน Management API ตรงๆ ตอนย้ายระบบ ไม่ผ่าน CLI) CLI เลยรัน 0019 ซ้ำ ซึ่งไฟล์นั้น
  มี `delete from inv_stock_transactions; delete from inv_item_stock;` แล้ว insert ข้อมูลย้อนหลังชุดเก่ากลับ
  เข้าไปแทน (ไฟล์นี้ถูกออกแบบให้รันครั้งเดียวตอน 29 ก.ค. เท่านั้น) **ผลคือลบประวัติการเคลื่อนไหวสต๊อกจริงตั้งแต่
  29 ก.ค. ถึง 26 ส.ค. (104 รายการ) ทิ้งไปทั้งหมด** เหลือแค่ 18 แถวเก่าที่ 0019 insert ซ้ำ (id ใหม่) และสร้าง
  รายการสินค้า "ไส้กรองน้ำ" ซ้ำเพิ่มอีก 1 แถว (0019 มีขั้นตอน insert สินค้าใหม่แบบไม่กันซ้ำด้วย) push หยุดเองที่
  0025 (column ชนกับของเดิม) ก่อนจะไปถึง 0026 แต่ 0019-0024 รันซ้ำสำเร็จไปแล้วก่อนหน้านั้น

  **กู้คืนได้ทัน เพราะ `inv_audit_logs` (AFTER INSERT trigger, แก้/ลบไม่ได้แม้แต่ Admin) เก็บ snapshot เต็มทุก
  คอลัมน์ของทุกแถวที่เคย insert ไว้ครบ** — reconstruct 104 รายการจริงจาก `after_data` (กรอง `performed_at`
  ระหว่างตอนที่ 0019 รันครั้งแรกจริง 29 ก.ค. ถึงก่อนรันซ้ำวันนี้) insert กลับตามลำดับเวลาเดิมเป๊ะให้ trigger
  คำนวณต้นทุนถัวเฉลี่ยใหม่ถูกต้อง ดู `0027_recover_stock_ledger_after_accidental_reset_rerun.sql` (มี
  query ตรวจสอบก่อนกู้ทั้งหมดอยู่ในคอมเมนต์ท้ายไฟล์ — เช็คว่าไม่มีแถวไหน `status='pending_approval'` ที่
  audit snapshot จะไม่ตรงกับสถานะจริงปัจจุบัน, ไม่มี `transaction_date` ว่าง, `item_id` ทุกแถวยังอยู่จริง,
  `corrects_txn_id` ไม่มี dangling reference ก่อนรันจริง) กู้คืนสำเร็จ 100% (104/104 แถว, 46 item_stock
  ตรงกับจำนวนสินค้าที่มีประวัติจริง, ไม่มี current_qty ติดลบ) แล้วใช้ `supabase migration repair 0025 0026
  0027 --status applied --linked` sync ตาราง tracking ให้ตรงกับความจริงกันไม่ให้เกิดซ้ำ

  **บทเรียนสำคัญที่สุด**: project นี้เคย apply migration ผ่าน Management API ตรงๆ นอกเหนือจาก CLI มาก่อน
  (ตามที่บันทึกไว้ในหัวข้อ Migrations ด้านบนอยู่แล้ว) ทำให้ remote tracking table กับ migration file ในโฟลเดอร์
  ไม่ตรงกันได้แบบไม่มีใครรู้ตัว **ต้อง `supabase migration list --linked` เช็คทุกครั้งก่อน `db push` โดยไม่มี
  ข้อยกเว้น** โดยเฉพาะกับ migration ที่มี `delete`/`drop`/reset logic ซึ่งไม่ idempotent เลย ถ้าเจอ column
  `remote` ว่างสำหรับ migration ที่มั่นใจว่า apply ไปแล้วจริง ให้ `migration repair` ก่อนเสมอ ห้าม push ตรงๆ

- **2026-08-26**: แก้ Security Advisor warnings เพิ่ม (`0028_harden_function_search_path.sql`) — pin
  `search_path` ให้ฟังก์ชัน `SECURITY DEFINER` ทั้ง 9 ตัวที่มีในระบบ กัน search_path hijacking ไม่แก้ logic
  เลย
- **2026-08-26**: เพิ่ม `scripts/backup-db-to-r2.sh` — สำรอง DB ทั้งฐาน (`sc_*` + `inv_*`) แบบ `pg_dump`
  รายวันไป Cloudflare R2 เพราะ project นี้เป็น Free plan ไม่มี automated backup/PITR เลย (เหตุผลจากเหตุการณ์
  ด้านบนโดยตรง — ครั้งนั้นรอดเพราะ audit log บังเอิญครอบคลุมพอดี ตาราง `sc_*` เดิมไม่มี audit log แบบนี้เลย
  ถ้าเกิดเหตุการณ์ทำนองเดียวกันกับตารางนั้นจะกู้คืนไม่ได้) รันบนเซิร์ฟเวอร์ผ่าน cron ยังไม่ได้ตั้ง cron จริง —
  ต้องตั้งค่า `/etc/sneakercare-backup.env` + สร้าง R2 bucket + เพิ่ม crontab เองตามขั้นตอนในคอมเมนต์บนสุด
  ของไฟล์สคริปต์

- **2026-08-26**: **ผลข้างเคียงจากการกู้ ledger ตอนเช้า (เหตุการณ์ด้านบน) — `alert_muted` ของทุกสินค้าที่เคย
  ปิดแจ้งเตือนไว้หายไปเงียบๆ กลับเป็น false หมด** สาเหตุ: migration 0027 ลบ `inv_item_stock` ทั้งตารางแล้วให้
  trigger `inv_fn_apply_stock_transaction` คำนวณใหม่จากการ replay ledger — แต่ `alert_muted` (คอลัมน์เพิ่ม
  ใน 0025) ไม่มีตัวแทนอยู่ใน ledger เลย เพราะเป็นค่าที่ set ตรงผ่าน `inv_fn_set_alert_muted` (UPDATE) ไม่ใช่
  ผลจาก stock_transaction ไหนๆ แถวใหม่ที่ trigger สร้างเลยได้ค่า default (false) หมด **กู้ค่าที่หายไปคืนไม่ได้
  เลย เพราะตอนนั้น `inv_item_stock` ไม่มี audit trigger** ผู้ใช้ต้องตั้งค่า "ไม่ต้องแจ้งเตือน" ใหม่เองทุกตัวที่
  เคยปิดไว้ — แก้กันไม่ให้เกิดซ้ำแล้วด้วย `0029_audit_item_stock.sql` (เพิ่ม audit trigger ให้ตารางนี้เหมือน
  ตารางอื่น) **บทเรียน: ก่อนจะ `delete`/reset ตารางไหนเพื่อ "คำนวณใหม่จาก source of truth" ต้องเช็คก่อนเสมอว่า
  มีคอลัมน์ไหนในตารางนั้นที่ **ไม่ได้** derive จาก source of truth นั้นบ้าง (เช่น flag/setting ที่ set ตรง)
  ไม่งั้นจะหายไปเงียบๆ แบบนี้อีก**

- **2026-08-26**: เปลี่ยน cron แจ้งเตือนสต๊อกต่ำจากทุก 30 นาที เป็นวันละครั้งตอน 9 โมงเช้า (`0 2 * * *` UTC
  = 09:00 ไทย) ตามที่ user ขอ (`0030_low_stock_alert_daily_9am.sql`) — job เดิมชื่อ
  `inv-low-stock-alert-30min` ถูก unschedule แล้วสร้างใหม่ชื่อ `inv-low-stock-alert-daily-9am-th`
  edge function/dedup logic เดิมไม่ต้องแก้อะไร (เช็ค "แจ้งไปแล้ววันนี้หรือยัง" ยังใช้เป็น safety net ได้ปกติ)

  **เจอเพิ่มระหว่างเช็ค `cron.job`**: มี job ค้างอีกตัวชื่อ `low-stock-alert-30min` (คนละชื่อ ไม่มี prefix
  `inv-`) ยิง HTTP ไปที่ `https://tecrcoienazmtbynuqpg.supabase.co/functions/v1/low-stock-alert` ทุก 30
  นาทีมาตลอด — นั่นคือโฮสต์ของ project ทดลอง "shoe-care-inventory" ที่ลบทิ้งไปแล้วตั้งแต่ 2026-07-11 (resolve
  DNS ไม่ได้แล้วจริง) เดาว่าเคยมีคน setup cron ผิด project ตอนทดลอง Next.js rewrite ค้างไว้ ไม่กระทบอะไร
  (ยิงไม่ถึงปลายทางเลยสักครั้ง) แต่เป็นขยะค้าง ลบไปแล้วด้วย `0031_remove_dead_cross_project_cron_job.sql`
  **ถ้าเจอ error/พฤติกรรมแปลกๆ เกี่ยวกับ cron/pg_net อีกในอนาคต ให้เช็ค `select * from cron.job;` ทั้งหมดก่อน
  เสมอ ไม่ใช่เช็คแค่ job ที่คิดว่ารู้จัก — เผื่อมี job แปลกปลอมค้างจากที่อื่นแบบนี้อีก**

- **2026-08-26**: พบว่า `inv_p_item_stock_select` (RLS ของ `inv_item_stock`) เดิมเช็คแค่ "อยู่สาขาเดียวกัน
  ไหม" ไม่เช็ค role เลย ทำให้ manager/staff SELECT ตรงได้ทั้งแถวรวม `avg_unit_cost` — และ `useItemStock()`
  ฝั่งแอปก็ `select('*')` ตรงๆ ด้วย แปลว่าต้นทุนถูกโหลดลง browser ของ manager/staff ทุกคนอยู่แล้วในการใช้งาน
  ปกติ (เปิด devtools ธรรมดาก็เห็น ไม่ต้องเจาะระบบ) ทั้งที่หน้าเว็บซ่อนคอลัมน์นี้แค่ระดับ UI (`canSeeCost`) —
  แก้ด้วย `0032_hide_item_stock_cost_from_manager_staff.sql`: จำกัด SELECT ตรงบน `inv_item_stock` เหลือ
  admin (ทุกสาขา) + co-admin (เฉพาะสาขาตัวเอง) เหมือน `inv_stock_transactions` (0008) แล้วเพิ่ม
  `inv_v_item_stock` (view ไม่มีต้นทุน, **ตั้งใจเป็น security_invoker=false ห้ามแก้เป็น true** เพราะต้องการ
  ให้เห็นได้กว้างกว่า RLS ใหม่ของตารางฐาน ไม่ใช่แคบกว่า) ให้ทุก role เห็น current_qty/min_stock_level/
  alert_muted ได้ปกติ — ฝั่งแอปแก้ `useItemStock()` (`app/src/lib/queries/items.ts`) ให้ query 2 ทางแล้ว
  merge ฝั่ง client: view ปลอดภัย (ได้เสมอ) + `inv_item_stock` ตรงๆ สำหรับ `avg_unit_cost` (ได้จริงเฉพาะ
  admin/co-admin, role อื่นได้ `[]` เปล่าๆ จาก RLS เงียบๆ ไม่ error) **ห้ามรวมกลับเป็น `select('*')` เดียว
  เหมือนเดิมเด็ดขาด** ยืนยันแล้วว่า build ผ่าน, co-admin ยังเห็นข้อมูลครบ 46 แถวเหมือนเดิมทั้งสองทาง

  **⚠️ บทเรียนสำคัญเรื่องวิธีตรวจสอบ RLS**: ตอนแรกใช้ `supabase db query --linked` + `set_config('request.jwt.claims', ...)`
  เพื่อจำลอง role ต่างๆ ตรวจ RLS — **วิธีนี้ใช้ไม่ได้จริง เพราะ `db query` ต่อผ่าน Management API ด้วย role
  ที่ bypass RLS เสมอ ไม่ว่าจะตั้ง `request.jwt.claims` เป็นอะไรก็ตาม** (พิสูจน์แล้ว: manager จำลองผ่าน
  `db query` เห็น `inv_item_stock` ครบทุกแถวทั้งที่ RLS ควรบล็อก) ใช้ได้แค่ตรวจ metadata/policy text/view
  definition เท่านั้น (สิ่งที่จริงไม่ว่า role ไหนยิง) **ห้ามใช้ `db query` เป็นหลักฐานว่า RLS "ทำงานจริง" กับ
  role ใดๆ เด็ดขาด** วิธีตรวจที่ถูกต้องคือสร้าง user จริงชั่วคราวผ่าน `admin.auth.admin.createUser()`
  (service_role key) → `signInWithPassword()` เอา JWT จริง → ยิงผ่าน `@supabase/supabase-js` ปกติ (เหมือน
  แอปจริงทำ) → ลบ user ทิ้งหลังเสร็จ — วิธีนี้ใช้ยืนยัน 0026/0032 แล้วว่าทำงานถูกต้องจริงกับทั้ง manager และ
  co-admin (ก่อนหน้านี้ "ยืนยันแล้ว" หลายจุดในไฟล์นี้ที่อ้างอิงแค่ `db query` ควรถือว่าเป็นแค่ตรวจ SQL/policy
  text ถูกต้อง ไม่ใช่หลักฐานว่า enforcement จริงทำงานถูกต้อง 100%)

- **2026-08-26**: พบระหว่างเขียน pgTAP test ให้ `inv_fn_approve_adjustment` ว่ามีบั๊กเดียวกันเป๊ะกับที่เจอและ
  แก้ไปแล้วในโปรเจกต์ RRS (Next.js rewrite ที่ทำคู่ขนานกันตอนเช้าของวันนี้) 2 จุด: (1) ไม่ `for update` ก่อน
  update ทำให้กด approve/reject รายการเดียวกันพร้อมกันสองครั้งนับสต๊อกซ้ำได้ (2) UPDATE `inv_item_stock`
  ตรงๆ โดยไม่เช็คว่ามีแถวอยู่ก่อน ทำให้อนุมัติปรับลดของ item ที่ไม่เคยมี `inv_item_stock` ที่สาขานั้นผ่านเงียบๆ
  โดยไม่มีผลอะไรกับยอดจริงเลย แก้ด้วย `0033_fix_approve_adjustment_race_and_missing_item_stock.sql`
  ยืนยันแล้วผ่าน `db query` (ใช้ได้สำหรับกรณีนี้เพราะทดสอบ error/success ของ business logic ไม่ใช่ RLS)

- **2026-08-26**: เพิ่ม pgTAP test suite ที่ `supabase/tests/database/` (5 ไฟล์: moving average cost,
  alert_muted ต้องรอดจาก stock_in ซ้ำ [regression ของเหตุการณ์ด้านบน], RLS ของ `inv_item_stock`/
  `inv_v_item_stock`, `inv_fn_approve_adjustment` [role/branch check + idempotency + upsert guard],
  staff-safe views) รันด้วย `supabase test db` (ต้อง Docker Desktop) เขียนโดยตรวจ fixture pattern
  (`auth.users`/`sc_users` insert) กับฐานข้อมูลจริงในทรานแซกชันที่ rollback ก่อนทุกไฟล์ เพื่อความมั่นใจสูงสุด
  เท่าที่ทำได้โดยไม่มี Docker ในเครื่องที่เขียน

## คำสั่งที่ใช้บ่อย

```bash
# Deploy edge function
npx --yes supabase functions deploy <name> --project-ref mdlxogfkpwejnqpzhmoy

# Query DB ตรงๆ (ใช้ตรวจสอบ ไม่ใช่แก้ข้อมูลจริงถ้าไม่จำเป็น)
npx --yes supabase db query "SELECT ..." --linked
```
