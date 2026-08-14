-- ════════════════════════════════════════════════════════════════════════
--  Shoe Care Inventory System — Database Schema (PostgreSQL / Supabase)
--
--  ออกแบบสำหรับร้านบริการทำความสะอาด/ซ่อมแซมรองเท้า
--  รองรับ: สินค้าคงคลัง+สิ้นเปลือง, ตัดสต๊อกตามปริมาณจริง, ต้นทุนถัวเฉลี่ย (COGS),
--          RBAC 3 ระดับ (admin / co_admin / staff), Audit Log ที่แก้ไข/ลบไม่ได้เด็ดขาด,
--          หลายสาขา (ปัจจุบันมี 1 สาขา แต่ออกแบบ schema รองรับหลายสาขาไว้ตั้งแต่ต้น)
--
--  หมายเหตุ: เขียนสำหรับ Supabase (ใช้ auth.users ของ Supabase Auth เป็นฐาน identity)
--  ถ้าใช้ Postgres ล้วน ให้แทน auth.users ด้วยตาราง users ของตัวเอง + ปรับ RLS เป็น
--  application-level authorization แทน
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── ENUM TYPES ─────────────────────────────────────────────────────────
create type user_role as enum ('admin', 'co_admin', 'staff');
create type item_type as enum ('inventory', 'consumable');
create type stock_txn_type as enum (
  'stock_in',              -- รับของเข้า (ซื้อเข้า)
  'stock_out',             -- เบิกใช้งานจริง (ตัดสต๊อกตามออเดอร์/กะ)
  'adjustment_increase',   -- ปรับเพิ่ม จากตรวจนับ (ต้องมีเหตุผล)
  'adjustment_decrease',   -- ปรับลด จากตรวจนับ (ต้องมีเหตุผล)
  'waste'                  -- ของเสีย/หมดอายุ/ทำหก
);
create type stock_txn_status as enum ('approved', 'pending_approval', 'rejected');
create type audit_action as enum ('INSERT', 'UPDATE', 'DELETE');

-- ── BRANCHES (รองรับหลายสาขา — ตอนนี้มี 1 แถว แต่โครงสร้างพร้อมขยาย) ──────
create table branches (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  address            text,
  phone              text,
  telegram_chat_id   text,             -- chat_id ของกลุ่มพนักงานสาขานี้ ใช้ส่งแจ้งเตือนสต๊อกต่ำ
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

-- ── PROFILES (ต่อยอดจาก auth.users ของ Supabase) ─────────────────────────
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  display_name  text not null,
  role          user_role not null default 'staff',
  -- สาขาที่สังกัด: admin ปล่อย null ได้ = เข้าถึงทุกสาขา, co_admin/staff ต้องผูกกับสาขาเดียวเสมอ
  branch_id     uuid references branches(id),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint chk_branch_required_for_non_admin check (role = 'admin' or branch_id is not null)
);

-- ── SUPPLIERS (ผู้จำหน่าย/ร้านที่ซื้อวัสดุ — เป็น master กลาง ใช้ร่วมได้ทุกสาขา) ─
create table suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  note        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── ITEMS (master catalog กลาง ใช้ร่วมกันทุกสาขา — ไม่เก็บยอดคงเหลือที่นี่) ──
-- แยก "นิยามสินค้า" ออกจาก "ยอดคงเหลือต่อสาขา" (ดูตาราง item_stock) เพราะสินค้าตัวเดียวกัน
-- มีสต๊อก/ต้นทุนถัวเฉลี่ย/จุดสั่งซื้อขั้นต่ำ แยกอิสระต่อสาขาได้ โดยไม่ต้อง duplicate นิยามสินค้า
create table items (
  id                       uuid primary key default gen_random_uuid(),
  sku                      text unique,
  name                     text not null,
  item_type                item_type not null,               -- inventory | consumable
  category                 text not null,                     -- เช่น 'น้ำยาทำความสะอาด', 'อุปกรณ์', 'บรรจุภัณฑ์'

  -- หน่วยนับ: เก็บสต๊อกจริงเป็น "หน่วยฐาน" (base unit) เพื่อรองรับการตัดสต๊อกละเอียด
  -- เช่น น้ำยา 1 ขวด = 1000 ml → base_unit = 'ml', purchase_unit = 'ขวด', purchase_unit_qty = 1000
  base_unit                text not null,                     -- 'ml', 'g', 'piece'
  purchase_unit            text not null,                     -- หน่วยที่ซื้อเข้า เช่น 'ขวด', 'แพ็ค', 'ชิ้น'
  purchase_unit_qty        numeric(12,3) not null default 1,  -- 1 purchase_unit = กี่ base_unit

  default_min_stock_level  numeric(14,3) not null default 0,  -- ค่าเริ่มต้นเวลาเปิดสาขาใหม่ (สาขาแก้ทีหลังได้ใน item_stock)

  supplier_id              uuid references suppliers(id),
  is_active                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint chk_purchase_unit_qty_positive check (purchase_unit_qty > 0)
);

