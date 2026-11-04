grant select on public.sc_sales to rrs_guard_owner;
drop policy if exists rrs_guard_owner_read on public.sc_sales;
create policy rrs_guard_owner_read on public.sc_sales for select to rrs_guard_owner using(true);
create or replace function rrs_private.guard_financial_period()
returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb; date_key text;
begin
  before_row:=case when tg_op<>'INSERT' then to_jsonb(old) end;
  after_row:=case when tg_op<>'DELETE' then to_jsonb(new) end;
  date_key:=case tg_table_name when 'sc_payments' then 'received_date' when 'sc_opex' then 'month' when 'sc_expense_entries' then 'entry_date' else 'date' end;
  -- Legacy employee profiles are zero-value metadata, not a monthly expense.
  if tg_table_name='sc_opex'
    and (before_row is null or (before_row->>'category'='payslip_detail' and before_row->>'key' like 'empd_profile_%' and coalesce((before_row->>'amount')::numeric,0)=0))
    and (after_row is null or (after_row->>'category'='payslip_detail' and after_row->>'key' like 'empd_profile_%' and coalesce((after_row->>'amount')::numeric,0)=0)) then
    return case when tg_op='DELETE' then old else new end;
  end if;
  -- Linking an old payment changes no financial amount or business date.
  if tg_op='UPDATE' and tg_table_name='sc_payments' and (before_row-'sale_id')=(after_row-'sale_id')
    and before_row->>'sale_id' is null and after_row->>'sale_id' is not null
    and exists(select 1 from public.sc_sales s where s.id=(after_row->>'sale_id')::bigint and s.tenant_id=(after_row->>'tenant_id')::uuid and s.date=(after_row->>'sale_date')::date) then return new; end if;
  -- Payment status is a derived cache; collection after closing the sale month is valid.
  if tg_op='UPDATE' and tg_table_name='sc_sales' and (before_row-array['payment_status','last_updated','version'])=(after_row-array['payment_status','last_updated','version']) then return new; end if;
  if before_row is not null then perform rrs_private.assert_open((before_row->>'tenant_id')::uuid,before_row->>date_key); end if;
  if after_row is not null then perform rrs_private.assert_open((after_row->>'tenant_id')::uuid,after_row->>date_key); end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function rrs_private.guard_financial_period() from public,anon,authenticated;

grant create on schema public,rrs_private to rrs_command_owner;

