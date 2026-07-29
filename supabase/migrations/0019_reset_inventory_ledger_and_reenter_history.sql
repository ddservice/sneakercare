-- ผู้ใช้ยืนยันให้ "เคลียร์" ค่าทุกอย่างในระบบคลังสินค้าออกให้หมด (จำนวน/ต้นทุน/ประวัติการเคลื่อนไหว)
-- เพื่อให้พนักงานเริ่มกรอกข้อมูลใหม่ได้สะอาด แต่ให้เก็บ "รายการชื่อสินค้า" (inv_items) ไว้ทั้งหมด —
-- สาเหตุที่ต้องเคลียร์: ข้อมูลเดิมใน inv_stock_transactions (31 แถว) เป็นข้อมูลทดสอบตอนสร้างฟีเจอร์
-- แก้ไข/ยกเลิกรายการซื้อกับฟีเจอร์กรอกวันที่ย้อนหลัง (13 ก.ค.) ปนกับข้อมูลจริงบางส่วน และมี "ของผี"
-- ค้างอยู่จริง 2 หน่วยของ "น้ำยาขจัดคราบสีแดง" ที่ไม่เคยถูกยกเลิก บวกกับปัญหา transaction_date ของแถว
-- ที่มีอยู่ก่อนคอลัมน์นี้ถูกเพิ่ม (migration 0015) ถูกตั้งเป็นวันที่รัน migration นั้นหมด (13 ก.ค.) ไม่ใช่
-- วันที่ซื้อจริง ทำให้ยอดเดือน เม.ย./พ.ค./มิ.ย. หายไปและกองรวมอยู่ที่ ก.ค. แทน
--
begin;

-- ขั้นที่ 1: ล้าง ledger + cache สต๊อกทั้งหมด (ไม่แตะ inv_items, inv_suppliers, inv_audit_logs)
delete from inv_stock_transactions;
delete from inv_item_stock;

-- ขั้นที่ 2: เพิ่มสินค้าที่ยังไม่มีในระบบ (ไส้กรองน้ำ) — ผู้ใช้ยังไม่ได้ระบุหมวดหมู่/หน่วยที่แน่นอน
-- ตั้งเป็นค่าเริ่มต้นที่สมเหตุสมผลไปก่อน แก้ไขเพิ่มเติมได้ทีหลังผ่านหน้าคลังสินค้า
insert into inv_items (name, item_type, category, base_unit, purchase_unit, purchase_unit_qty, default_min_stock_level)
values ('ไส้กรองน้ำ', 'consumable', 'อื่นๆ', 'ชิ้น', 'ชิ้น', 1, 1);

-- ขั้นที่ 3: กรอกยอดซื้อจริงที่ผู้ใช้ยืนยันแล้วย้อนหลังตามเดือนจริง (ยังไม่ทราบวันที่แน่นอนในแต่ละเดือน
-- ใช้วันที่ 1 ของเดือนไปก่อน ยกเว้นน้ำยาขจัดคราบสีฟ้าที่ทราบวันจริงจากข้อมูลเดิมคือ 24 ก.ค.)
do $$
declare
  v_branch_id uuid := 'cb8dcf5d-7e5e-4671-be42-aca79469a19b';
  v_admin_id  uuid := '7649a97a-2c79-41cd-9c35-27398ea73c28';