create index idx_items_type on items(item_type);
create index idx_items_active on items(is_active);

-- ── ITEM_STOCK (ยอดคงเหลือ + ต้นทุนถัวเฉลี่ย + จุดสั่งซื้อขั้นต่ำ ต่อสาขา) ────
-- เป็นแคชที่มาจากผลรวมของ stock_transactions เท่านั้น อัปเดตผ่าน trigger/RPC ไม่ให้แอปเขียนตรง
create table item_stock (
  id                uuid primary key default gen_random_uuid(),
  item_id           uuid not null references items(id),
  branch_id         uuid not null references branches(id),
  current_qty       numeric(14,3) not null default 0,   -- หน่วยฐาน
  avg_unit_cost     numeric(14,4) not null default 0,    -- ต้นทุนถัวเฉลี่ยเคลื่อนที่ ต่อหน่วยฐาน
  min_stock_level   numeric(14,3) not null default 0,    -- จุดสั่งซื้อขั้นต่ำของสาขานี้ (หน่วยฐาน)
  updated_at        timestamptz not null default now(),

  unique (item_id, branch_id)
);

create index idx_item_stock_branch on item_stock(branch_id);

-- ── STOCK_TRANSACTIONS (Ledger แบบ append-only — ห้าม UPDATE/DELETE) ─────
create table stock_transactions (
  id                    uuid primary key default gen_random_uuid(),
  item_id               uuid not null references items(id),
  branch_id             uuid not null references branches(id),
  txn_type              stock_txn_type not null,
  status                stock_txn_status not null default 'approved',

  -- signed delta หน่วยฐาน: stock_in/adjustment_increase เป็น + , stock_out/adjustment_decrease/waste เป็น -
  quantity_delta        numeric(14,3) not null,
  unit_cost_snapshot    numeric(14,4) not null default 0,  -- ต้นทุนต่อหน่วยฐาน ณ เวลาทำรายการ
  total_cost            numeric(14,2) generated always as (abs(quantity_delta) * unit_cost_snapshot) stored,

  reference_type        text,          -- 'service_order' | 'shift' | 'purchase' | 'manual'
  reference_note        text,          -- เลขบิล/เลขออเดอร์/ชื่อกะ เป็นต้น
  corrects_txn_id        uuid references stock_transactions(id), -- ใช้เมื่อเป็นรายการแก้ไขของรายการเดิม (ไม่ใช่การ UPDATE)

  reason                text,          -- บังคับกรอกสำหรับ adjustment_* และ waste (เช็คด้วย constraint ด้านล่าง)
  performed_by          uuid not null references profiles(id),
  approved_by           uuid references profiles(id),  -- ผู้อนุมัติ (Admin) กรณี pending_approval

  created_at            timestamptz not null default now(),

  constraint chk_reason_required check (
    txn_type not in ('adjustment_increase','adjustment_decrease','waste') or (reason is not null and length(trim(reason)) > 0)
  ),
  constraint chk_delta_sign check (
    (txn_type in ('stock_in','adjustment_increase') and quantity_delta > 0) or
    (txn_type in ('stock_out','adjustment_decrease','waste') and quantity_delta < 0)
  )
);

