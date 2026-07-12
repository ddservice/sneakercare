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
  `inv_card_items`, `inv_card_stock_in`, `inv_card_adjustment`, `inv_card_pending`, `inv_card_audit`,
  `inv_card_settings`, `inv_cost_col_head`

## ระบบคลังสินค้าใหม่ (inv_*) — เพิ่มเข้าไปแบบ additive เมื่อ 2026-07-10/11

ไม่แตะ/ลบตาราง `sc_*` เดิมเลย เพิ่มตารางใหม่ prefix `inv_` ข้างๆ กัน:

- `inv_branches`, `inv_items` (แคตตาล็อกกลาง), `inv_item_stock` (ยอดคงเหลือต่อสาขา), `inv_stock_transactions`
  (ledger แบบ append-only), `inv_audit_logs` (แก้ไข/ลบไม่ได้เด็ดขาด แม้แต่ Admin — revoke สิทธิ์ระดับ DB),
  `inv_integration_secrets` (Telegram token แบบ write-only), `inv_notification_log`
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

## Migrations

อยู่ที่ `supabase/migrations/` เรียงลำดับ 0001-0005+ — **ห้ามแก้ไฟล์ migration เก่าที่ apply ไปแล้ว** สร้าง
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

## คำสั่งที่ใช้บ่อย

```bash
# Deploy edge function
npx --yes supabase functions deploy <name> --project-ref mdlxogfkpwejnqpzhmoy

# Query DB ตรงๆ (ใช้ตรวจสอบ ไม่ใช่แก้ข้อมูลจริงถ้าไม่จำเป็น)
npx --yes supabase db query "SELECT ..." --linked
```
