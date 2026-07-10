-- ════════════════════════════════════════════════════════════════════════
--  Inventory v2 — เพิ่มระบบบริหารคลังสินค้าใหม่เข้าไปในฐานข้อมูล SneakerCareDB (live production)
--
--  หลักการ: ADDITIVE ONLY — ไม่แตะ/ลบ/แก้ตาราง sc_* หรือ profiles เดิมเด็ดขาด
--  ตารางใหม่ทั้งหมดใช้ prefix "inv_" เพื่อแยกจากระบบเดิมให้ชัดเจน
--  ใช้ sc_users เป็นแหล่งข้อมูล identity/role (ไม่สร้างตาราง profiles ซ้ำ เพราะมี profiles เดิม
--  ที่ไม่ได้ใช้งานอยู่แล้ว และแอปปัจจุบันอ้างอิง sc_users จริงๆ)
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── ENUM TYPES (ใหม่ทั้งหมด ไม่ชนของเดิมเพราะของเดิมใช้ text ธรรมดา) ──────
create type inv_item_type as enum ('inventory', 'consumable');
create type inv_txn_type as enum (
  'stock_in', 'stock_out', 'adjustment_increase', 'adjustment_decrease', 'waste'
);
create type inv_txn_status as enum ('approved', 'pending_approval', 'rejected');
create type inv_audit_action as enum ('INSERT', 'UPDATE', 'DELETE');

-- ── ต่อ sc_users ด้วย branch_id (เผื่อขยายหลายสาขาในอนาคต) — nullable ไม่กระทบแถวเดิม ──
alter table sc_users add column if not exists branch_id uuid;

