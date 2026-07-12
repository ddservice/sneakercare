-- ระบบสิทธิ์การมองเห็นเมนูแบบยืดหยุ่น — Admin ปรับได้เองผ่าน checkbox ในหน้าเว็บ แทนการ hardcode
-- ในโค้ดทุกครั้งที่ต้องการเปิด/ปิดเมนูให้ Co-Admin หรือ Manager
--
-- หมายเหตุสำคัญ: ตารางนี้ควบคุมแค่ "การมองเห็นเมนู/การ์ด" (UI visibility) เท่านั้น ไม่ได้แทนที่กฎ RLS
-- ที่ควบคุมว่าใครเขียน/ลบข้อมูลจริงได้บ้าง — ถ้าเปิดให้เห็นเมนูแต่ RLS ยังกันไว้ จะเห็นปุ่มแต่กดไม่ได้ผล
-- (กรณี inv_items ได้แก้ RLS ให้ตรงกับที่ขอเปิดให้ Co-Admin ไว้ในไฟล์นี้แล้ว)

create table ui_permissions (
  role         text not null,          -- 'co-admin' หรือ 'manager' เท่านั้น (admin เห็นทุกอย่างเสมอ ไม่ต้องตั้งค่า)
  feature_key  text not null,
  visible      boolean not null default true,
  updated_by   uuid references sc_users(user_id),
  updated_at   timestamptz not null default now(),
  primary key (role, feature_key),
  constraint chk_ui_permissions_role check (role in ('co-admin', 'manager'))
);

alter table ui_permissions enable row level security;

create policy ui_permissions_select on ui_permissions for select using (true);
create policy ui_permissions_write on ui_permissions for all using (
  sc_get_my_role() = 'admin'
) with check (
  sc_get_my_role() = 'admin'
);

-- Seed ค่าเริ่มต้นให้ตรงกับพฤติกรรมเดิมที่ hardcode ไว้ในโค้ด (ไม่ให้อะไรเปลี่ยนโดยไม่ตั้งใจ)
-- ยกเว้น inv_card_items ที่เปิดให้ Co-Admin เห็นตามที่ขอไว้รอบนี้
insert into ui_permissions (role, feature_key, visible) values
  -- Co-Admin: ค่าเดิมที่เคยเห็นอยู่แล้ว
  ('co-admin', 'card_user_mgmt',    false),
  ('co-admin', 'card_data_purge',   false),
  ('co-admin', 'card_data_import',  true),
  ('co-admin', 'tab_settings',      true),
  ('co-admin', 'inv_card_items',    true),   -- เปิดให้ตามที่ขอ (เดิม false)
  ('co-admin', 'inv_card_stock_in', true),
  ('co-admin', 'inv_card_adjustment', true),
  ('co-admin', 'inv_card_pending',  false),
  ('co-admin', 'inv_card_audit',    true),
  ('co-admin', 'inv_card_settings', false),
  ('co-admin', 'inv_cost_col_head', true),
  -- Manager/Staff: ค่าเดิมที่เคยเห็นอยู่แล้ว (แทบไม่เห็นเมนูจัดการใดๆ)
  ('manager', 'card_user_mgmt',    false),
  ('manager', 'card_data_purge',   false),
  ('manager', 'card_data_import',  false),
  ('manager', 'tab_settings',      false),
  ('manager', 'inv_card_items',    false),
  ('manager', 'inv_card_stock_in', false),
  ('manager', 'inv_card_adjustment', false),
  ('manager', 'inv_card_pending',  false),
  ('manager', 'inv_card_audit',    false),
  ('manager', 'inv_card_settings', false),
  ('manager', 'inv_cost_col_head', false);

-- ให้ Co-Admin เขียน/แก้ไข/ลบ (ปิดใช้งาน) แคตตาล็อกสินค้ากลางได้ ให้ตรงกับที่เปิดเมนูให้เห็นข้างบน
-- (เดิมเฉพาะ Admin เท่านั้น เพราะแคตตาล็อกกลางกระทบทุกสาขา แต่ตอนนี้มีสาขาเดียว ความเสี่ยงต่ำ)
drop policy if exists inv_p_items_write_admin_only on inv_items;
create policy inv_p_items_write_admin_co_admin on inv_items for all using (
  inv_fn_current_role() in ('admin', 'co-admin')
) with check (
  inv_fn_current_role() in ('admin', 'co-admin')
);
