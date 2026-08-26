-- ทดสอบ inv_fn_apply_stock_transaction (trigger บน inv_stock_transactions) — ต้นทุนถัวเฉลี่ยเคลื่อนที่
-- รันแบบ superuser (ไม่ผ่าน RLS) เพราะ trigger นี้เป็น pure computation ไม่พึ่ง auth.uid()/inv_fn_current_role()
-- fixture pattern นี้ตรวจสอบกับฐานข้อมูลจริงแล้วว่ารันได้ถูกต้องก่อนเขียนไฟล์นี้ (2026-08-26)
-- รันด้วย: supabase test db (ต้องมี Docker Desktop เปิดอยู่)

begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values ('00000000-0000-0000-0000-0000000010a1', 'movavg.test@local.test', 'x', now(), 'authenticated', 'authenticated');

insert into sc_users (user_id, username, role)
values ('00000000-0000-0000-0000-0000000010a1', 'movavg_admin', 'admin');

insert into inv_branches (id, name) values ('00000000-0000-0000-0000-0000000010b1', 'Test Branch MA');

insert into inv_items (id, sku, name, item_type, category, base_unit, purchase_unit, purchase_unit_qty)
values ('00000000-0000-0000-0000-0000000010c1', 'MA-TEST-1', 'Test Consumable', 'consumable', 'test', 'ml', 'bottle', 500);

-- stock_in #1: 10 หน่วย ต้นทุน 100/หน่วย
insert into inv_stock_transactions (item_id, branch_id, txn_type, status, quantity_delta, unit_cost_snapshot, performed_by)
values ('00000000-0000-0000-0000-0000000010c1', '00000000-0000-0000-0000-0000000010b1', 'stock_in', 'approved', 10, 100, '00000000-0000-0000-0000-0000000010a1');

-- stock_in #2: 10 หน่วย ต้นทุน 200/หน่วย -> ถัวเฉลี่ยควรเป็น (10*100 + 10*200) / 20 = 150
insert into inv_stock_transactions (item_id, branch_id, txn_type, status, quantity_delta, unit_cost_snapshot, performed_by)
values ('00000000-0000-0000-0000-0000000010c1', '00000000-0000-0000-0000-0000000010b1', 'stock_in', 'approved', 10, 200, '00000000-0000-0000-0000-0000000010a1');

select is(
  (select current_qty from inv_item_stock where item_id = '00000000-0000-0000-0000-0000000010c1'),
  20::numeric,
  'current_qty รวมสองรอบ stock_in ถูกต้อง'
);
select is(
  (select avg_unit_cost from inv_item_stock where item_id = '00000000-0000-0000-0000-0000000010c1'),
  150::numeric,
  'avg_unit_cost ถัวเฉลี่ยแบบถ่วงน้ำหนักตามจำนวนถูกต้อง'
);

-- stock_out: เบิกออก 5 หน่วย ต้อง snapshot ต้นทุนเป็น avg_unit_cost ปัจจุบัน (150) ไม่ใช่ค่าที่ส่งมา
insert into inv_stock_transactions (item_id, branch_id, txn_type, status, quantity_delta, performed_by)
values ('00000000-0000-0000-0000-0000000010c1', '00000000-0000-0000-0000-0000000010b1', 'stock_out', 'approved', -5, '00000000-0000-0000-0000-0000000010a1');

select is(
  (select current_qty from inv_item_stock where item_id = '00000000-0000-0000-0000-0000000010c1'),
  15::numeric,
  'current_qty ลดลงหลัง stock_out'
);
select is(
  (select unit_cost_snapshot from inv_stock_transactions
     where item_id = '00000000-0000-0000-0000-0000000010c1' and txn_type = 'stock_out'),
  150::numeric,
  'stock_out ใช้ avg_unit_cost ปัจจุบันเป็น COGS snapshot โดยไม่สนใจค่าที่ส่งเข้ามา'
);

select * from finish();
rollback;