-- ── BRANCHES ──────────────────────────────────────────────────────────
create table inv_branches (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  address            text,
  phone              text,
  telegram_chat_id   text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

alter table sc_users add constraint sc_users_branch_id_fkey
  foreign key (branch_id) references inv_branches(id);

-- ── ITEMS (แคตตาล็อกกลาง) ─────────────────────────────────────────────
create table inv_items (
  id                       uuid primary key default gen_random_uuid(),
  sku                      text unique,
  name                     text not null,
  item_type                inv_item_type not null,
  category                 text not null,
  base_unit                text not null,
  purchase_unit            text not null,
  purchase_unit_qty        numeric(12,3) not null default 1,
  default_min_stock_level  numeric(14,3) not null default 0,
  is_active                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint inv_chk_purchase_unit_qty_positive check (purchase_unit_qty > 0)
);

create index inv_idx_items_type on inv_items(item_type);
create index inv_idx_items_active on inv_items(is_active);

-- ── ITEM_STOCK (ยอดคงเหลือ/ต้นทุนถัวเฉลี่ย/จุดสั่งซื้อขั้นต่ำ ต่อสาขา) ────
create table inv_item_stock (
  id                uuid primary key default gen_random_uuid(),
  item_id           uuid not null references inv_items(id),
  branch_id         uuid not null references inv_branches(id),
  current_qty       numeric(14,3) not null default 0,
  avg_unit_cost     numeric(14,4) not null default 0,
  min_stock_level   numeric(14,3) not null default 0,
  updated_at        timestamptz not null default now(),

  unique (item_id, branch_id)
);

create index inv_idx_item_stock_branch on inv_item_stock(branch_id);

-- ── STOCK_TRANSACTIONS (Ledger แบบ append-only) ──────────────────────
create table inv_stock_transactions (
  id                    uuid primary key default gen_random_uuid(),
  item_id               uuid not null references inv_items(id),
  branch_id             uuid not null references inv_branches(id),
  txn_type              inv_txn_type not null,
  status                inv_txn_status not null default 'approved',

  quantity_delta        numeric(14,3) not null,
  unit_cost_snapshot    numeric(14,4) not null default 0,
  total_cost            numeric(14,2) generated always as (abs(quantity_delta) * unit_cost_snapshot) stored,

  reference_type        text,
  reference_note        text,
  corrects_txn_id       uuid references inv_stock_transactions(id),

  reason                text,
  performed_by          uuid not null references sc_users(user_id),
  approved_by           uuid references sc_users(user_id),

  created_at            timestamptz not null default now(),

  constraint inv_chk_reason_required check (
    txn_type not in ('adjustment_increase','adjustment_decrease','waste') or (reason is not null and length(trim(reason)) > 0)
  ),
  constraint inv_chk_delta_sign check (
    (txn_type in ('stock_in','adjustment_increase') and quantity_delta > 0) or
    (txn_type in ('stock_out','adjustment_decrease','waste') and quantity_delta < 0)
  )
);

create index inv_idx_stock_txn_item_branch on inv_stock_transactions(item_id, branch_id, created_at desc);
create index inv_idx_stock_txn_status on inv_stock_transactions(status);

revoke update, delete on inv_stock_transactions from authenticated;

-- ── AUDIT_LOGS (Read-only เด็ดขาด แม้แต่ Admin) ──────────────────────
create table inv_audit_logs (
  id             bigint generated always as identity primary key,
  table_name     text not null,
  record_id      text not null,
  action         inv_audit_action not null,
  performed_by   uuid references sc_users(user_id),
  performed_at   timestamptz not null default now(),
  before_data    jsonb,
  after_data     jsonb,
  reason         text
);

create index inv_idx_audit_logs_table_record on inv_audit_logs(table_name, record_id);

revoke update, delete, insert on inv_audit_logs from authenticated;

-- ── NOTIFICATION LOG ──────────────────────────────────────────────────
create table inv_notification_log (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references inv_items(id),
  branch_id    uuid not null references inv_branches(id),
  channel      text not null,
  message      text not null,
  sent_at      timestamptz not null default now()
);

-- ── INTEGRATION SECRETS (Telegram token แบบ write-only) ──────────────
create table inv_integration_secrets (
  key          text primary key,
  value        text not null,
  updated_by   uuid references sc_users(user_id),
  updated_at   timestamptz not null default now()
);

alter table inv_integration_secrets enable row level security;
revoke select, insert, update, delete on inv_integration_secrets from authenticated;

-- ════════════════════════════════════════════════════════════════════════
--  TRIGGER: อัปเดตยอดคงเหลือ + ต้นทุนถัวเฉลี่ยเคลื่อนที่
-- ════════════════════════════════════════════════════════════════════════
create or replace function inv_fn_apply_stock_transaction()
returns trigger as $$
declare
  v_old_qty  numeric(14,3);
  v_old_cost numeric(14,4);
  v_new_qty  numeric(14,3);
  v_new_cost numeric(14,4);
  v_default_min numeric(14,3);
begin
  if new.status <> 'approved' then
    return new;
  end if;

  select current_qty, avg_unit_cost into v_old_qty, v_old_cost
  from inv_item_stock where item_id = new.item_id and branch_id = new.branch_id for update;

  if not found then
    v_old_qty := 0;
    v_old_cost := 0;
    if new.txn_type != 'stock_in' then
      raise exception 'ไม่มีสต๊อกของสินค้านี้ในสาขานี้ ไม่สามารถเบิก/ปรับลด/ตัดของเสียได้';
    end if;
    select default_min_stock_level into v_default_min from inv_items where id = new.item_id;
  end if;

  if new.txn_type = 'stock_in' then
    v_new_qty := v_old_qty + new.quantity_delta;
    if v_new_qty > 0 then
      v_new_cost := ((v_old_qty * v_old_cost) + (new.quantity_delta * new.unit_cost_snapshot)) / v_new_qty;
    else
      v_new_cost := new.unit_cost_snapshot;
    end if;

    insert into inv_item_stock (item_id, branch_id, current_qty, avg_unit_cost, min_stock_level, updated_at)
    values (new.item_id, new.branch_id, v_new_qty, v_new_cost, coalesce(v_default_min, 0), now())
    on conflict (item_id, branch_id) do update
      set current_qty = v_new_qty, avg_unit_cost = v_new_cost, updated_at = now();
  else
    new.unit_cost_snapshot := v_old_cost;
    update inv_item_stock
      set current_qty = greatest(0, v_old_qty + new.quantity_delta), updated_at = now()
      where item_id = new.item_id and branch_id = new.branch_id;
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger inv_trg_apply_stock_transaction
before insert on inv_stock_transactions
for each row execute function inv_fn_apply_stock_transaction();

-- ════════════════════════════════════════════════════════════════════════
--  TRIGGER: Audit log อัตโนมัติ
-- ════════════════════════════════════════════════════════════════════════
create or replace function inv_fn_write_audit_log()
returns trigger as $$
declare
  v_actor uuid;
  v_before jsonb;
  v_after  jsonb;
  v_record_id text;
  v_reason text;
begin
  begin
    v_actor := auth.uid();
  exception when others then
    v_actor := null;
  end;

  v_before := case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  v_after  := case when TG_OP in ('UPDATE','INSERT') then to_jsonb(new) else null end;

  v_record_id := coalesce(
    (case when TG_OP = 'DELETE' then v_before else v_after end) ->> 'id',
    (case when TG_OP = 'DELETE' then v_before else v_after end) ->> 'key',
    ''
  );

  v_reason := case when TG_TABLE_NAME = 'inv_stock_transactions' then v_after ->> 'reason' else null end;

  if TG_TABLE_NAME = 'inv_integration_secrets' then
    if v_before is not null then v_before := jsonb_set(v_before, '{value}', '"***masked***"'); end if;
    if v_after  is not null then v_after  := jsonb_set(v_after,  '{value}', '"***masked***"'); end if;
  end if;

  insert into inv_audit_logs(table_name, record_id, action, performed_by, before_data, after_data, reason)
  values (
    TG_TABLE_NAME,
    v_record_id,
    TG_OP::inv_audit_action,
    coalesce(v_actor, ((case when TG_OP = 'DELETE' then v_before else v_after end) ->> 'performed_by')::uuid),
    v_before,
    v_after,
    v_reason
  );

  return coalesce(new, old);
end;
$$ language plpgsql security definer;

create trigger inv_trg_audit_items
after insert or update or delete on inv_items
for each row execute function inv_fn_write_audit_log();

create trigger inv_trg_audit_stock_transactions
after insert on inv_stock_transactions
for each row execute function inv_fn_write_audit_log();

create trigger inv_trg_audit_branches
after insert or update on inv_branches
for each row execute function inv_fn_write_audit_log();

create trigger inv_trg_audit_integration_secrets
after insert or update on inv_integration_secrets
for each row execute function inv_fn_write_audit_log();

-- ════════════════════════════════════════════════════════════════════════
--  VIEWS
-- ════════════════════════════════════════════════════════════════════════
create view inv_v_low_stock as
select
  s.branch_id, b.name as branch_name,
  i.id as item_id, i.name, i.item_type, i.category,
  s.current_qty, s.min_stock_level, i.base_unit
from inv_item_stock s
join inv_items i on i.id = s.item_id
join inv_branches b on b.id = s.branch_id
where i.is_active = true and s.current_qty <= s.min_stock_level;

create view inv_v_inventory_value as
select
  s.branch_id, b.name as branch_name,
  i.item_type,
  sum(s.current_qty * s.avg_unit_cost) as total_value
from inv_item_stock s
join inv_items i on i.id = s.item_id
join inv_branches b on b.id = s.branch_id
where i.is_active = true
group by s.branch_id, b.name, i.item_type;

create view inv_v_top_consumed_items_30d as
select branch_id, item_id, name, base_unit, total_qty_used, total_cost_used from (
  select
    st.branch_id, i.id as item_id, i.name, i.base_unit,
    sum(abs(st.quantity_delta)) as total_qty_used,
    sum(st.total_cost) as total_cost_used,
    row_number() over (partition by st.branch_id order by sum(abs(st.quantity_delta)) desc) as rn
  from inv_stock_transactions st
  join inv_items i on i.id = st.item_id
  where st.txn_type = 'stock_out'
    and st.status = 'approved'
    and st.created_at >= now() - interval '30 days'
  group by st.branch_id, i.id, i.name, i.base_unit
) ranked
where rn <= 3;

create view inv_v_monthly_cogs as
select
  branch_id,
  date_trunc('month', created_at) as month,
  sum(total_cost) as cogs
from inv_stock_transactions
where txn_type in ('stock_out','waste') and status = 'approved'
group by 1, 2
order by 2 desc;

-- ════════════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY — อ่าน role/branch จาก sc_users (ไม่ใช่ profiles)
-- ════════════════════════════════════════════════════════════════════════
alter table inv_branches enable row level security;
alter table inv_items enable row level security;
alter table inv_item_stock enable row level security;
alter table inv_stock_transactions enable row level security;
alter table inv_audit_logs enable row level security;

create or replace function inv_fn_current_role() returns text as $$
  select role from sc_users where user_id = auth.uid();
$$ language sql stable security definer;

create or replace function inv_fn_current_branch() returns uuid as $$
  select branch_id from sc_users where user_id = auth.uid();
$$ language sql stable security definer;

create policy inv_p_branches_select on inv_branches for select using (true);
create policy inv_p_branches_write on inv_branches for all using (inv_fn_current_role() = 'admin');

create policy inv_p_items_select on inv_items for select using (true);
create policy inv_p_items_write_admin_only on inv_items for all using (inv_fn_current_role() = 'admin');

create policy inv_p_item_stock_select on inv_item_stock for select using (
  inv_fn_current_role() = 'admin' or branch_id = inv_fn_current_branch()
);
revoke insert, update, delete on inv_item_stock from authenticated;

create policy inv_p_stock_txn_select on inv_stock_transactions for select using (
  inv_fn_current_role() = 'admin' or branch_id = inv_fn_current_branch()
);
create policy inv_p_stock_txn_insert_staff on inv_stock_transactions for insert with check (
  inv_fn_current_role() = 'staff' and txn_type = 'stock_out'
  and performed_by = auth.uid() and branch_id = inv_fn_current_branch()
);
create policy inv_p_stock_txn_insert_co_admin on inv_stock_transactions for insert with check (
  inv_fn_current_role() = 'co-admin' and txn_type in ('stock_in','stock_out','adjustment_increase','adjustment_decrease','waste')
  and performed_by = auth.uid() and branch_id = inv_fn_current_branch()
  and (txn_type::text not like 'adjustment%' or status = 'pending_approval')
);
create policy inv_p_stock_txn_insert_admin on inv_stock_transactions for insert with check (
  inv_fn_current_role() = 'admin' and performed_by = auth.uid()
);

create policy inv_p_audit_logs_select on inv_audit_logs for select using (
  inv_fn_current_role() in ('admin', 'co-admin')
);

-- ════════════════════════════════════════════════════════════════════════
--  RPC: อนุมัติ/ปฏิเสธการปรับปรุงสต๊อก
-- ════════════════════════════════════════════════════════════════════════
create or replace function inv_fn_approve_adjustment(p_txn_id uuid, p_approve boolean)
returns void as $$
declare
  v_txn inv_stock_transactions%rowtype;
begin
  if inv_fn_current_role() != 'admin' then
    raise exception 'เฉพาะ Admin เท่านั้นที่อนุมัติการปรับปรุงสต๊อกได้';
  end if;

  select * into v_txn from inv_stock_transactions where id = p_txn_id and status = 'pending_approval';
  if not found then
    raise exception 'ไม่พบรายการที่รออนุมัติ';
  end if;

  if p_approve then
    update inv_stock_transactions set status = 'approved', approved_by = auth.uid() where id = p_txn_id;
    if v_txn.txn_type = 'adjustment_increase' then
      update inv_item_stock set current_qty = current_qty + v_txn.quantity_delta, updated_at = now()
        where item_id = v_txn.item_id and branch_id = v_txn.branch_id;
    else
      update inv_item_stock set current_qty = greatest(0, current_qty + v_txn.quantity_delta), updated_at = now()
        where item_id = v_txn.item_id and branch_id = v_txn.branch_id;
    end if;
  else
    update inv_stock_transactions set status = 'rejected', approved_by = auth.uid() where id = p_txn_id;
  end if;
end;
$$ language plpgsql security definer;

-- ════════════════════════════════════════════════════════════════════════
--  RPC: ตั้ง/แก้จุดสั่งซื้อขั้นต่ำต่อสาขา
-- ════════════════════════════════════════════════════════════════════════
create or replace function inv_fn_set_min_stock_level(p_item_id uuid, p_branch_id uuid, p_new_min numeric)
returns void as $$
begin
  if not (inv_fn_current_role() = 'admin' or (inv_fn_current_role() = 'co-admin' and p_branch_id = inv_fn_current_branch())) then
    raise exception 'ไม่มีสิทธิ์แก้ไขจุดสั่งซื้อขั้นต่ำของสาขานี้';
  end if;
  if p_new_min < 0 then
    raise exception 'จุดสั่งซื้อขั้นต่ำต้องไม่ติดลบ';
  end if;

  update inv_item_stock set min_stock_level = p_new_min, updated_at = now()
    where item_id = p_item_id and branch_id = p_branch_id;

  if not found then
    insert into inv_item_stock (item_id, branch_id, min_stock_level)
    values (p_item_id, p_branch_id, p_new_min);
  end if;
end;
$$ language plpgsql security definer;

-- ════════════════════════════════════════════════════════════════════════
--  RPC: Telegram token (write-only secret pattern)
-- ════════════════════════════════════════════════════════════════════════
create or replace function inv_fn_set_integration_secret(p_key text, p_value text)
returns void as $$
begin
  if inv_fn_current_role() != 'admin' then
    raise exception 'เฉพาะ Admin เท่านั้นที่ตั้งค่า integration secret ได้';
  end if;
  if p_value is null or length(trim(p_value)) = 0 then
    raise exception 'ค่า secret ห้ามว่าง';
  end if;

  insert into inv_integration_secrets(key, value, updated_by, updated_at)
  values (p_key, p_value, auth.uid(), now())
  on conflict (key) do update set value = p_value, updated_by = auth.uid(), updated_at = now();
end;
$$ language plpgsql security definer;

create or replace function inv_fn_integration_secret_status(p_key text)
returns table (is_set boolean, value_suffix text, updated_at timestamptz) as $$
begin
  if inv_fn_current_role() != 'admin' then
    raise exception 'เฉพาะ Admin เท่านั้นที่ดูสถานะ integration secret ได้';
  end if;

  return query
  select true, right(s.value, 4), s.updated_at
  from inv_integration_secrets s where s.key = p_key
  union all
  select false, null::text, null::timestamptz
  where not exists (select 1 from inv_integration_secrets where key = p_key)
  limit 1;
end;
$$ language plpgsql security definer;

-- ════════════════════════════════════════════════════════════════════════
--  GRANTS
-- ════════════════════════════════════════════════════════════════════════
grant execute on function inv_fn_approve_adjustment(uuid, boolean) to authenticated;
grant execute on function inv_fn_set_min_stock_level(uuid, uuid, numeric) to authenticated;
grant execute on function inv_fn_set_integration_secret(text, text) to authenticated;
grant execute on function inv_fn_integration_secret_status(text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════
--  SEED: สาขาแรก + ผูก branch_id ให้ user เดิม + ย้ายสินค้าที่มีอยู่ 1 รายการ
-- ════════════════════════════════════════════════════════════════════════
do $$
declare
  v_branch_id uuid;
  v_item_id uuid;
  v_admin_id uuid;
begin
  insert into inv_branches (name) values ('SneakerCare') returning id into v_branch_id;

  update sc_users set branch_id = v_branch_id where role != 'admin';

  select user_id into v_admin_id from sc_users where role = 'admin' limit 1;

  -- ย้ายสินค้าเดิม 1 รายการจาก sc_stock_status มาเข้าระบบใหม่ (ไม่ลบ/แก้ของเดิม แค่ copy ค่า)
  insert into inv_items (name, item_type, category, base_unit, purchase_unit, purchase_unit_qty, default_min_stock_level)
  select item_name, 'consumable', coalesce(nullif(category, ''), 'อื่นๆ'), coalesce(nullif(unit, ''), 'ชิ้น'),
         coalesce(nullif(unit, ''), 'ชิ้น'), 1, coalesce(min_alert, 10)
  from sc_stock_status
  limit 1
  returning id into v_item_id;

  if v_item_id is not null then
    insert into inv_stock_transactions (item_id, branch_id, txn_type, quantity_delta, unit_cost_snapshot, reference_type, reference_note, performed_by)
    select v_item_id, v_branch_id, 'stock_in', quantity, last_price, 'manual', 'ยอดยกมาจากระบบเดิม (sc_stock_status)', v_admin_id
    from sc_stock_status limit 1;
  end if;
end $$;