create index idx_stock_txn_item_branch on stock_transactions(item_id, branch_id, created_at desc);
create index idx_stock_txn_status on stock_transactions(status);
create index idx_stock_txn_performed_by on stock_transactions(performed_by);

-- ห้ามแก้ไข/ลบ ledger เด็ดขาด — การแก้ไขทำได้ด้วยการสร้างรายการใหม่อ้างอิง corrects_txn_id เท่านั้น
revoke update, delete on stock_transactions from authenticated;

-- ── AUDIT_LOGS (Read-only เด็ดขาด แม้แต่ Admin) ──────────────────────────
create table audit_logs (
  id             bigint generated always as identity primary key,
  table_name     text not null,
  record_id      text not null,
  action         audit_action not null,
  performed_by   uuid references profiles(id),
  performed_at   timestamptz not null default now(),
  before_data    jsonb,
  after_data     jsonb,
  reason         text
);

create index idx_audit_logs_table_record on audit_logs(table_name, record_id);
create index idx_audit_logs_performed_by on audit_logs(performed_by);

-- ป้องกันเด็ดขาด: ไม่มี role ไหน (รวม admin) แก้ไขหรือลบแถวใน audit_logs ได้
-- การ INSERT ทำผ่าน trigger function (SECURITY DEFINER) เท่านั้น ไม่เปิด INSERT ตรงให้ authenticated
revoke update, delete, insert on audit_logs from authenticated;

-- ── NOTIFICATION LOG (กันแจ้งเตือนซ้ำ ต่อสาขา) ───────────────────────────
create table notification_log (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references items(id),
  branch_id    uuid not null references branches(id),
  channel      text not null,           -- 'telegram' | 'email' | 'dashboard'
  message      text not null,
  sent_at      timestamptz not null default now()
);

-- ── APP SETTINGS (ค่าตั้งค่ากลางที่ใช้ร่วมทุกสาขา เช่น ชื่อบริษัทแม่) ───────
create table app_settings (
  key          text primary key,
  value        text,
  updated_at   timestamptz not null default now()
);

-- ── INTEGRATION_SECRETS (token/API key ที่ Admin ตั้งค่าผ่านหน้าเว็บได้ แต่อ่านค่าจริงกลับไม่ได้เลย) ─
-- ใช้เก็บของอย่าง Telegram Bot Token: Admin กรอกผ่าน Settings UI ได้ (เขียนผ่าน RPC เท่านั้น)
-- แต่ไม่มี SELECT policy ให้ client ฝั่ง browser เห็นค่าจริงแม้แต่ admin เอง — ป้องกัน token หลุดผ่าน
-- devtools/extension ในเบราว์เซอร์ ค่าจริงอ่านได้เฉพาะ Edge Function ที่ใช้ service_role key (bypass RLS)
create table integration_secrets (
  key          text primary key,        -- เช่น 'telegram_bot_token'
  value        text not null,
  updated_by   uuid references profiles(id),
  updated_at   timestamptz not null default now()
);

alter table integration_secrets enable row level security;
-- ไม่สร้าง select policy เลย = ไม่มีใครใน authenticated อ่านตรงได้ ไม่ว่า role ไหน (รวม admin)
revoke select, insert, update, delete on integration_secrets from authenticated;
-- หมายเหตุ: trigger audit ของตารางนี้ (trg_audit_integration_secrets) สร้างทีหลังในไฟล์นี้ ในหมวด
-- "TRIGGER: Audit log อัตโนมัติ" เพราะต้องรอให้ fn_write_audit_log ถูกสร้างก่อน (CREATE TRIGGER ต้องการ
-- ให้ function มีอยู่จริงแล้ว ต่างจาก RPC ด้านล่างที่ reference fn_current_role() แบบ deferred ได้)
-- ⚠️ audit log เก็บ before/after_data เป็น to_jsonb(row) ซึ่งจะรวมคอลัมน์ value (token จริง) ไปด้วย —
-- ต้องแก้ fn_write_audit_log ให้ mask คอลัมน์ value เมื่อ TG_TABLE_NAME = 'integration_secrets' ก่อนขึ้น
-- production ไม่งั้น token จะไปโผล่ใน audit_logs.after_data แบบ plaintext (ดู TODO ในฟังก์ชันด้านล่าง)