begin
  -- เมษายน
  insert into inv_stock_transactions (item_id, branch_id, txn_type, transaction_date, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
  select id, v_branch_id, 'stock_in', '2026-04-01', 2, 415.00, 'purchase', 'กรอกย้อนหลังยืนยันโดยผู้ใช้ (เคลียร์ระบบ ก.ค. 2026)', v_admin_id
  from inv_items where name = 'น้ำยาขจัดคราบสีแดง';

  -- พฤษภาคม
  insert into inv_stock_transactions (item_id, branch_id, txn_type, transaction_date, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
  select id, v_branch_id, 'stock_in', '2026-05-01', 1, 932.00, 'purchase', 'กรอกย้อนหลังยืนยันโดยผู้ใช้ (เคลียร์ระบบ ก.ค. 2026)', v_admin_id
  from inv_items where name = 'ไส้กรองน้ำ';

  insert into inv_stock_transactions (item_id, branch_id, txn_type, transaction_date, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
  select id, v_branch_id, 'stock_in', '2026-05-01', 12, 28.25, 'purchase', 'กรอกย้อนหลังยืนยันโดยผู้ใช้ (เคลียร์ระบบ ก.ค. 2026)', v_admin_id
  from inv_items where name = 'ไฮเตอร์มาเล';

  insert into inv_stock_transactions (item_id, branch_id, txn_type, transaction_date, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
  select id, v_branch_id, 'stock_in', '2026-05-01', 15, 17.04, 'purchase', 'กรอกย้อนหลังยืนยันโดยผู้ใช้ (เคลียร์ระบบ ก.ค. 2026) — ซื้อพร้อมไซส์ S รวมบิลเดียว 426 บาท', v_admin_id
  from inv_items where name = 'ถุงมือยาง ไซส์ L';

  insert into inv_stock_transactions (item_id, branch_id, txn_type, transaction_date, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
  select id, v_branch_id, 'stock_in', '2026-05-01', 10, 17.04, 'purchase', 'กรอกย้อนหลังยืนยันโดยผู้ใช้ (เคลียร์ระบบ ก.ค. 2026) — ซื้อพร้อมไซส์ L รวมบิลเดียว 426 บาท', v_admin_id
  from inv_items where name = 'ถุงมือยาง ไซส์ S';

  insert into inv_stock_transactions (item_id, branch_id, txn_type, transaction_date, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
  select id, v_branch_id, 'stock_in', '2026-05-01', 12, 28.833333, 'purchase', 'กรอกย้อนหลังยืนยันโดยผู้ใช้ (เคลียร์ระบบ ก.ค. 2026)', v_admin_id
  from inv_items where name = 'แปรงทองเหลือง';

  insert into inv_stock_transactions (item_id, branch_id, txn_type, transaction_date, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
  select id, v_branch_id, 'stock_in', '2026-05-01', 2, 333.50, 'purchase', 'กรอกย้อนหลังยืนยันโดยผู้ใช้ (เคลียร์ระบบ ก.ค. 2026)', v_admin_id
  from inv_items where name = 'สีทารองเท้า';

  insert into inv_stock_transactions (item_id, branch_id, txn_type, transaction_date, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
  select id, v_branch_id, 'stock_in', '2026-05-01', 480, 1091.0/480, 'purchase', 'กรอกย้อนหลังยืนยันโดยผู้ใช้ (เคลียร์ระบบ ก.ค. 2026) — ซื้อรอบที่ 1', v_admin_id
  from inv_items where name = 'ถุงใส่รองเท้า';

  insert into inv_stock_transactions (item_id, branch_id, txn_type, transaction_date, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
  select id, v_branch_id, 'stock_in', '2026-05-01', 300, 719.0/300, 'purchase', 'กรอกย้อนหลังยืนยันโดยผู้ใช้ (เคลียร์ระบบ ก.ค. 2026) — ซื้อรอบที่ 2', v_admin_id
  from inv_items where name = 'ถุงใส่รองเท้า';

  insert into inv_stock_transactions (item_id, branch_id, txn_type, transaction_date, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
  select id, v_branch_id, 'stock_in', '2026-05-01', 180, 436.0/180, 'purchase', 'กรอกย้อนหลังยืนยันโดยผู้ใช้ (เคลียร์ระบบ ก.ค. 2026) — ซื้อรอบที่ 3', v_admin_id
  from inv_items where name = 'ถุงใส่รองเท้า';

  -- มิถุนายน
  insert into inv_stock_transactions (item_id, branch_id, txn_type, transaction_date, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
  select id, v_branch_id, 'stock_in', '2026-06-01', 300, 749.0/300, 'purchase', 'กรอกย้อนหลังยืนยันโดยผู้ใช้ (เคลียร์ระบบ ก.ค. 2026)', v_admin_id
  from inv_items where name = 'ถุงใส่รองเท้า';

  insert into inv_stock_transactions (item_id, branch_id, txn_type, transaction_date, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
  select id, v_branch_id, 'stock_in', '2026-06-01', 5, 200.00, 'purchase', 'กรอกย้อนหลังยืนยันโดยผู้ใช้ (เคลียร์ระบบ ก.ค. 2026)', v_admin_id
  from inv_items where name = 'หมึกเครื่องปริ้น';

  insert into inv_stock_transactions (item_id, branch_id, txn_type, transaction_date, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
  select id, v_branch_id, 'stock_in', '2026-06-01', 50, 13.26, 'purchase', 'กรอกย้อนหลังยืนยันโดยผู้ใช้ (เคลียร์ระบบ ก.ค. 2026)', v_admin_id
  from inv_items where name = 'กระดาษปริ้นบิล 80*80mm';

  insert into inv_stock_transactions (item_id, branch_id, txn_type, transaction_date, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
  select id, v_branch_id, 'stock_in', '2026-06-01', 3, 237.00, 'purchase', 'กรอกย้อนหลังยืนยันโดยผู้ใช้ (เคลียร์ระบบ ก.ค. 2026)', v_admin_id
  from inv_items where name = 'ค่าน้ำยาซักรองเท้าหนังกลับ';

  insert into inv_stock_transactions (item_id, branch_id, txn_type, transaction_date, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
  select id, v_branch_id, 'stock_in', '2026-06-01', 2, 219.00, 'purchase', 'กรอกย้อนหลังยืนยันโดยผู้ใช้ (เคลียร์ระบบ ก.ค. 2026)', v_admin_id
  from inv_items where name = 'น้ำหอมฉีดรองเท้า';

  -- กรกฎาคม
  insert into inv_stock_transactions (item_id, branch_id, txn_type, transaction_date, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
  select id, v_branch_id, 'stock_in', '2026-07-13', 3, 37.00, 'purchase', 'กรอกย้อนหลังยืนยันโดยผู้ใช้ (เคลียร์ระบบ ก.ค. 2026)', v_admin_id
  from inv_items where name = 'น้ำยาซักผ้า';

  insert into inv_stock_transactions (item_id, branch_id, txn_type, transaction_date, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
  select id, v_branch_id, 'stock_in', '2026-07-13', 2, 223.00, 'purchase', 'กรอกย้อนหลังยืนยันโดยผู้ใช้ (เคลียร์ระบบ ก.ค. 2026) — ซื้อซ้ำคนละราคากับรอบมิถุนายน', v_admin_id
  from inv_items where name = 'ค่าน้ำยาซักรองเท้าหนังกลับ';

  insert into inv_stock_transactions (item_id, branch_id, txn_type, transaction_date, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
  select id, v_branch_id, 'stock_in', '2026-07-24', 8, 103.00, 'purchase', 'กรอกย้อนหลังยืนยันโดยผู้ใช้ (เคลียร์ระบบ ก.ค. 2026) — ตรงกับวันที่จริงที่เคยบันทึกไว้', v_admin_id
  from inv_items where name = 'น้ำยาขจัดคราบสีฟ้า';
end $$;

commit;
