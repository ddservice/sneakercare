-- ทดสอบ fn_approve_adjustment: role check, ใช้ซ้ำไม่ได้ (idempotency), และ upsert เมื่อยังไม่มี item_stock
-- (แก้ใน 0006/0007) จำลอง auth.uid() ด้วยการตั้งค่า request.jwt.claims — ฟังก์ชันนี้เป็น SECURITY DEFINER
-- จึงไม่ต้อง `set local role authenticated` ก็ทดสอบ role check ข้างในได้ตรงๆ
-- รันด้วย: supabase test db (ต้องมี Docker Desktop เปิดอยู่)

begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-0000000001a1', 'appr.admin@local.test', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000001a2', 'appr.coadmin@local.test', 'x', now(), 'authenticated', 'authenticated');

insert into branches (id, name) values ('00000000-0000-0000-0000-0000000001b1', 'Test Branch Approve');

insert into profiles (id, username, display_name, role, branch_id)
values
  ('00000000-0000-0000-0000-0000000001a1', 'appr_admin', 'Approve Admin', 'admin', null),
  ('00000000-0000-0000-0000-0000000001a2', 'appr_coadmin', 'Approve CoAdmin', 'co_admin', '00000000-0000-0000-0000-0000000001b1');

insert into items (id, sku, name, item_type, category, base_unit, purchase_unit, purchase_unit_qty)
values ('00000000-0000-0000-0000-0000000001c1', 'ADJ-TEST-1', 'Test Item For Adjustment', 'consumable', 'test', 'ml', 'bottle', 500);

-- ตั้ง baseline stock ด้วย stock_in ที่อนุมัติแล้วก่อน (qty 100 @ ต้นทุน 50)
insert into stock_transactions (item_id, branch_id, txn_type, status, quantity_delta, unit_cost_snapshot, performed_by)
values ('00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-0000000001b1', 'stock_in', 'approved', 100, 50, '00000000-0000-0000-0000-0000000001a1');

-- co_admin ยื่นปรับลด 10 หน่วยแบบรออนุมัติ
insert into stock_transactions (id, item_id, branch_id, txn_type, status, quantity_delta, reason, performed_by)
values (
  '00000000-0000-0000-0000-0000000001d1',
  '00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-0000000001b1',
  'adjustment_decrease', 'pending_approval', -10, 'ตรวจนับพบของขาด',
  '00000000-0000-0000-0000-0000000001a2'
);

-- co_admin (ไม่ใช่ admin) พยายามอนุมัติเอง -> ต้อง reject
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000001a2')::text, true);
select throws_ok(
  $$ select fn_approve_adjustment('00000000-0000-0000-0000-0000000001d1', true) $$,
  'เฉพาะ Admin เท่านั้นที่อนุมัติการปรับปรุงสต๊อกได้',
  'co_admin ห้ามอนุมัติรายการปรับปรุงสต๊อกของตัวเอง'
);

-- admin อนุมัติ -> สำเร็จ และ current_qty ต้องลดลงจริง (100 - 10 = 90)
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000001a1')::text, true);
select lives_ok(
  $$ select fn_approve_adjustment('00000000-0000-0000-0000-0000000001d1', true) $$,
  'admin อนุมัติรายการปรับปรุงสต๊อกสำเร็จ'
);
select is(
  (select current_qty from item_stock where item_id = '00000000-0000-0000-0000-0000000001c1'),
  90::numeric,
  'current_qty ลดลงจริงหลัง admin อนุมัติ'
);

-- อนุมัติซ้ำรายการเดิม -> ต้อง reject (ป้องกันการนับซ้ำ ตามที่แก้ใน 0006)
select throws_ok(
  $$ select fn_approve_adjustment('00000000-0000-0000-0000-0000000001d1', true) $$,
  'ไม่พบรายการที่รออนุมัติ',
  'อนุมัติรายการที่อนุมัติไปแล้วซ้ำอีกครั้งต้องถูกปฏิเสธ ไม่ใช่นับสต๊อกซ้ำ'
);

-- ปรับลดของ item อื่นที่ไม่เคยมี item_stock ที่สาขานี้มาก่อนเลย -> อนุมัติแล้วต้อง error ไม่ใช่ผ่านเงียบๆ (0007)
insert into items (id, sku, name, item_type, category, base_unit, purchase_unit, purchase_unit_qty)
values ('00000000-0000-0000-0000-0000000001c2', 'ADJ-TEST-2', 'Never Stocked Item', 'consumable', 'test', 'ml', 'bottle', 500);

insert into stock_transactions (id, item_id, branch_id, txn_type, status, quantity_delta, reason, performed_by)
values (
  '00000000-0000-0000-0000-0000000001d2',
  '00000000-0000-0000-0000-0000000001c2', '00000000-0000-0000-0000-0000000001b1',
  'adjustment_decrease', 'pending_approval', -5, 'ตรวจนับพบของขาด',
  '00000000-0000-0000-0000-0000000001a2'
);
select throws_ok(
  $$ select fn_approve_adjustment('00000000-0000-0000-0000-0000000001d2', true) $$,
  'ไม่มีสต๊อกของสินค้านี้ในสาขานี้ ไม่สามารถอนุมัติปรับลดได้',
  'อนุมัติปรับลดของ item ที่ไม่เคยมี item_stock ที่สาขานี้ต้อง error ไม่ใช่อนุมัติเงียบๆ โดยไม่มีผล'
);

select * from finish();
rollback;