-- RPC: Admin ตั้งค่า/แก้ไข secret (เขียนได้ทางเดียวนี้ทางเดียว)
create or replace function fn_set_integration_secret(p_key text, p_value text)
returns void as $$
begin
  if fn_current_role() != 'admin' then
    raise exception 'เฉพาะ Admin เท่านั้นที่ตั้งค่า integration secret ได้';
  end if;
  if p_value is null or length(trim(p_value)) = 0 then
    raise exception 'ค่า secret ห้ามว่าง';
  end if;

  insert into integration_secrets(key, value, updated_by, updated_at)
  values (p_key, p_value, auth.uid(), now())
  on conflict (key) do update set value = p_value, updated_by = auth.uid(), updated_at = now();
end;
$$ language plpgsql security definer;

-- RPC: เช็คสถานะแบบไม่เปิดเผยค่าจริง — ใช้แสดงในหน้า Settings ว่า "ตั้งค่าแล้ว" + ท้ายรหัส 4 ตัว
create or replace function fn_integration_secret_status(p_key text)
returns table (is_set boolean, value_suffix text, updated_at timestamptz) as $$
begin
  if fn_current_role() != 'admin' then
    raise exception 'เฉพาะ Admin เท่านั้นที่ดูสถานะ integration secret ได้';
  end if;

  return query
  select true, right(s.value, 4), s.updated_at
  from integration_secrets s where s.key = p_key
  union all
  select false, null::text, null::timestamptz
  where not exists (select 1 from integration_secrets where key = p_key)
  limit 1;
end;
$$ language plpgsql security definer;

-- ════════════════════════════════════════════════════════════════════════
--  TRIGGER: อัปเดตยอดคงเหลือ + ต้นทุนถัวเฉลี่ยเคลื่อนที่ (Moving Average Cost)
--  ทำงานบน item_stock โดย upsert ตาม (item_id, branch_id)
-- ════════════════════════════════════════════════════════════════════════
create or replace function fn_apply_stock_transaction()
returns trigger as $$
declare
  v_old_qty  numeric(14,3);
  v_old_cost numeric(14,4);
  v_new_qty  numeric(14,3);
  v_new_cost numeric(14,4);
  v_default_min numeric(14,3);
begin
  if new.status <> 'approved' then
    return new; -- pending_approval ยังไม่กระทบยอดคงเหลือ
  end if;

  select current_qty, avg_unit_cost into v_old_qty, v_old_cost
  from item_stock where item_id = new.item_id and branch_id = new.branch_id for update;

  if not found then
    v_old_qty := 0;
    v_old_cost := 0;
    if new.txn_type != 'stock_in' then
      raise exception 'ไม่มีสต๊อกของสินค้านี้ในสาขานี้ ไม่สามารถเบิก/ปรับลด/ตัดของเสียได้';
    end if;
    select default_min_stock_level into v_default_min from items where id = new.item_id;
  end if;

  if new.txn_type = 'stock_in' then
    -- ต้นทุนถัวเฉลี่ยเคลื่อนที่: (ของเดิม*ต้นทุนเดิม + ของเข้าใหม่*ต้นทุนใหม่) / รวมจำนวน
    v_new_qty := v_old_qty + new.quantity_delta;
    if v_new_qty > 0 then
      v_new_cost := ((v_old_qty * v_old_cost) + (new.quantity_delta * new.unit_cost_snapshot)) / v_new_qty;
    else
      v_new_cost := new.unit_cost_snapshot;
    end if;

    insert into item_stock (item_id, branch_id, current_qty, avg_unit_cost, min_stock_level, updated_at)
    values (new.item_id, new.branch_id, v_new_qty, v_new_cost, coalesce(v_default_min, 0), now())
    on conflict (item_id, branch_id) do update
      set current_qty = v_new_qty, avg_unit_cost = v_new_cost, updated_at = now();
  else
    -- stock_out / adjustment_decrease / waste: ใช้ avg_unit_cost ปัจจุบันเป็นต้นทุนที่ตัดออก (COGS)
    new.unit_cost_snapshot := v_old_cost;
    update item_stock
      set current_qty = greatest(0, v_old_qty + new.quantity_delta), updated_at = now()
      where item_id = new.item_id and branch_id = new.branch_id;
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger trg_apply_stock_transaction
before insert on stock_transactions
for each row execute function fn_apply_stock_transaction();

