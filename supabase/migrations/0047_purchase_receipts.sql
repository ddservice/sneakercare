-- Purchase snapshots + stock movement in one transaction. No production backfill.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'inv_purchase_owner') then
    create role inv_purchase_owner nologin;
  end if;
end $$;
do $$ begin execute format('grant inv_purchase_owner to %I',current_user); end $$;
grant usage on schema public to inv_purchase_owner;
grant create on schema public to inv_purchase_owner;
create or replace function public.inv_fn_purchase_uid()
returns uuid language sql stable set search_path='' as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
revoke all on function public.inv_fn_purchase_uid() from public,anon,authenticated;
grant execute on function public.inv_fn_purchase_uid() to inv_purchase_owner;

create table if not exists public.inv_purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  branch_id uuid not null,
  item_id uuid not null,
  stock_transaction_id uuid not null unique,
  request_id uuid not null,
  payload jsonb not null,
  purchase_date date not null,
  supplier_name text not null check (length(btrim(supplier_name)) between 1 and 160),
  item_name text not null,
  base_unit text not null,
  purchase_unit text not null,
  pack_count numeric not null check (pack_count > 0),
  units_per_pack numeric not null check (units_per_pack > 0),
  base_quantity numeric not null check (base_quantity > 0),
  goods_amount numeric(14,2) not null check (goods_amount >= 0),
  shipping_amount numeric(14,2) not null check (shipping_amount >= 0),
  discount_amount numeric(14,2) not null check (discount_amount >= 0),
  paid_amount numeric(14,2) not null check (paid_amount >= 0),
  reference_note text not null default '',
  performed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, request_id),
  check (base_quantity = pack_count * units_per_pack),
  check (paid_amount = goods_amount + shipping_amount - discount_amount)
);
create index if not exists inv_purchase_receipts_branch_date_idx
  on public.inv_purchase_receipts(branch_id, purchase_date desc, id);
alter table public.inv_purchase_receipts enable row level security;
revoke all on public.inv_purchase_receipts from public, anon, authenticated;
alter table public.inv_purchase_receipts owner to inv_purchase_owner;

-- Production uses inv_* tables with unprefixed aliases; local migrations use tables.
do $$ declare n text; target text; begin
  foreach n in array array['branches','items','stock_transactions'] loop
    target := case when to_regclass('public.inv_' || n) is not null then 'inv_' || n else n end;
    execute format('grant select on public.%I to inv_purchase_owner', target);
    execute format('grant select on public.%I to inv_purchase_owner', n);
    execute format('drop policy if exists inv_purchase_owner_read on public.%I', target);
    execute format('create policy inv_purchase_owner_read on public.%I for select to inv_purchase_owner using (true)', target);
    if n <> 'branches' then
      execute format('grant insert on public.%I to inv_purchase_owner', target);
      execute format('grant insert on public.%I to inv_purchase_owner', n);
      execute format('drop policy if exists inv_purchase_owner_insert on public.%I', target);
      execute format('create policy inv_purchase_owner_insert on public.%I for insert to inv_purchase_owner with check (true)', target);
    end if;
  end loop;
  grant select on public.profiles to inv_purchase_owner;
  drop policy if exists inv_purchase_owner_read on public.profiles;
  create policy inv_purchase_owner_read on public.profiles for select to inv_purchase_owner using (true);
  if not exists (select 1 from pg_constraint where conname = 'inv_purchase_receipts_txn_fk') then
    target := case when to_regclass('public.inv_stock_transactions') is not null
      then 'inv_stock_transactions' else 'stock_transactions' end;
    execute format('alter table public.inv_purchase_receipts add constraint inv_purchase_receipts_txn_fk foreign key (stock_transaction_id) references public.%I(id)', target);
  end if;
end $$;

