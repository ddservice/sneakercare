-- ทดสอบว่า manager/staff ถูกกันไม่ให้เห็นข้อมูลต้นทุนผ่าน view ไหนเลยเด็ดขาด (0026, 0032) และยังเห็นข้อมูล
-- ที่จำเป็นต่อการทำงานปกติ (current_qty ผ่าน inv_v_item_stock) ได้อยู่ — ค่าที่คาดหวังในไฟล์นี้ผ่านการ
-- ยืนยันแล้วจริงด้วยการสร้าง user จริง เซ็น JWT จริง แล้วยิงผ่าน PostgREST endpoint จริง (ไม่ใช่แค่ตรวจ
-- SQL เฉยๆ) ก่อนเขียนไฟล์นี้ (2026-08-26) — ผลตรงกับที่เทสนี้ assert ทุกจุด
-- รันด้วย: supabase test db (ต้องมี Docker Desktop เปิดอยู่)

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-0000000014a1', 'view.admin@local.test', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000014a2', 'view.manager@local.test', 'x', now(), 'authenticated', 'authenticated');

insert into inv_branches (id, name) values ('00000000-0000-0000-0000-0000000014b1', 'Test Branch Views');

insert into sc_users (user_id, username, role, branch_id)
values
  ('00000000-0000-0000-0000-0000000014a1', 'view_admin', 'admin', null),
  ('00000000-0000-0000-0000-0000000014a2', 'view_manager', 'manager', '00000000-0000-0000-0000-0000000014b1');

insert into inv_items (id, sku, name, item_type, category, base_unit, purchase_unit, purchase_unit_qty)
values ('00000000-0000-0000-0000-0000000014c1', 'VIEW-TEST-1', 'Test Item For Views', 'consumable', 'test', 'ml', 'bottle', 500);

insert into inv_stock_transactions (item_id, branch_id, txn_type, status, quantity_delta, unit_cost_snapshot, performed_by)
values ('00000000-0000-0000-0000-0000000014c1', '00000000-0000-0000-0000-0000000014b1', 'stock_in', 'approved', 100, 50, '00000000-0000-0000-0000-0000000014a1');

insert into inv_stock_transactions (item_id, branch_id, txn_type, status, quantity_delta, performed_by)
values ('00000000-0000-0000-0000-0000000014c1', '00000000-0000-0000-0000-0000000014b1', 'stock_out', 'approved', -20, '00000000-0000-0000-0000-0000000014a1');

-- มุมมองฝั่ง manager: เห็น qty ผ่าน view ปลอดภัยได้ แต่ต้องได้ 0 แถวจากทุก view/ตารางที่มีต้นทุน
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000014a2')::text, true);

select cmp_ok(
  (select count(*)::int from inv_v_item_stock where item_id = '00000000-0000-0000-0000-0000000014c1'),
  '=', 1,
  'manager เห็น current_qty ผ่าน inv_v_item_stock ได้ปกติ'
);
select is(
  (select count(*)::int from inv_item_stock where item_id = '00000000-0000-0000-0000-0000000014c1'),
  0,
  'manager ต้องได้ 0 แถวจาก inv_item_stock ตรงๆ (มีต้นทุน)'
);
select is((select count(*)::int from inv_v_inventory_value), 0, 'manager ต้องได้ 0 แถวจาก inv_v_inventory_value');
select is((select count(*)::int from inv_v_monthly_cogs), 0, 'manager ต้องได้ 0 แถวจาก inv_v_monthly_cogs');
select is((select count(*)::int from inv_v_top_consumed_items_30d), 0, 'manager ต้องได้ 0 แถวจาก inv_v_top_consumed_items_30d');

-- มุมมองฝั่ง admin: ต้องเห็นข้อมูลจริง ยืนยันว่า view ไม่ได้บล็อกทุกคน (ไม่ใช่แค่ manager ที่เห็น 0)
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000014a1')::text, true);

select cmp_ok(
  (select count(*)::int from inv_item_stock where item_id = '00000000-0000-0000-0000-0000000014c1'),
  '=', 1,
  'admin เห็น inv_item_stock (มีต้นทุน) ได้ปกติ'
);
select cmp_ok(
  (select count(*)::int from inv_v_monthly_cogs where branch_id = '00000000-0000-0000-0000-0000000014b1'),
  '>', 0,
  'admin เห็น inv_v_monthly_cogs ของเดือนนี้ได้ (มี stock_out เกิดขึ้นจริง)'
);

select * from finish();
rollback;
