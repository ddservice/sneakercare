# CLAUDE.md

คำแนะนำสำหรับ Claude Code เมื่อทำงานในโปรเจกต์นี้ — **ระบบจัดการร้าน SneakerCare (DD Service)**
อัปเดตไฟล์นี้ทุกครั้งหลังแก้ไข/deploy อะไรใหม่ — ห้ามปล่อยให้ไฟล์นี้ล้าหลังโค้ดจริง

## ภาพรวมระบบ — สำคัญมาก อ่านก่อนแก้อะไร

นี่คือ**ระบบ production จริงที่มีลูกค้า/ผู้ใช้งานจริง** ไม่ใช่ demo หรือ dev environment:

- **Frontend**: ไฟล์ HTML เดียว `sneakercare_dashboard.html` (~7,000+ บรรทัด) vanilla JavaScript ไม่มี
  build step, ไม่มี framework, เรียก Supabase ตรงจาก browser ด้วย anon/publishable key — **ไม่มี backend
  server เลย** (ยกเว้น Supabase Edge Functions ที่ deploy แยกสำหรับงานเฉพาะทาง)
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
- **Co-Admin**: สิทธิ์เกือบเท่า Admin ยกเว้นบางจุด (จัดการผู้ใช้, ทำความสะอาดข้อมูล, อนุมัติปรับปรุงสต๊อก)
- **Manager/Staff**: เห็นเฉพาะเบิกใช้งานสต๊อก + กรอกข้อมูลประจำวัน กรอกย้อนหลังไม่ได้ (`s_date` ถูกล็อกไว้)

### ระบบสิทธิ์แบบ checkbox (ใหม่ 2026-07-11)

ตาราง `ui_permissions(role, feature_key, visible)` — Admin ปรับได้เองผ่านการ์ด **"สิทธิ์การมองเห็นเมนู"**
ในหน้าตั้งค่า (ไม่ต้องแก้โค้ดอีกต่อไปเวลาต้องการเปิด/ปิดเมนูให้ role ไหน)

- โหลดผ่าน `loadUiPermissions()` (ตอน login, เก็บใน global `UI_PERMISSIONS`), เช็คด้วย `uiVisible(featureKey)`
- **คุมแค่ "มองเห็นเมนู" เท่านั้น ไม่ใช่สิทธิ์เขียนข้อมูลจริง** — สิทธิ์เขียน/ลบข้อมูลจริงยังคุมด้วย RLS
  แยกต่างหาก ถ้าจะเปิดเมนูใหม่ให้ role ไหนเห็น **ต้องเช็ค RLS ของตารางที่เกี่ยวข้องด้วยเสมอ** ว่า role นั้น
  เขียนข้อมูลได้จริงไหม ไม่งั้นจะเห็นปุ่มแต่กดแล้ว error (เคยเกิดแล้วตอนเปิด `inv_card_items` ให้ Co-Admin —
  ต้องแก้ RLS `inv_p_items_write_admin_co_admin` คู่กันไปด้วย)
- ฟีเจอร์ที่ยังคุมด้วย role ตรงๆ ไม่ผ่านระบบ checkbox (เพราะผูกกับ RLS แบบตายตัว): การอนุมัติปรับปรุงสต๊อก
  (`fn_approve_adjustment`/`inv_fn_approve_adjustment` เช็ค admin เท่านั้นเสมอ), สถานะ adjustment ของ
  Co-Admin ที่ต้องเป็น `pending_approval` เสมอ
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
  - **UX เพิ่มเติม**: การ์ด "ประวัติการซื้อเข้า" ตอนนี้เช็คว่าแต่ละแถวเคยถูกกด "แก้ไข"/"ลบ" ไปแล้วหรือยัง
    (มี `adjustment_decrease` อ้าง `corrects_txn_id` กลับมาไหม) ถ้ามีจะโชว์ badge สถานะ (รออนุมัติ / ถูกลบแล้ว
    ขีดฆ่า / ถูกปฏิเสธ) และปิดปุ่มแก้ไข/ลบซ้ำถ้ายัง pending หรือ approved ไปแล้ว — กัน Co-Admin กดซ้ำซ้อน
    ระหว่างรอ Admin อนุมัติ
- **ลบสินค้าออกจากแคตตาล็อก (2026-07-13)**: ปุ่ม "ลบ" ที่หน้าจัดการสินค้า เช็คก่อนเสมอว่า
  `inv_stock_transactions` ของ item นั้นมีกี่แถว **ถ้า > 0 บล็อกการลบทันที** (บอกให้ใช้ "ปิดใช้งาน" แทน)
  เพราะการลบ inv_items ที่มี stock_transactions อ้างอิงอยู่จะทำให้ audit trail ขาดหาย/หรือชน FK constraint —
  ลบได้จริงเฉพาะ item ที่สร้างแล้วไม่เคยมีการเคลื่อนไหวสต๊อกเลย และต้องพิมพ์ชื่อ item ให้ตรงเป๊ะก่อนปุ่ม
  "ลบถาวร" จะกดได้ (เรียนรู้จาก incident milo ที่ confirm() ธรรมดาไม่พอ)

## Migrations

อยู่ที่ `supabase/migrations/` เรียงลำดับ 0001-0011+ — **ห้ามแก้ไฟล์ migration เก่าที่ apply ไปแล้ว** สร้าง
ไฟล์ใหม่เสมอ วิธี apply:
```bash
export SUPABASE_ACCESS_TOKEN="<personal access token>"
npx --yes supabase link --project-ref mdlxogfkpwejnqpzhmoy
npx --yes supabase db push --linked --yes
```
(access token เป็นของ session-specific ไม่ persist ระหว่าง session ต้องขอผู้ใช้สร้างใหม่ทุกครั้งที่เริ่ม
session ใหม่ผ่าน supabase.com/dashboard/account/tokens — เตือนให้ revoke ทิ้งหลังใช้เสร็จด้วยทุกครั้ง)

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

## คำสั่งที่ใช้บ่อย

```bash
# Deploy edge function
npx --yes supabase functions deploy <name> --project-ref mdlxogfkpwejnqpzhmoy

# Query DB ตรงๆ (ใช้ตรวจสอบ ไม่ใช่แก้ข้อมูลจริงถ้าไม่จำเป็น)
npx --yes supabase db query "SELECT ..." --linked
```