create or replace function public.inv_fn_purchase_actor(p_branch_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor public.profiles%rowtype; t uuid;
begin
  select * into actor from public.profiles where id = public.inv_fn_purchase_uid() and is_active;
  if not found or replace(actor.role::text, '-', '_') not in ('admin','co_admin','super_admin') then
    raise exception 'ไม่มีสิทธิ์ดูหรือบันทึกต้นทุนซื้อ' using errcode = '42501';
  end if;
  select tenant_id into t from public.branches where id = p_branch_id and is_active;
  if t is null or (replace(actor.role::text, '-', '_') <> 'super_admin' and t is distinct from actor.tenant_id)
     or (replace(actor.role::text, '-', '_') = 'co_admin' and p_branch_id is distinct from actor.branch_id) then
    raise exception 'ไม่มีสิทธิ์ทำรายการของสาขานี้' using errcode = '42501';
  end if;
  return t;
end $$;

create or replace function public.inv_fn_receive_purchase(p_branch_id uuid, p_request_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  t uuid; existing public.inv_purchase_receipts%rowtype; i public.items%rowtype;
  v_item_id uuid; txn_id uuid; receipt_id uuid;
  qty numeric; pack numeric; amount numeric; shipping numeric; discount numeric; paid numeric; base_qty numeric;
  supplier text; bought date; unit text; note text; min_stock numeric;
begin
  t := public.inv_fn_purchase_actor(p_branch_id);
  if p_request_id is null or p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'ข้อมูลการซื้อหรือคีย์กันซ้ำไม่ถูกต้อง' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_data) k where k not in (
    'item_id','new_item_name','new_item_category','new_item_unit','new_min_stock','supplier_name','purchase_date',
    'purchase_unit','purchase_qty','units_per_pack','goods_amount','shipping_amount','discount_amount','reference_note'
  )) then raise exception 'พบช่องข้อมูลที่ไม่รองรับ' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(t::text || p_request_id::text, 47));
  select * into existing from public.inv_purchase_receipts where tenant_id = t and request_id = p_request_id;
  if found then
    if existing.payload is distinct from p_data or existing.branch_id <> p_branch_id or existing.performed_by <> public.inv_fn_purchase_uid() then
      raise exception 'คีย์เดิมแต่ข้อมูลเปลี่ยน กรุณาเริ่มรายการใหม่' using errcode = '23514';
    end if;
    return existing.id;
  end if;
  supplier := btrim(p_data->>'supplier_name');
  unit := btrim(p_data->>'purchase_unit');
  note := coalesce(btrim(p_data->>'reference_note'), '');
  bought := (p_data->>'purchase_date')::date;
  qty := (p_data->>'purchase_qty')::numeric;
  pack := (p_data->>'units_per_pack')::numeric;
  amount := (p_data->>'goods_amount')::numeric;
  shipping := (p_data->>'shipping_amount')::numeric;
  discount := (p_data->>'discount_amount')::numeric;
  paid := amount + shipping - discount;
  base_qty := qty * pack;
  if supplier is null or length(supplier) not between 1 and 160 or unit is null or length(unit) not between 1 and 30
    or bought is null or bought > (now() at time zone 'Asia/Bangkok')::date
    or qty is null or pack is null or amount is null or shipping is null or discount is null
    or qty::text in ('NaN','Infinity','-Infinity') or pack::text in ('NaN','Infinity','-Infinity')
    or amount::text in ('NaN','Infinity','-Infinity') or shipping::text in ('NaN','Infinity','-Infinity')
    or discount::text in ('NaN','Infinity','-Infinity')
    or qty < 0.001 or pack < 0.001 or pack > 999999999 or qty <> round(qty,3) or pack <> round(pack,3) or base_qty > 999999999 or base_qty <> round(base_qty, 3)
    or amount < 0 or shipping < 0 or discount < 0 or paid < 0 or paid > 999999999
    or amount <> round(amount,2) or shipping <> round(shipping,2) or discount <> round(discount,2)
    or length(note) > 500 then
    raise exception 'กรุณาตรวจร้านค้า วันที่ จำนวน และยอดเงิน (ทศนิยมไม่เกิน 2 ตำแหน่ง)' using errcode = '22023';
  end if;
  if paid / base_qty > 9999999999 then raise exception 'ต้นทุนต่อหน่วยสูงเกินขอบเขตคลัง' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(public.inv_fn_purchase_uid()::text, 48));
  if (select count(*) from public.inv_purchase_receipts where performed_by = public.inv_fn_purchase_uid() and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'บันทึกถี่เกินไป กรุณารอสักครู่';
  end if;
  v_item_id := nullif(p_data->>'item_id','')::uuid;
  if v_item_id is null then
    min_stock := (p_data->>'new_min_stock')::numeric;
    if length(btrim(coalesce(p_data->>'new_item_name',''))) not between 1 and 160
      or length(btrim(coalesce(p_data->>'new_item_unit',''))) not between 1 and 30
      or length(btrim(coalesce(p_data->>'new_item_category',''))) not between 1 and 80
      or min_stock is null or min_stock::text in ('NaN','Infinity','-Infinity') or min_stock < 0 or min_stock > 999999999 then
      raise exception 'ชื่อสินค้า หน่วยฐาน หมวดหมู่ หรือจุดสั่งซื้อไม่ถูกต้อง' using errcode = '22023';
    end if;
    insert into public.items(name,category,base_unit,purchase_unit,purchase_unit_qty,item_type,default_min_stock_level,tenant_id,is_active)
      values (btrim(p_data->>'new_item_name'),btrim(p_data->>'new_item_category'),btrim(p_data->>'new_item_unit'),unit,pack,'consumable',min_stock,t,true)
      returning id into v_item_id;
  end if;
  select * into i from public.items where id = v_item_id and tenant_id = t and is_active;
  if not found then raise exception 'ไม่พบสินค้าที่ใช้งานได้ในกิจการนี้' using errcode = '42501'; end if;
  -- Serializes first receipts as well as later receipts. Stock costing remains in existing trigger.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_branch_id::text || v_item_id::text, 49));
  insert into public.stock_transactions(item_id,branch_id,tenant_id,txn_type,status,quantity_delta,unit_cost_snapshot,reference_type,reference_note,performed_by)
    values (v_item_id,p_branch_id,t,'stock_in','approved',base_qty,paid/base_qty,'purchase',
      supplier || ' | ซื้อ ' || bought::text || ' | ' || qty::text || ' ' || unit || ' × ' || pack::text || ' ' || i.base_unit || ' | ' || note,public.inv_fn_purchase_uid())
    returning id into txn_id;
  insert into public.inv_purchase_receipts(tenant_id,branch_id,item_id,stock_transaction_id,request_id,payload,purchase_date,supplier_name,
    item_name,base_unit,purchase_unit,pack_count,units_per_pack,base_quantity,goods_amount,shipping_amount,discount_amount,paid_amount,reference_note,performed_by)
    values (t,p_branch_id,v_item_id,txn_id,p_request_id,p_data,bought,supplier,i.name,i.base_unit,unit,qty,pack,base_qty,amount,shipping,discount,paid,note,public.inv_fn_purchase_uid())
    returning id into receipt_id;
  return receipt_id;