create or replace function public.rrs_read_sales(p_actor uuid,p_tenant uuid,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles%rowtype; t uuid; result jsonb;
begin
 select coalesce(p_tenant,tenant_id,(select id from public.tenants order by id limit 1)) into t from public.profiles where id=p_actor;
 a:=rrs_private.service_actor(p_actor,t,array['admin','co_admin','staff','super_admin']);
 if a.role::text<>'super_admin' then t:=a.tenant_id; else t:=p_tenant; end if;
 if p_limit is null or p_limit not between 1 and 1000 then raise exception 'จำนวนรายการไม่ถูกต้อง'; end if;
 select coalesce(jsonb_agg(x.row order by x.date desc,x.id desc),'[]'::jsonb) into result from (
  select s.date,s.id,to_jsonb(s)||jsonb_build_object('payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id desc) from public.sc_payments p where p.tenant_id=s.tenant_id and (p.sale_id=s.id or (p.sale_id is null and p.sale_date=s.date and (select count(*) from public.sc_sales n where n.tenant_id=s.tenant_id and n.date=s.date)=1))),'[]'::jsonb),
   'legacy_unallocated',case when (select count(*) from public.sc_sales n where n.tenant_id=s.tenant_id and n.date=s.date)>1 then (select coalesce(sum(p.amount),0) from public.sc_payments p where p.tenant_id=s.tenant_id and p.sale_date=s.date and p.sale_id is null) else 0 end) row
   from public.sc_sales s where t is null or s.tenant_id=t order by s.date desc,s.id desc limit p_limit
 ) x;
 return jsonb_build_object('rows',result);
end $$;

create or replace function public.rrs_delete_sale(p_actor uuid,p_tenant uuid,p_id bigint,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sale public.sc_sales%rowtype;
begin
 perform rrs_private.service_actor(p_actor,p_tenant,array['admin','co_admin','super_admin']);
 select * into sale from public.sc_sales where tenant_id=p_tenant and id=p_id for update;
 if not found then return jsonb_build_object('replay',true); end if;
 if p_version is distinct from sale.version then raise exception 'รายการถูกแก้ไขแล้ว กรุณาโหลดใหม่' using errcode='40001'; end if;
 perform rrs_private.assert_open(p_tenant,sale.date::text);
 if sale.service_order_id is not null then raise exception 'ยอดนี้มาจากใบรับงาน ห้ามลบยอดขายแยกจากใบรับงาน'; end if;
 if exists(select 1 from public.sc_payments where tenant_id=p_tenant and (sale_id=sale.id or (sale_id is null and sale_date=sale.date))) then raise exception 'รายการมีรับชำระหรือเงินรับเก่าที่ยังไม่จับคู่ ลบไม่ได้'; end if;
 delete from public.sc_sales where tenant_id=p_tenant and id=sale.id;
 return jsonb_build_object('replay',false);
end $$;

create or replace function public.rrs_set_order_status(p_actor uuid,p_tenant uuid,p_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles%rowtype; old public.service_orders%rowtype;
begin
 a:=rrs_private.service_actor(p_actor,p_tenant,array['admin','co_admin','staff','super_admin']);
 select * into old from public.service_orders where id=p_id and tenant_id=p_tenant for update;
 if not found or (replace(a.role::text,'-','_') not in ('admin','super_admin') and old.branch_id is distinct from a.branch_id) then raise exception 'ไม่มีสิทธิ์ใบรับงานนี้' using errcode='42501'; end if;
 if p_status is null or p_status not in ('received','in_progress','ready','delivered','cancelled') then raise exception 'สถานะไม่ถูกต้อง'; end if;
 if old.status::text=p_status then return jsonb_build_object('replay',true); end if;
 if old.status::text in ('cancelled','delivered') then raise exception 'งานปิดแล้ว กรุณาให้ผู้ดูแลตรวจสอบก่อนเปลี่ยนสถานะ'; end if;
 update public.service_orders set status=p_status,completed_at=case when p_status='ready' then now() else completed_at end,delivered_at=case when p_status='delivered' then now() else delivered_at end,updated_at=now() where id=old.id;
 return jsonb_build_object('replay',false,'accounting_review',p_status='cancelled' and old.payment_status='paid');
end $$;

-- Validate inventory identity and prevent direct clients approving their adjustments.
create or replace function rrs_private.guard_stock_identity()
returns trigger language plpgsql security definer set search_path='' as $$
declare t uuid; item_tenant uuid; a public.profiles%rowtype; actor uuid;
begin
 select tenant_id into t from public.branches where id=new.branch_id;
 select tenant_id into item_tenant from public.items where id=new.item_id;
 if t is null or item_tenant is distinct from t or new.tenant_id is distinct from t then raise exception 'สินค้า สาขา และกิจการไม่ตรงกัน' using errcode='42501'; end if;
 actor:=rrs_private.actor_uid();
 if actor is not null then
  select * into a from public.profiles where id=actor and is_active;
  if not found or new.performed_by is distinct from actor or (a.role::text<>'super_admin' and a.tenant_id is distinct from t)
    or (replace(a.role::text,'-','_') not in ('admin','super_admin') and a.branch_id is distinct from new.branch_id) then raise exception 'ไม่มีสิทธิ์ทำสต๊อกของสาขานี้' using errcode='42501'; end if;
  if replace(a.role::text,'-','_') not in ('admin','co_admin','super_admin') and new.txn_type::text<>'stock_out' then raise exception 'ไม่มีสิทธิ์ทำรายการสต๊อกนี้' using errcode='42501'; end if;
  if replace(a.role::text,'-','_')='co_admin' and new.txn_type::text in ('adjustment_increase','adjustment_decrease') then new.status:='pending_approval'; end if;
 end if;
 return new;
end $$;
revoke all on function rrs_private.guard_stock_identity() from public,anon,authenticated;
do $$ declare t text; begin
 t:=case when to_regclass('public.inv_stock_transactions') is not null then 'inv_stock_transactions' else 'stock_transactions' end;
 if to_regclass('public.'||t) is not null then
  execute format('drop trigger if exists aa_rrs_guard_stock_identity on public.%I',t);
  execute format('create trigger aa_rrs_guard_stock_identity before insert on public.%I for each row execute function rrs_private.guard_stock_identity()',t);
 end if;
end $$;
grant create on schema rrs_private to rrs_guard_owner;
alter function rrs_private.guard_stock_identity() owner to rrs_guard_owner;
revoke create on schema rrs_private from rrs_guard_owner;

do $$ declare f record; begin
 grant select on public.tenants to rrs_command_owner;
 drop policy if exists rrs_command_owner_read on public.tenants;
 create policy rrs_command_owner_read on public.tenants for select to rrs_command_owner using(true);
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('rrs_read_sales','rrs_delete_sale','rrs_set_order_status') loop
  execute 'alter function '||f.signature||' owner to rrs_command_owner';
  execute 'revoke all on function '||f.signature||' from public,anon,authenticated';
  execute 'grant execute on function '||f.signature||' to service_role';
 end loop;
 revoke create on schema public,rrs_private from rrs_command_owner;
end $$;
notify pgrst,'reload schema';

-- Existing records had UNIQUE(date). Link only a provable single sale; never guess an ambiguous day.
update public.sc_payments p set sale_id=s.id from public.sc_sales s
 where p.sale_id is null and p.tenant_id=s.tenant_id and p.sale_date=s.date
 and (select count(*) from public.sc_sales x where x.tenant_id=p.tenant_id and x.date=p.sale_date)=1;
-- Browser clients can read permitted rows, but all command writes now go through server RPCs.
do $$ declare t text; begin
 foreach t in array array['sc_sales','sc_payments','service_orders','service_order_items','customers'] loop
  execute format('revoke insert,update,delete,truncate,trigger,references on public.%I from public,anon,authenticated',t);
 end loop;
end $$;
