-- ระบบ Supplier: เก็บรายชื่อร้าน/ผู้ขายเป็น master data แยกจากช่องข้อความอิสระเดิม เพื่อให้เลือกจาก
-- dropdown ซ้ำได้ ไม่ต้องพิมพ์ชื่อใหม่ทุกครั้ง (สะกดไม่ตรงกันจะทำให้เทียบราคาข้าม supplier ไม่ได้)

create table inv_suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  phone      text,
  note       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table inv_suppliers enable row level security;

create policy inv_p_suppliers_select on inv_suppliers for select using (
  inv_fn_current_role() in ('admin', 'co-admin')
);
create policy inv_p_suppliers_write on inv_suppliers for all using (
  inv_fn_current_role() in ('admin', 'co-admin')
) with check (
  inv_fn_current_role() in ('admin', 'co-admin')
);

create trigger inv_trg_audit_suppliers
after insert or update or delete on inv_suppliers
for each row execute function inv_fn_write_audit_log();

-- ผูก supplier เข้ากับแต่ละรายการซื้อเข้า (nullable — ไม่บังคับกรอก ของเก่าที่นำเข้าไปแล้วจะเป็น null)
alter table inv_stock_transactions add column supplier_id uuid references inv_suppliers(id);

-- เปิดให้ Co-Admin เห็นการ์ดจัดการ Supplier เหมือนที่เปิดให้เห็น inv_card_items ไว้แล้ว
insert into ui_permissions (role, feature_key, visible) values
  ('co-admin', 'inv_card_suppliers', true),
  ('manager',  'inv_card_suppliers', false)
on conflict (role, feature_key) do nothing;
