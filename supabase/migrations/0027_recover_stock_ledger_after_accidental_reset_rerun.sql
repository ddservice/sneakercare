-- เหตุการณ์ (2026-08-26): `supabase db push` ถูกรันโดยไม่เช็ค `supabase migration list` ก่อน
-- remote schema_migrations ไม่เคยบันทึกว่า 0019-0025 apply ไปแล้ว (ของจริงถูก apply ผ่าน Management API
-- ตรงๆ ตอนย้ายระบบ ไม่ผ่าน `db push` — ดู CLAUDE.md หัวข้อ Migrations) ทำให้ 0019 ถูกรันซ้ำ ซึ่งไฟล์นั้นมี
-- `delete from inv_stock_transactions; delete from inv_item_stock;` แล้วค่อย insert ข้อมูลย้อนหลังชุดเก่า
-- (เม.ย.-ก.ค. 2569) กลับเข้าไปแทน — ผลคือ **ลบประวัติการเคลื่อนไหวสต๊อกจริงตั้งแต่ 29 ก.ค. ถึง 26 ส.ค.
-- (104 รายการ) ทิ้งไปหมด** เหลือแค่ 16 แถวเก่าที่ 0019 insert ซ้ำ (สร้าง id ใหม่ทั้งหมด) และ 0019 ยัง
-- `insert into inv_items` สำหรับ "ไส้กรองน้ำ" แบบไม่กันซ้ำ สร้างรายการสินค้าซ้ำเพิ่มมาอีก 1 แถวด้วย
--
-- กู้คืนได้จาก `inv_audit_logs` เพราะ trigger `inv_trg_audit_stock_transactions` (AFTER INSERT) เก็บ
-- snapshot เต็มทุกคอลัมน์ไว้ใน after_data ของทุกแถวที่เคย insert จริง — ตารางนี้ไม่ถูกแตะเลยจากเหตุการณ์นี้
-- (revoke update/delete จาก authenticated ไว้แล้วตามกฎ audit log ห้ามแก้)
--
-- ตรวจสอบก่อนเขียน migration นี้แล้ว (อ่านอย่างเดียว ไม่มีผลข้างเคียง):
--   - หาจุดตัดได้ที่ 2026-07-29 10:32:04.885326+00 (เวลาที่ 0019 รันครั้งแรกของจริง, มี 18 แถว baseline)
--   - ระหว่าง 2026-07-29 10:32:04 ถึงก่อน 2026-08-26 05:00:00 (ก่อนรันซ้ำ) มี audit log ของ
--     inv_stock_transactions ทั้งหมด 104 แถว, action = 'INSERT' ล้วน, status = 'approved' ล้วน
--     (ไม่มีแถวไหนค้าง pending_approval ที่จะทำให้ audit snapshot ไม่ตรงกับสถานะจริงตอนนี้)
--   - ทุกแถวมี transaction_date ครบ ไม่มี null, item_id ทุกแถวยังมีอยู่จริงใน inv_items ปัจจุบัน
--     (รายการ "ไส้กรองน้ำ" ตัวเดิมถูกเปลี่ยนชื่อเป็น "ไส้กรองน้ำแบบ 1 เดือน" ไปแล้วตามปกติ ไม่ใช่ถูกลบ)
--   - corrects_txn_id ที่ผูกกัน 4 แถว (2 คู่) อ้างถึงกันเองอยู่ภายใน 104 แถวนี้ครบ ไม่มี dangling reference
--     และเรียง insert ตาม performed_at เดิมอยู่แล้วทำให้แถวต้นทางถูก insert ก่อนแถวที่อ้างอิงเสมอ

begin;

-- 1) ลบ 16 แถวที่ 0019 สร้างซ้ำวันนี้ทิ้ง (timestamp เดียวกันเป๊ะทุกแถว เพราะ insert ในทรานแซกชันเดียว)
delete from inv_stock_transactions where created_at = '2026-08-26 05:12:14.462197+00';

-- 2) เคลียร์ cache ยอดคงเหลือทั้งหมดก่อน (ต้องทำก่อนลบ item ซ้ำด้านล่าง เพราะ inv_item_stock มี FK
--    ไปที่ inv_items — ลำดับเดิมสลับกันทำให้ FK violation ตอนลองรันจริงมาแล้วรอบหนึ่ง) จะถูกคำนวณใหม่จาก
--    trigger ตอน replay ประวัติจริงตามลำดับเวลาด้านล่าง
delete from inv_item_stock;

-- 3) ลบ log แจ้งเตือนสต๊อกต่ำที่ pg_cron ยิงไปแล้วสำหรับสินค้าซ้ำตัวนี้ระหว่างที่มันมีอยู่ในระบบไม่กี่นาที
delete from inv_notification_log where item_id = '6fb5340c-5d60-4a66-a85f-ca2d07975ca1';

-- 4) ลบรายการสินค้าซ้ำที่ 0019 สร้างซ้ำวันนี้ (ปลอดภัยแล้วหลังข้อ 1-3 เพราะไม่มีอะไรอ้างอิงเหลืออยู่)
delete from inv_items
where id = '6fb5340c-5d60-4a66-a85f-ca2d07975ca1' and name = 'ไส้กรองน้ำ'
  and not exists (select 1 from inv_stock_transactions where item_id = inv_items.id)
  and not exists (select 1 from inv_item_stock where item_id = inv_items.id)
  and not exists (select 1 from inv_notification_log where item_id = inv_items.id);

-- 5) เล่นซ้ำ (replay) ประวัติจริง 104 รายการจาก audit log ตามลำดับเวลาเดิมเป๊ะ ให้ trigger
--    inv_fn_apply_stock_transaction คำนวณต้นทุนถัวเฉลี่ยเคลื่อนที่ใหม่ให้ถูกต้องทีละขั้นเหมือนตอนเกิดขึ้นจริง
insert into inv_stock_transactions
  (id, item_id, branch_id, txn_type, status, quantity_delta, unit_cost_snapshot,
   reference_type, reference_note, corrects_txn_id, reason, performed_by, approved_by,
   created_at, supplier_id, transaction_date)
select
  (after_data->>'id')::uuid,
  (after_data->>'item_id')::uuid,
  (after_data->>'branch_id')::uuid,
  (after_data->>'txn_type')::inv_txn_type,
  (after_data->>'status')::inv_txn_status,
  (after_data->>'quantity_delta')::numeric,
  (after_data->>'unit_cost_snapshot')::numeric,
  after_data->>'reference_type',
  after_data->>'reference_note',
  nullif(after_data->>'corrects_txn_id', '')::uuid,
  after_data->>'reason',
  (after_data->>'performed_by')::uuid,
  nullif(after_data->>'approved_by', '')::uuid,
  (after_data->>'created_at')::timestamptz,
  nullif(after_data->>'supplier_id', '')::uuid,
  (after_data->>'transaction_date')::date
from inv_audit_logs
where table_name = 'inv_stock_transactions'
  and action = 'INSERT'
  and performed_at >= '2026-07-29 10:32:04.885326+00'
  and performed_at < '2026-08-26 05:00:00'
order by performed_at asc;

commit;