-- ════════════════════════════════════════════════════════════════════════
--  TRIGGER: Audit log อัตโนมัติ (items, item_stock, stock_transactions, profiles, app_settings, branches)
-- ════════════════════════════════════════════════════════════════════════
create or replace function fn_write_audit_log()
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

  -- ดึง record_id แบบ generic ผ่าน jsonb (->> คืน null เฉยๆ ถ้าไม่มีคีย์นั้น ไม่ error) เพราะแต่ละตาราง
  -- ใช้ชื่อคอลัมน์ PK ไม่เหมือนกัน (items/stock_transactions/branches/profiles ใช้ 'id',
  -- app_settings/integration_secrets ใช้ 'key') — ห้ามอ้าง new.id/old.id ตรงๆ เพราะจะ error ตอนรันบนตาราง
  -- ที่ไม่มีคอลัมน์ id
  v_record_id := coalesce(
    (case when TG_OP = 'DELETE' then v_before else v_after end) ->> 'id',
    (case when TG_OP = 'DELETE' then v_before else v_after end) ->> 'key',
    ''
  );

  v_reason := case when TG_TABLE_NAME = 'stock_transactions' then v_after ->> 'reason' else null end;

  -- ห้ามให้ token/secret จริงหลุดเข้า audit_logs แบบ plaintext แม้ audit_logs เองจะอ่านได้แค่ admin/co_admin
  if TG_TABLE_NAME = 'integration_secrets' then
    if v_before is not null then v_before := jsonb_set(v_before, '{value}', '"***masked***"'); end if;
    if v_after  is not null then v_after  := jsonb_set(v_after,  '{value}', '"***masked***"'); end if;
  end if;

  insert into audit_logs(table_name, record_id, action, performed_by, before_data, after_data, reason)
  values (
    TG_TABLE_NAME,
    v_record_id,
    TG_OP::audit_action,
    coalesce(v_actor, ((case when TG_OP = 'DELETE' then v_before else v_after end) ->> 'performed_by')::uuid),
    v_before,
    v_after,
    v_reason
  );

  return coalesce(new, old);
end;
$$ language plpgsql security definer;

create trigger trg_audit_items
after insert or update or delete on items
for each row execute function fn_write_audit_log();

create trigger trg_audit_stock_transactions
after insert on stock_transactions   -- insert-only table: ไม่มี update/delete event ให้ดักอยู่แล้ว
for each row execute function fn_write_audit_log();

create trigger trg_audit_profiles
after update on profiles             -- ดักการเปลี่ยน role/is_active/branch_id
for each row execute function fn_write_audit_log();

create trigger trg_audit_app_settings
after insert or update on app_settings
for each row execute function fn_write_audit_log();

create trigger trg_audit_branches
after insert or update on branches
for each row execute function fn_write_audit_log();

create trigger trg_audit_integration_secrets
after insert or update on integration_secrets
for each row execute function fn_write_audit_log();
-- ค่าใน audit log ของตารางนี้ถูก mask คอลัมน์ value ไว้แล้วใน fn_write_audit_log (ดูด้านบน)