end $$;

create or replace function public.inv_fn_purchase_history(p_branch_id uuid, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.inv_fn_purchase_actor(p_branch_id);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'เลือกช่วงวันที่ไม่เกิน 1 ปี' using errcode = '22023';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(r) - 'payload' - 'request_id' - 'performed_by' - 'tenant_id') from (
    select * from public.inv_purchase_receipts where branch_id = p_branch_id and purchase_date between p_from and p_to
    order by purchase_date desc, created_at desc, id desc limit 5001
  ) r), '[]'::jsonb);
end $$;

create or replace function public.inv_fn_immutable_purchase()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'ประวัติการซื้อแก้ไขหรือลบไม่ได้'; end $$;
drop trigger if exists inv_purchase_receipts_immutable on public.inv_purchase_receipts;
create trigger inv_purchase_receipts_immutable before update or delete on public.inv_purchase_receipts
  for each row execute function public.inv_fn_immutable_purchase();

-- Reuse the existing audit trigger, whose production name carries inv_.
do $$ declare audit_fn text; begin
  audit_fn := case when to_regprocedure('public.inv_fn_write_audit_log()') is not null then 'inv_fn_write_audit_log'
    when to_regprocedure('public.fn_write_audit_log()') is not null then 'fn_write_audit_log' end;
  if audit_fn is null then raise exception 'Missing inventory audit function'; end if;
  drop trigger if exists inv_purchase_receipts_audit on public.inv_purchase_receipts;
  execute format('create trigger inv_purchase_receipts_audit after insert on public.inv_purchase_receipts for each row execute function public.%I()', audit_fn);
end $$;

alter function public.inv_fn_purchase_actor(uuid) owner to inv_purchase_owner;
alter function public.inv_fn_receive_purchase(uuid,uuid,jsonb) owner to inv_purchase_owner;
alter function public.inv_fn_purchase_history(uuid,date,date) owner to inv_purchase_owner;
revoke all on function public.inv_fn_purchase_actor(uuid) from public, anon, authenticated;
revoke all on function public.inv_fn_receive_purchase(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.inv_fn_purchase_history(uuid,date,date) from public, anon, authenticated;
revoke all on function public.inv_fn_immutable_purchase() from public, anon, authenticated;
grant execute on function public.inv_fn_receive_purchase(uuid,uuid,jsonb) to authenticated;
grant execute on function public.inv_fn_purchase_history(uuid,date,date) to authenticated;
notify pgrst, 'reload schema';
revoke create on schema public from inv_purchase_owner;
