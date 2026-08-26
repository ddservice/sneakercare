-- ทดสอบ inv_p_item_stock_select (0032, 2026-08-26) — manager/staff ต้องเห็น current_qty/min_stock_level
-- ผ่าน inv_v_item_stock ได้ปกติ แต่ห้ามเห็น avg_unit_cost ผ่าน inv_item_stock ตรงๆ เด็ดขาด
-- (ก่อนแก้ 0032 เคยรั่ว — RLS เดิมเช็คแค่สาขา ไม่เช็ค role เลย) admin/co-admin ต้องเห็นได้ครบทั้งสองทาง
-- รันด้วย: supabase test db (ต้องมี Docker Desktop เปิดอยู่)

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-0000000012a1', 'rls.admin@local.test', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000012a2', 'rls.coadmin@local.test', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000012a3', 'rls.manager@local.test', 'x', now(), 'authenticated', 'authenticated');

insert into inv_branches (id, name) values ('00000000-0000-0000-0000-0000000012b1', 'Test Branch RLS');

insert into sc_users (user_id, username, role, branch_id)
values
  ('00000000-0000-0000-0000-0000000012a1', 'rls_admin', 'admin', null),
  ('00000000-0000-0000-0000-0000000012a2', 'rls_coadmin', 'co-admin', '00000000-0000-0000-0000-0000000012b1'),
  ('00000000-0000-0000-0000-0000000012a3', 'rls_manager', 'manager', '00000000-0000-0000-0000-0000000012b1');

insert into inv_items (id, sku, name, item_type, category, base_unit, purchase_unit, purchase_unit_qty)
values ('00000000-0000-0000-0000-0000000012c1', 'RLS-TEST-1', 'Test Item RLS', 'consumable', 'test', 'ml', 'bottle', 500);

insert into inv_stock_transactions (item_id, branch_id, txn_type, status, quantity_delta, unit_cost_snapshot, performed_by)
values ('00000000-0000-0000-0000-0000000012c1', '00000000-0000-0000-0000-0000000012b1', 'stock_in', 'approved', 10, 77, '00000000-0000-0000-0000-0000000012a1');

-- manager: ห้ามเห็น avg_unit_cost ผ่าน inv_item_stock ตรงๆ แต่ต้องเห็น qty ผ่าน view ปลอดภัยได้ปกติ
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000012a3')::text, true);
select is(
  (select count(*)::int from inv_item_stock where item_id = '00000000-0000-0000-0000-0000000012c1'),
  0,
  'manager ต้องได้ 0 แถวจาก inv_item_stock ตรงๆ (ห้ามเห็นต้นทุน)'
);
select is(
  (select current_qty from inv_v_item_stock where item_id = '00000000-0000-0000-0000-0000000012c1'),
  10::numeric,
  'manager เห็น current_qty ผ่าน inv_v_item_stock ได้ปกติ (ไม่ใช่ข้อมูลอ่อนไหว)'
);

-- co-admin: เห็นได้ทั้งคู่ เฉพาะสาขาตัวเอง
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000012a2')::text, true);
select is(
  (select avg_unit_cost from inv_item_stock where item_id = '00000000-0000-0000-0000-0000000012c1'),
  77::numeric,
  'co-admin เห็น avg_unit_cost ของสาขาตัวเองผ่าน inv_item_stock ได้ปกติ'
);
select is(
  (select current_qty from inv_v_item_stock where item_id = '00000000-0000-0000-0000-0000000012c1'),
  10::numeric,
  'co-admin เห็น inv_v_item_stock ของสาขาตัวเองได้ปกติ'
);

-- admin: เห็นได้ทุกอย่างทุกสาขา
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000012a1')::text, true);
select is(
  (select avg_unit_cost from inv_item_stock where item_id = '00000000-0000-0000-0000-0000000012c1'),
  77::numeric,
  'admin เห็น avg_unit_cost ได้ทุกสาขา'
);
select is(
  (select current_qty from inv_v_item_stock where item_id = '00000000-0000-0000-0000-0000000012c1'),
  10::numeric,
  'admin เห็น inv_v_item_stock ได้ทุกสาขา'
);

select * from finish();
rollback;