-- หมายเหตุ: ไม่ผูก audit trigger กับ item_stock โดยตรง เพราะทุกการเปลี่ยนแปลงของ item_stock
-- สืบย้อนกลับไปหา stock_transactions ที่ audit ไว้แล้วเสมอ (item_stock เป็นแค่แคชที่คำนวณได้จาก ledger)

-- ════════════════════════════════════════════════════════════════════════
--  VIEWS สำหรับ Dashboard (ทุก view คืนค่า branch_id ด้วย ให้ frontend filter ตามสาขาที่ล็อกอิน)
-- ════════════════════════════════════════════════════════════════════════

-- สินค้าที่ต้องสั่งซื้อด่วน (ต่ำกว่าหรือเท่ากับจุดสั่งซื้อขั้นต่ำ) แยกตามสาขา
create view v_low_stock as
select
  s.branch_id, b.name as branch_name,
  i.id as item_id, i.name, i.item_type, i.category,
  s.current_qty, s.min_stock_level, i.base_unit
from item_stock s
join items i on i.id = s.item_id
join branches b on b.id = s.branch_id
where i.is_active = true and s.current_qty <= s.min_stock_level;

-- มูลค่าคลังสินค้าปัจจุบัน แยกตามสาขา + ชนิดสินค้า
create view v_inventory_value as
select
  s.branch_id, b.name as branch_name,
  i.item_type,
  sum(s.current_qty * s.avg_unit_cost) as total_value
from item_stock s
join items i on i.id = s.item_id
join branches b on b.id = s.branch_id
where i.is_active = true
group by s.branch_id, b.name, i.item_type;

-- เบิกใช้บ่อยที่สุด 3 อันดับต่อสาขา ใน 30 วันล่าสุด
create view v_top_consumed_items_30d as
select branch_id, item_id, name, base_unit, total_qty_used, total_cost_used from (
  select
    st.branch_id, i.id as item_id, i.name, i.base_unit,
    sum(abs(st.quantity_delta)) as total_qty_used,
    sum(st.total_cost) as total_cost_used,
    row_number() over (partition by st.branch_id order by sum(abs(st.quantity_delta)) desc) as rn
  from stock_transactions st
  join items i on i.id = st.item_id
  where st.txn_type = 'stock_out'
    and st.status = 'approved'
    and st.created_at >= now() - interval '30 days'
  group by st.branch_id, i.id, i.name, i.base_unit
) ranked
where rn <= 3;

-- COGS รายเดือน แยกตามสาขา (สำหรับสรุปค่าใช้จ่าย/ต้นทุนบริการ)
create view v_monthly_cogs as
select
  branch_id,
  date_trunc('month', created_at) as month,
  sum(total_cost) as cogs
from stock_transactions
where txn_type in ('stock_out','waste') and status = 'approved'
group by 1, 2
order by 2 desc;

-- ════════════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY (RBAC + สาขา บังคับที่ชั้นฐานข้อมูล ไม่ใช่แค่ชั้นแอป)
-- ════════════════════════════════════════════════════════════════════════
alter table branches enable row level security;
alter table profiles enable row level security;
alter table items enable row level security;
alter table item_stock enable row level security;
alter table stock_transactions enable row level security;
alter table audit_logs enable row level security;
alter table app_settings enable row level security;
alter table suppliers enable row level security;

create or replace function fn_current_role() returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

-- คืนสาขาที่ผู้ใช้สังกัด — admin จะได้ null ซึ่ง policy ด้านล่างตีความว่า "ทุกสาขา"
create or replace function fn_current_branch() returns uuid as $$
  select branch_id from profiles where id = auth.uid();
$$ language sql stable security definer;

-- branches: ทุกคนอ่านได้ (ต้องใช้เลือกสาขาตอน login/dropdown), เขียนได้เฉพาะ admin
create policy p_branches_select on branches for select using (true);
create policy p_branches_write on branches for all using (fn_current_role() = 'admin');

