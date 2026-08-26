-- Regression test สำหรับเหตุการณ์ 2026-08-26: alert_muted เคยถูกรีเซ็ตกลับเป็น false โดยไม่ตั้งใจ
-- (ตอนนั้นเกิดจาก migration ที่ลบ+rebuild inv_item_stock ทั้งตาราง ไม่ใช่จาก trigger ปกติ — แต่เทสนี้ยืนยัน
-- ว่า trigger เองก็ไม่มีทาง reset ค่านี้เวลามี stock_in ซ้ำสำหรับ item เดิม ผ่าน ON CONFLICT DO UPDATE ที่ระบุ
-- คอลัมน์ชัดเจน ไม่ใช่ overwrite ทั้งแถว) ถ้าใครแก้ inv_fn_apply_stock_transaction ในอนาคตแล้วพลาดเปลี่ยนเป็น
-- upsert ทั้งแถว เทสนี้จะจับได้ทันที
-- รันด้วย: supabase test db (ต้องมี Docker Desktop เปิดอยู่)

begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values ('00000000-0000-0000-0000-0000000011a1', 'muted.test@local.test', 'x', now(), 'authenticated', 'authenticated');

insert into sc_users (user_id, username, role)
values ('00000000-0000-0000-0000-0000000011a1', 'muted_admin', 'admin');

insert into inv_branches (id, name) values ('00000000-0000-0000-0000-0000000011b1', 'Test Branch Mute');

insert into inv_items (id, sku, name, item_type, category, base_unit, purchase_unit, purchase_unit_qty)
values ('00000000-0000-0000-0000-0000000011c1', 'MUTE-TEST-1', 'Test Item Mute', 'consumable', 'test', 'ml', 'bottle', 500);

-- stock_in ครั้งแรก สร้างแถว inv_item_stock ขึ้นมา
insert into inv_stock_transactions (item_id, branch_id, txn_type, status, quantity_delta, unit_cost_snapshot, performed_by)
values ('00000000-0000-0000-0000-0000000011c1', '00000000-0000-0000-0000-0000000011b1', 'stock_in', 'approved', 10, 50, '00000000-0000-0000-0000-0000000011a1');

-- ปิดแจ้งเตือนสินค้านี้ผ่าน RPC ปกติ (จำลอง admin กดปุ่ม "ไม่ต้องแจ้งเตือน")
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000011a1')::text, true);
select inv_fn_set_alert_muted('00000000-0000-0000-0000-0000000011c1', '00000000-0000-0000-0000-0000000011b1', true);

select ok(
  (select alert_muted from inv_item_stock where item_id = '00000000-0000-0000-0000-0000000011c1'),
  'alert_muted ถูกตั้งเป็น true หลังเรียก inv_fn_set_alert_muted'
);

-- stock_in ครั้งที่สองของ item เดิม (ON CONFLICT DO UPDATE path) ต้องไม่แตะ alert_muted เลย
insert into inv_stock_transactions (item_id, branch_id, txn_type, status, quantity_delta, unit_cost_snapshot, performed_by)
values ('00000000-0000-0000-0000-0000000011c1', '00000000-0000-0000-0000-0000000011b1', 'stock_in', 'approved', 5, 60, '00000000-0000-0000-0000-0000000011a1');

select ok(
  (select alert_muted from inv_item_stock where item_id = '00000000-0000-0000-0000-0000000011c1'),
  'alert_muted ยังคง true หลัง stock_in รอบถัดไปของ item เดิม (ต้องไม่ถูก trigger overwrite)'
);

select * from finish();
rollback;
