-- ทดสอบว่า Staff เห็นยอดคงเหลือได้ (v_item_stock) แต่เห็นข้อมูลต้นทุน/COGS เป็น 0 แถวเสมอ
-- (CLAUDE.md กฎข้อ 5, 0003_staff_safe_views.sql) — view เหล่านี้กรองด้วย fn_current_role() ในตัว SQL เอง
-- ไม่ใช่ผ่าน RLS ปกติ เลยทดสอบได้ตรงๆ ด้วยการตั้ง request.jwt.claims โดยไม่ต้อง set local role
-- รันด้วย: supabase test db (ต้องมี Docker Desktop เปิดอยู่)

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('00000000-0000-0000-0000-0000000002a1', 'view.admin@local.test', 'x', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000002a2', 'view.staff@local.test', 'x', now(), 'authenticated', 'authenticated');

insert into branches (id, name) values ('00000000-0000-0000-0000-0000000002b1', 'Test Branch Views');

insert into profiles (id, username, display_name, role, branch_id)
values
  ('00000000-0000-0000-0000-0000000002a1', 'view_admin', 'View Admin', 'admin', null),
  ('00000000-0000-0000-0000-0000000002a2', 'view_staff', 'View Staff', 'staff', '00000000-0000-0000-0000-0000000002b1');

insert into items (id, sku, name, item_type, category, base_unit, purchase_unit, purchase_unit_qty)
values ('00000000-0000-0000-0000-0000000002c1', 'VIEW-TEST-1', 'Test Item For Views', 'consumable', 'test', 'ml', 'bottle', 500);

insert into stock_transactions (item_id, branch_id, txn_type, status, quantity_delta, unit_cost_snapshot, performed_by)
values ('00000000-0000-0000-0000-0000000002c1', '00000000-0000-0000-0000-0000000002b1', 'stock_in', 'approved', 100, 50, '00000000-0000-0000-0000-0000000002a1');

-- stock_out ให้มีข้อมูลใน v_monthly_cogs ของเดือนนี้ให้ admin เห็น (เทียบกับ staff ที่ต้องเห็น 0 แถว)
insert into stock_transactions (item_id, branch_id, txn_type, status, quantity_delta, performed_by)
values ('00000000-0000-0000-0000-0000000002c1', '00000000-0000-0000-0000-0000000002b1', 'stock_out', 'approved', -20, '00000000-0000-0000-0000-0000000002a1');

-- มุมมองฝั่ง staff
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000002a2')::text, true);

select cmp_ok(
  (select count(*)::int from v_item_stock where item_id = '00000000-0000-0000-0000-0000000002c1'),
  '=', 1,
  'staff เห็นยอดคงเหลือ (ไม่มีต้นทุน) ของสาขาตัวเองได้ปกติ'
);
select is(
  (select count(*)::int from v_item_stock_cost where item_id = '00000000-0000-0000-0000-0000000002c1'),
  0,
  'staff ต้องได้ 0 แถวจาก v_item_stock_cost แม้เดาชื่อ view ถูก'
);
select is(
  (select count(*)::int from v_inventory_value),
  0,
  'staff ต้องได้ 0 แถวจาก v_inventory_value'
);
select is(
  (select count(*)::int from v_monthly_cogs),
  0,
  'staff ต้องได้ 0 แถวจาก v_monthly_cogs'
);

-- มุมมองฝั่ง admin: ต้องเห็นข้อมูลจริง เพื่อยืนยันว่า view ไม่ได้บล็อกทุกคน (ไม่ใช่แค่ staff ที่เห็น 0)
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000002a1')::text, true);

select cmp_ok(
  (select count(*)::int from v_item_stock_cost where item_id = '00000000-0000-0000-0000-0000000002c1'),
  '=', 1,
  'admin เห็น v_item_stock_cost ได้ปกติ'
);
select cmp_ok(
  (select count(*)::int from v_monthly_cogs where branch_id = '00000000-0000-0000-0000-0000000002b1'),
  '>', 0,
  'admin เห็น v_monthly_cogs ของเดือนนี้ได้ (มี stock_out เกิดขึ้นจริง)'
);

select * from finish();
rollback;