-- profiles: ทุกคนอ่านได้ (เพื่อแสดงชื่อผู้ทำรายการ), แก้ไข role/branch ได้เฉพาะ admin
create policy p_profiles_select on profiles for select using (true);
create policy p_profiles_update_self on profiles for update
  using (id = auth.uid() and fn_current_role() != 'admin' and role = (select role from profiles where id = auth.uid()));
create policy p_profiles_update_admin on profiles for update
  using (fn_current_role() = 'admin');

-- items: master catalog กลาง — staff/co_admin อ่านได้ทุกคน แก้ไข/เพิ่ม/ลบ (เพิ่มสินค้าใหม่เข้าระบบ) ให้ admin เท่านั้น
-- เพราะ catalog ใช้ร่วมกันทุกสาขา ปล่อยให้ co_admin สาขาใดสาขาหนึ่งแก้ได้จะกระทบสาขาอื่นด้วย
create policy p_items_select on items for select using (true);
create policy p_items_write_admin_only on items for all using (fn_current_role() = 'admin');

-- item_stock: อ่านได้เฉพาะสาขาตัวเอง (admin เห็นทุกสาขา) — การเขียนทำผ่าน trigger/RPC เท่านั้น ไม่เปิด
-- insert/update/delete ตรงให้ authenticated เลย (ดู fn_set_min_stock_level ด้านล่างสำหรับแก้จุดสั่งซื้อขั้นต่ำ)
create policy p_item_stock_select on item_stock for select using (
  fn_current_role() = 'admin' or branch_id = fn_current_branch()
);
revoke insert, update, delete on item_stock from authenticated;

-- stock_transactions: staff/co_admin ทำรายการได้เฉพาะสาขาตัวเอง, admin ทำได้ทุกสาขา
-- adjustment ที่ co_admin สร้างจะเข้า status='pending_approval' และต้องรอ admin approve ผ่าน fn_approve_adjustment()
create policy p_stock_txn_select on stock_transactions for select using (
  fn_current_role() = 'admin' or branch_id = fn_current_branch()
);
create policy p_stock_txn_insert_staff on stock_transactions for insert with check (
  fn_current_role() = 'staff' and txn_type = 'stock_out'
  and performed_by = auth.uid() and branch_id = fn_current_branch()
);
create policy p_stock_txn_insert_co_admin on stock_transactions for insert with check (
  fn_current_role() = 'co_admin' and txn_type in ('stock_in','stock_out','adjustment_increase','adjustment_decrease','waste')
  and performed_by = auth.uid() and branch_id = fn_current_branch()
  and (txn_type::text not like 'adjustment%' or status = 'pending_approval')
);
create policy p_stock_txn_insert_admin on stock_transactions for insert with check (
  fn_current_role() = 'admin' and performed_by = auth.uid()
);
-- อนุมัติ adjustment: admin เท่านั้น แก้ได้แค่ status/approved_by ผ่าน RPC เฉพาะ (ดู fn_approve_adjustment ด้านล่าง)

-- audit_logs: admin เห็นทุกสาขา, co_admin เห็นเฉพาะรายการของสาขาตัวเอง (กรองจาก before/after_data->>'branch_id'),
-- staff เข้าไม่ได้เลย, ไม่มี policy insert/update/delete ให้ authenticated
create policy p_audit_logs_select on audit_logs for select using (
  fn_current_role() = 'admin'
  or (fn_current_role() = 'co_admin' and (
        coalesce(after_data->>'branch_id', before_data->>'branch_id') = fn_current_branch()::text
        or table_name not in ('stock_transactions','item_stock') -- log ของตารางกลาง (เช่น profiles) ให้ co_admin เห็นได้
      ))
);

-- app_settings: ทุกคนอ่านได้ (กรอง secret ที่ชั้นแอปถ้ามี), เขียนได้เฉพาะ admin
create policy p_app_settings_select on app_settings for select using (true);
create policy p_app_settings_write on app_settings for all using (fn_current_role() = 'admin');

