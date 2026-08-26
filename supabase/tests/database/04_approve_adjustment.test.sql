-- ทดสอบ inv_fn_approve_adjustment (post-0033): role check, branch scoping ของ co-admin, กันอนุมัติซ้ำ,
-- และ upsert/guard เมื่อยังไม่มี inv_item_stock มาก่อน — ยืนยันพฤติกรรมด้วย db query ตรงกับฐานข้อมูลจริง
-- แล้วก่อนเขียนไฟล์นี้ (2026-08-26)
-- รันด้วย: supabase test db (ต้องมี Docker Desktop เปิดอยู่)

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-0000000013a1', 'appr.admin@local.test', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000013a2', 'appr.coadmin.same@local.test', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000013a3', 'appr.coadmin.other@local.test', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000013a4', 'appr.manager@local.test', 'x', now(), 'authenticated', 'authenticated');

insert into inv_branches (id, name) values
  ('00000000-0000-0000-0000-0000000013b1', 'Test Branch Approve A'),
  ('00000000-0000-0000-0000-0000000013b2', 'Test Branch Approve B');

insert into sc_users (user_id, username, role, branch_id)
values
  ('00000000-0000-0000-0000-0000000013a1', 'appr_admin', 'admin', null),
  ('00000000-0000-0000-0000-0000000013a2', 'appr_coadmin_same', 'co-admin', '00000000-0000-0000-0000-0000000013b1'),
  ('00000000-0000-0000-0000-0000000013a3', 'appr_coadmin_other', 'co-admin', '00000000-0000-0000-0000-0000000013b2'),
  ('00000000-0000-0000-0000-0000000013a4', 'appr_manager', 'manager', '00000000-0000-0000-0000-0000000013b1');

insert into inv_items (id, sku, name, item_type, category, base_unit, purchase_unit, purchase_unit_qty)
values ('00000000-0000-0000-0000-0000000013c1', 'ADJ-TEST-1', 'Test Item For Adjustment', 'consumable', 'test', 'ml', 'bottle', 500);

insert into inv_stock_transactions (item_id, branch_id, txn_type, status, quantity_delta, unit_cost_snapshot, performed_by)
values ('00000000-0000-0000-0000-0000000013c1', '00000000-0000-0000-0000-0000000013b1', 'stock_in', 'approved', 100, 50, '00000000-0000-0000-0000-0000000013a1');

insert into inv_stock_transactions (id, item_id, branch_id, txn_type, status, quantity_delta, reason, performed_by)
values (
  '00000000-0000-0000-0000-0000000013d1',
  '00000000-0000-0000-0000-0000000013c1', '00000000-0000-0000-0000-0000000013b1',
  'adjustment_decrease', 'pending_approval', -10, 'ตรวจนับพบของขาด',
  '00000000-0000-0000-0000-0000000013a4'
);

-- manager ห้ามอนุมัติเลย
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000013a4')::text, true);
select throws_ok(
  $$ select inv_fn_approve_adjustment('00000000-0000-0000-0000-0000000013d1', true) $$,
  'เฉพาะ Admin และ Co-Admin เท่านั้นที่อนุมัติการปรับปรุงสต๊อกได้',
  'manager ห้ามอนุมัติการปรับปรุงสต๊อก'
);

-- co-admin สาขาอื่น ห้ามอนุมัติรายการของสาขา B1
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000013a3')::text, true);
select throws_ok(
  $$ select inv_fn_approve_adjustment('00000000-0000-0000-0000-0000000013d1', true) $$,
  'ไม่มีสิทธิ์อนุมัติรายการของสาขาอื่น',
  'co-admin สาขาอื่นห้ามอนุมัติรายการข้ามสาขา'
);

-- co-admin สาขาเดียวกันอนุมัติได้ (co-admin เท่ากับ admin ตาม 0012)
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000013a2')::text, true);
select lives_ok(
  $$ select inv_fn_approve_adjustment('00000000-0000-0000-0000-0000000013d1', true) $$,
  'co-admin สาขาเดียวกันอนุมัติได้สำเร็จ'
);
select is(
  (select current_qty from inv_item_stock where item_id = '00000000-0000-0000-0000-0000000013c1'),
  90::numeric,
  'current_qty ลดลงจริงหลัง co-admin อนุมัติ'
);

-- อนุมัติซ้ำรายการเดิม -> ต้อง reject ไม่ใช่นับซ้ำ (กัน race condition ตาม 0033)
select throws_ok(
  $$ select inv_fn_approve_adjustment('00000000-0000-0000-0000-0000000013d1', true) $$,
  'ไม่พบรายการที่รออนุมัติ',
  'อนุมัติรายการที่อนุมัติไปแล้วซ้ำอีกครั้งต้องถูกปฏิเสธ ไม่ใช่นับสต๊อกซ้ำ'
);

-- ปรับลดของ item ที่ไม่เคยมี inv_item_stock ที่สาขานี้มาก่อนเลย -> ต้อง error ไม่ใช่ผ่านเงียบๆ (ตาม 0033)
insert into inv_items (id, sku, name, item_type, category, base_unit, purchase_unit, purchase_unit_qty)
values ('00000000-0000-0000-0000-0000000013c2', 'ADJ-TEST-2', 'Never Stocked Item', 'consumable', 'test', 'ml', 'bottle', 500);

insert into inv_stock_transactions (id, item_id, branch_id, txn_type, status, quantity_delta, reason, performed_by)
values (
  '00000000-0000-0000-0000-0000000013d2',
  '00000000-0000-0000-0000-0000000013c2', '00000000-0000-0000-0000-0000000013b1',
  'adjustment_decrease', 'pending_approval', -5, 'ตรวจนับพบของขาด',
  '00000000-0000-0000-0000-0000000013a2'
);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000013a1')::text, true);
select throws_ok(
  $$ select inv_fn_approve_adjustment('00000000-0000-0000-0000-0000000013d2', true) $$,
  'ไม่มีสต๊อกของสินค้านี้ในสาขานี้ ไม่สามารถอนุมัติปรับลดได้',
  'อนุมัติปรับลดของ item ที่ไม่เคยมี inv_item_stock ที่สาขานี้ต้อง error ไม่ใช่อนุมัติเงียบๆ โดยไม่มีผล'
);

select * from finish();
rollback;