-- ════════════════════════════════════════════════════════════════════════
--  RPC: อนุมัติ/ปฏิเสธรายการปรับปรุงสต๊อก (แทนการ UPDATE ตรงบน ledger)
-- ════════════════════════════════════════════════════════════════════════
create or replace function fn_approve_adjustment(p_txn_id uuid, p_approve boolean)
returns void as $$
declare
  v_txn stock_transactions%rowtype;
begin
  if fn_current_role() != 'admin' then
    raise exception 'เฉพาะ Admin เท่านั้นที่อนุมัติการปรับปรุงสต๊อกได้';
  end if;

  select * into v_txn from stock_transactions where id = p_txn_id and status = 'pending_approval';
  if not found then
    raise exception 'ไม่พบรายการที่รออนุมัติ';
  end if;

  if p_approve then
    update stock_transactions set status = 'approved', approved_by = auth.uid() where id = p_txn_id;
    -- trigger fn_apply_stock_transaction ทำงานเฉพาะตอน INSERT ไม่ใช่ UPDATE
    -- จึงต้อง apply ผลกระทบยอดคงเหลือที่นี่แทน (เทียบเท่า logic เดิม) บน item_stock ของสาขานั้น
    if v_txn.txn_type = 'adjustment_increase' then
      update item_stock set current_qty = current_qty + v_txn.quantity_delta, updated_at = now()
        where item_id = v_txn.item_id and branch_id = v_txn.branch_id;
    else
      update item_stock set current_qty = greatest(0, current_qty + v_txn.quantity_delta), updated_at = now()
        where item_id = v_txn.item_id and branch_id = v_txn.branch_id;
    end if;
  else
    update stock_transactions set status = 'rejected', approved_by = auth.uid() where id = p_txn_id;
  end if;
end;
$$ language plpgsql security definer;

-- ════════════════════════════════════════════════════════════════════════
--  RPC: ตั้ง/แก้จุดสั่งซื้อขั้นต่ำต่อสาขา (แทนการ UPDATE ตรงบน item_stock)
-- ════════════════════════════════════════════════════════════════════════
create or replace function fn_set_min_stock_level(p_item_id uuid, p_branch_id uuid, p_new_min numeric)
returns void as $$
begin
  if not (fn_current_role() = 'admin' or (fn_current_role() = 'co_admin' and p_branch_id = fn_current_branch())) then
    raise exception 'ไม่มีสิทธิ์แก้ไขจุดสั่งซื้อขั้นต่ำของสาขานี้';
  end if;
  if p_new_min < 0 then
    raise exception 'จุดสั่งซื้อขั้นต่ำต้องไม่ติดลบ';
  end if;

  update item_stock set min_stock_level = p_new_min, updated_at = now()
    where item_id = p_item_id and branch_id = p_branch_id;

  if not found then
    insert into item_stock (item_id, branch_id, min_stock_level)
    values (p_item_id, p_branch_id, p_new_min);
  end if;
end;
$$ language plpgsql security definer;

-- ════════════════════════════════════════════════════════════════════════
--  GRANTS: อนุญาตให้ authenticated เรียก RPC เหล่านี้ได้ (ตั้งชัดเจน ไม่พึ่ง default PUBLIC grant)
--  ตัวฟังก์ชันเองมี role check ภายในอยู่แล้ว (fn_current_role() != 'admin' → raise exception)
--  การ GRANT EXECUTE แค่เปิดให้ "เรียกได้" เท่านั้น ไม่ได้แปลว่า "ผ่านสิทธิ์" เสมอไป
-- ════════════════════════════════════════════════════════════════════════
grant execute on function fn_approve_adjustment(uuid, boolean) to authenticated;
grant execute on function fn_set_min_stock_level(uuid, uuid, numeric) to authenticated;
grant execute on function fn_set_integration_secret(text, text) to authenticated;
grant execute on function fn_integration_secret_status(text) to authenticated;
