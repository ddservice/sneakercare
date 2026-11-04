-- Close the confirmed direct-API paths. No business-row rewrites.
create schema if not exists rrs_private;
revoke all on schema rrs_private from public, anon;

create or replace function rrs_private.actor_uid()
returns uuid language sql stable set search_path='' as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
revoke all on function rrs_private.actor_uid() from public,anon,authenticated;

create or replace function public.fn_current_tenant()
returns uuid language sql stable security definer set search_path='' as $$
 select tenant_id from public.profiles where id=rrs_private.actor_uid() and is_active
$$;
create or replace function public.inv_fn_current_branch()
returns uuid language sql stable security definer set search_path='' as $$
 select branch_id from public.profiles where id=rrs_private.actor_uid() and is_active
$$;
create or replace function public.fn_sc_is_admin()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=rrs_private.actor_uid() and is_active and role::text in ('admin','super_admin'))
$$;

create or replace function rrs_private.assert_actor(p_tenant uuid, p_roles text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.profiles%rowtype;
begin
  if rrs_private.actor_uid() is null then raise exception 'กรุณาเข้าสู่ระบบ' using errcode='42501'; end if;
  select * into a from public.profiles where id=rrs_private.actor_uid() and is_active;
  if not found or p_tenant is null or not (replace(a.role::text,'-','_')=any(p_roles))
    or (replace(a.role::text,'-','_')<>'super_admin' and a.tenant_id is distinct from p_tenant) then
    raise exception 'ไม่มีสิทธิ์ทำรายการของกิจการนี้' using errcode='42501';
  end if;
  return a.id;
end $$;
revoke all on function rrs_private.assert_actor(uuid,text[]) from public,anon,authenticated;

create or replace function rrs_private.assert_inventory_scope(p_item uuid,p_branch uuid,p_roles text[])
returns void language plpgsql security definer set search_path='' as $$
declare t uuid; a public.profiles%rowtype;
begin
 select tenant_id into t from public.branches where id=p_branch and is_active;
 perform rrs_private.assert_actor(t,p_roles);
 select * into a from public.profiles where id=rrs_private.actor_uid();
 if replace(a.role::text,'-','_')='co_admin' and a.branch_id is distinct from p_branch then raise exception 'ไม่มีสิทธิ์สาขานี้' using errcode='42501'; end if;
 if not exists(select 1 from public.items where id=p_item and tenant_id=t and is_active) then raise exception 'สินค้าไม่ตรงกับกิจการของสาขา' using errcode='42501'; end if;
end $$;
revoke all on function rrs_private.assert_inventory_scope(uuid,uuid,text[]) from public,anon,authenticated;

do $$ declare f record; src text; def text; begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('inv_fn_set_min_stock_level','fn_set_min_stock_level','inv_fn_set_alert_muted','fn_set_alert_muted','inv_fn_approve_adjustment','fn_approve_adjustment') loop
  src:=(select prosrc from pg_proc where oid=f.oid);
  if src like '%rrs_private.assert_inventory_scope%' then continue; end if;
  if f.proname like '%approve_adjustment' then
   src:=replace(src,'if inv_fn_current_role() not in (''admin'', ''co-admin'', ''super_admin'')','if coalesce(inv_fn_current_role(),'''') not in (''admin'', ''super_admin'')');
   src:=replace(src,'if fn_current_role() not in (''admin'', ''co-admin'', ''super_admin'')','if coalesce(fn_current_role(),'''') not in (''admin'', ''super_admin'')');
   src:=regexp_replace(src,'if p_approve then','perform rrs_private.assert_inventory_scope(v_txn.item_id,v_txn.branch_id,array[''admin'',''super_admin'']); if p_approve then');
  else
   src:=regexp_replace(src,'\mbegin\M','begin perform rrs_private.assert_inventory_scope(p_item_id,p_branch_id,array[''admin'',''co_admin'',''super_admin'']);');
   src:=replace(src,'inv_fn_current_role() = ''admin''','inv_fn_current_role() in (''admin'',''super_admin'')');
   src:=replace(src,'fn_current_role() = ''admin''','fn_current_role() in (''admin'',''super_admin'')');
  end if;
  if src not like '%rrs_private.assert_inventory_scope%' then raise exception 'Cannot secure inventory RPC %',f.proname; end if;
  def:=pg_get_functiondef(f.oid);
  -- pg_get_functiondef uses a dollar tag; preserve the header and quote only its body.
  def:=substring(pg_get_functiondef(f.oid) from 1 for strpos(pg_get_functiondef(f.oid),'AS $function$')-1)||'AS '||quote_literal(src);
  if def is null or def='' then raise exception 'Unexpected function definition %',f.proname; end if;
  execute def;
 end loop;
end $$;

do $$ declare f record; src text; def text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and p.proname in ('fn_integration_secret_status','inv_fn_integration_secret_status','inv_fn_set_integration_secret') loop
  src:=(select prosrc from pg_proc where oid=f.oid);
  src:=replace(src,'if inv_fn_current_role() not in','if coalesce(inv_fn_current_role(),'''') not in');
  def:=substring(pg_get_functiondef(f.oid) from 1 for strpos(pg_get_functiondef(f.oid),'AS $function$')-1)||'AS '||quote_literal(src);
  execute def;
  execute 'revoke all on function '||f.oid::regprocedure||' from public,anon';
  execute 'grant execute on function '||f.oid::regprocedure||' to authenticated';
 end loop;
end $$;

create or replace function rrs_private.guard_profile()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype; actor_role text; branch_tenant uuid;
begin
  if new.branch_id is not null then
    select tenant_id into branch_tenant from public.branches where id=new.branch_id and is_active;
    if branch_tenant is null or branch_tenant is distinct from new.tenant_id then
      raise exception 'สาขาไม่ตรงกับกิจการของผู้ใช้' using errcode='23514';
    end if;
  end if;
  -- Maintenance is allowed only for actual DB/service roles, never a missing user JWT.
  if rrs_private.actor_uid() is null and current_setting('role',true) in ('none','postgres','supabase_admin','service_role') then
    return new;
  end if;
  select * into actor from public.profiles where id=rrs_private.actor_uid() and is_active;
  if not found then raise exception 'ไม่มีสิทธิ์แก้โปรไฟล์' using errcode='42501'; end if;
  actor_role:=replace(actor.role::text,'-','_');
  if tg_op='UPDATE' and new.id is distinct from old.id then
    raise exception 'เปลี่ยนรหัสผู้ใช้ไม่ได้' using errcode='42501';
  end if;
  if actor_role<>'super_admin' then
    if replace(new.role::text,'-','_')='super_admin' or (tg_op='UPDATE' and replace(old.role::text,'-','_')='super_admin') then
      raise exception 'เฉพาะผู้ดูแลระบบจัดการสิทธิ์ผู้ดูแลระบบได้' using errcode='42501';
    end if;
    if new.tenant_id is distinct from actor.tenant_id or (tg_op='UPDATE' and old.tenant_id is distinct from actor.tenant_id) then
      raise exception 'เปลี่ยนหรือจัดการผู้ใช้ข้ามกิจการไม่ได้' using errcode='42501';
    end if;
    if actor_role<>'admin' then
      if tg_op='INSERT' or new.id<>actor.id or
        row(new.role,new.tenant_id,new.branch_id,new.is_active) is distinct from row(old.role,old.tenant_id,old.branch_id,old.is_active) then
        raise exception 'ไม่มีสิทธิ์เปลี่ยนบทบาท สาขา หรือสถานะผู้ใช้' using errcode='42501';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function rrs_private.guard_profile() from public,anon,authenticated;
drop trigger if exists rrs_guard_profile on public.profiles;
create trigger rrs_guard_profile before insert or update on public.profiles for each row execute function rrs_private.guard_profile();
revoke truncate,trigger,references on public.profiles from authenticated,anon;

do $$ declare signature text; begin
  foreach signature in array array[
    'public.fn_consume_stock_outflow(uuid,uuid,numeric)',
    'public.fn_reject_stock_over_issue()',
    'public.fn_sc_audit_logs_block_mutation()',
    'extension_layer.fn_generate_document_number(character varying,character varying,character varying,uuid)'
  ] loop
    if to_regprocedure(signature) is not null then
      execute 'revoke all on function '||signature||' from public,anon,authenticated';
      execute 'grant execute on function '||signature||' to service_role';
    end if;
  end loop;
end $$;

-- Retain the staff-safe projection and its columns, add tenant boundary outside it.
do $$ declare v text; def text; branch_table text; begin
  branch_table:=case when to_regclass('public.inv_branches') is not null then 'inv_branches' else 'branches' end;
  for v in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='v' and c.relname in ('inv_v_item_stock','inv_v_low_stock','v_item_stock','v_low_stock')
      and coalesce(c.reloptions::text,'') ~ 'security_invoker=(false|off)' loop
    if coalesce(obj_description(('public.'||v)::regclass,'pg_class'),'') like '%rrs_security_0048%' then continue; end if;
    def:=rtrim(pg_get_viewdef(('public.'||v)::regclass,true),'; '||chr(10)||chr(13));
    def:=replace(def, 'inv_fn_current_role() = ''admin''::text', '(inv_fn_current_role() in (''admin'',''super_admin''))');
    def:=replace(def, 'fn_current_role() = ''admin''::text', '(fn_current_role() in (''admin'',''super_admin''))');
    execute format('create or replace view public.%I with (security_invoker=false) as select scoped.* from (%s) scoped where exists (select 1 from public.%I b where b.id=scoped.branch_id and (public.sc_get_my_role()=''super_admin'' or b.tenant_id=public.fn_current_tenant()))',v,def,branch_table);
    execute format('revoke all on public.%I from anon',v);
    execute format('comment on view public.%I is %L',v,coalesce(obj_description(('public.'||v)::regclass,'pg_class'),'')||' rrs_security_0048 tenant boundary');
  end loop;
end $$;

-- Ledger writes must use the validated RPC. Redefine it before withdrawing INSERT.
create or replace function rrs_private.validate_receipt(p_tenant uuid,p_receipt text,p_request text,p_fingerprint text,p_amount numeric,p_vat numeric,p_approver uuid)
returns void language plpgsql security definer set search_path='' as $$
declare q jsonb; line jsonb; expected text; amount numeric; vat numeric;
begin
  if exists(select 1 from public.sc_receipt_posts where tenant_id=p_tenant and receipt_id=p_receipt) then return; end if;
  select value::jsonb into q from public.sc_settings where tenant_id=p_tenant and key='receipt_staging';
  if q is null or jsonb_typeof(q)<>'array' then raise exception 'ไม่พบคิวใบเสร็จที่อนุมัติ'; end if;
  select x into line from jsonb_array_elements(q) x where x->>'id'=p_receipt;
  if line is null or line->>'approved' is distinct from 'true' or coalesce(line->>'vendorName','')='' or coalesce(line->>'purchaseClass','') not in ('goods','opex','asset')
    or (line->>'approvedBy') is distinct from p_approver::text or p_request is distinct from coalesce(nullif(line->>'postedRequestId',''),line->>'id') then
    raise exception 'ใบเสร็จยังไม่ผ่านการตรวจและอนุมัติ' using errcode='23514';
  end if;
  perform rrs_private.assert_open(p_tenant,line->>'date');
  amount:=coalesce(nullif((line->>'totalAmount')::numeric,0),(line->>'baseAmount')::numeric);
  vat:=case when line->>'isFullTaxInvoice'='true' and line->>'userConfirmedVatCredit'='true' then coalesce((line->>'vatAmount')::numeric,0) else 0 end;
  expected:=concat_ws('|',line->>'date',regexp_replace(coalesce(line->>'vendorTaxId',''),'\D','','g'),btrim(coalesce(line->>'invoiceNumber','')),
    to_char(round((line->>'baseAmount')::numeric,2),'FM999999999999990.00'),to_char(round((line->>'vatAmount')::numeric,2),'FM999999999999990.00'),line->>'purchaseClass',
    case when line->>'isFullTaxInvoice'='true' then '1' else '0' end,case when line->>'userConfirmedVatCredit'='true' then '1' else '0' end);
  if expected is distinct from p_fingerprint or round(amount,2) is distinct from p_amount or round(vat,2) is distinct from p_vat then
    raise exception 'ข้อมูลสมุดซื้อไม่ตรงกับใบที่อนุมัติ' using errcode='23514';
  end if;
end $$;
revoke all on function rrs_private.validate_receipt(uuid,text,text,text,numeric,numeric,uuid) from public,anon,authenticated;
do $$ declare src text; injection text; begin
  select prosrc into src from pg_proc where oid='public.sc_fn_post_receipt(uuid,text,text,text,numeric,numeric,uuid)'::regprocedure;
  if src not like '%rrs_private.assert_actor%' then
    injection:=$code$begin
      if rrs_private.actor_uid() is null and current_setting('role',true)='service_role' then
        if not exists(select 1 from public.profiles where id=p_approved_by and is_active and (role::text='super_admin' or (role::text='admin' and tenant_id=p_tenant_id))) then
          raise exception 'ผู้อนุมัติไม่มีสิทธิ์ของกิจการ' using errcode='42501';
        end if;
      else
        perform rrs_private.assert_actor(p_tenant_id,array['admin','super_admin']);
      end if;
      if p_approved_by is null or not exists(select 1 from public.profiles where id=p_approved_by and is_active and (tenant_id=p_tenant_id or role::text='super_admin')) then
        raise exception 'ผู้อนุมัติไม่ตรงกับกิจการ' using errcode='42501';
      end if;
      if p_purchase_amount is null or p_vat_credit is null or p_purchase_amount::text in ('NaN','Infinity','-Infinity') or p_vat_credit::text in ('NaN','Infinity','-Infinity')
        or p_purchase_amount<0 or p_vat_credit<0 or p_vat_credit>p_purchase_amount or coalesce(p_fingerprint,'')='' then
        raise exception 'ยอดสมุดซื้อไม่ถูกต้อง' using errcode='22023';
      end if;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant_id::text||p_receipt_id,48));
      perform rrs_private.validate_receipt(p_tenant_id,p_receipt_id,p_request_id,p_fingerprint,p_purchase_amount,p_vat_credit,p_approved_by);
    $code$;
    src:=regexp_replace(src,'\mbegin\M',injection);
    execute 'create or replace function public.sc_fn_post_receipt(p_tenant_id uuid,p_receipt_id text,p_request_id text,p_fingerprint text,p_purchase_amount numeric,p_vat_credit numeric,p_approved_by uuid) returns table(replay boolean,purchase_amount numeric,vat_credit numeric) language plpgsql security definer set search_path='''' as '||quote_literal(src);
  end if;
end $$;
revoke all on public.sc_receipt_posts from anon,authenticated;
grant select on public.sc_receipt_posts to authenticated;
revoke all on function public.sc_fn_post_receipt(uuid,text,text,text,numeric,numeric,uuid) from public,anon;
grant execute on function public.sc_fn_post_receipt(uuid,text,text,text,numeric,numeric,uuid) to authenticated,service_role;

create or replace function rrs_private.immutable_receipt_post()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'สมุดซื้อแก้ไขหรือลบตรงไม่ได้'; end $$;
revoke all on function rrs_private.immutable_receipt_post() from public,anon,authenticated;
drop trigger if exists rrs_immutable_receipt_post on public.sc_receipt_posts;
create trigger rrs_immutable_receipt_post before update or delete on public.sc_receipt_posts for each row execute function rrs_private.immutable_receipt_post();

-- The table trigger enforces periods even when an API call bypasses the web page.
create or replace function rrs_private.assert_open(p_tenant uuid,p_date text)
returns void language plpgsql security definer set search_path='' as $$
declare raw text; closed jsonb; ym text;
begin
  if p_date ~ '^\d{4}-\d{2}-\d{2}' then ym:=left(p_date,7);
  elsif p_date ~ '^\d{2}/\d{4}$' then ym:=right(p_date,4)||'-'||left(p_date,2);
  else raise exception 'วันที่บัญชีไม่ถูกต้อง' using errcode='22023'; end if;
  if ym !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'งวดไม่ถูกต้อง' using errcode='22023'; end if;
  -- Shared lock serializes a write against closing the same tenant's periods.
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(p_tenant::text,480));
  select value into raw from public.sc_settings where tenant_id=p_tenant and key='closed_periods';
  if not found then return; end if;
  if raw is null then raise exception 'อ่านสถานะปิดงวดไม่ได้'; end if;
  closed:=raw::jsonb;
  if jsonb_typeof(closed)<>'array' then raise exception 'อ่านสถานะปิดงวดไม่ได้'; end if;
  if closed ? ym then raise exception 'งวด % ปิดแล้ว ห้ามแก้บัญชีร้าน',ym using errcode='23514'; end if;
end $$;
revoke all on function rrs_private.assert_open(uuid,text) from public,anon,authenticated;

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
  -- Payment status is a derived cache; collection after closing the sale month is valid.
  if tg_op='UPDATE' and tg_table_name='sc_sales' and (before_row-array['payment_status','last_updated','version'])=(after_row-array['payment_status','last_updated','version']) then return new; end if;
  if before_row is not null then perform rrs_private.assert_open((before_row->>'tenant_id')::uuid,before_row->>date_key); end if;
  if after_row is not null then perform rrs_private.assert_open((after_row->>'tenant_id')::uuid,after_row->>date_key); end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function rrs_private.guard_financial_period() from public,anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['sc_sales','sc_payments','sc_opex','sc_expense_entries'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists rrs_guard_financial_period on public.%I',t);
      execute format('create trigger rrs_guard_financial_period before insert or update or delete on public.%I for each row execute function rrs_private.guard_financial_period()',t);
      execute format('revoke truncate,trigger,references on public.%I from anon,authenticated',t);
    end if;
  end loop;
end $$;

create or replace function rrs_private.guard_period_settings()
returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb;
begin
  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_op='UPDATE' and old.key='closed_periods' and row(new.key,new.tenant_id) is distinct from row(old.key,old.tenant_id) then
    raise exception 'เปลี่ยนคีย์หรือกิจการของสถานะปิดงวดไม่ได้';
  end if;
  if row_data->>'key'='closed_periods' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(row_data->>'tenant_id',480));
    if tg_op='DELETE' then raise exception 'ใช้คำสั่งเปิดงวดแทนการลบสถานะปิดงวด'; end if;
    if new.value is null or jsonb_typeof((new.value)::jsonb)<>'array' or exists(select 1 from jsonb_array_elements_text(new.value::jsonb) v where v !~ '^\d{4}-(0[1-9]|1[0-2])$') then
      raise exception 'ข้อมูลปิดงวดไม่ถูกต้อง' using errcode='22023';
    end if;
    if rrs_private.actor_uid() is not null then perform rrs_private.assert_actor((row_data->>'tenant_id')::uuid,array['admin','super_admin']); end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function rrs_private.guard_period_settings() from public,anon,authenticated;
drop trigger if exists rrs_guard_period_settings on public.sc_settings;
create trigger rrs_guard_period_settings before insert or update or delete on public.sc_settings for each row execute function rrs_private.guard_period_settings();

create or replace function public.rrs_set_period(p_tenant uuid,p_period text,p_closed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare raw text; periods jsonb; result jsonb;
begin
 perform rrs_private.assert_actor(p_tenant,array['admin','super_admin']);
 if p_period is null or p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' or p_closed is null then raise exception 'งวดไม่ถูกต้อง' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant::text,480));
 select value into raw from public.sc_settings where tenant_id=p_tenant and key='closed_periods';
 if found and raw is null then raise exception 'อ่านสถานะปิดงวดไม่ได้'; end if;
 periods:=coalesce(raw::jsonb,'[]'::jsonb);
 if jsonb_typeof(periods)<>'array' then raise exception 'อ่านสถานะปิดงวดไม่ได้'; end if;
 if p_closed then periods:=periods||jsonb_build_array(p_period); else periods:=periods-p_period; end if;
 select coalesce(jsonb_agg(v order by v),'[]'::jsonb) into result from (select distinct value v from jsonb_array_elements_text(periods)) x;
 insert into public.sc_settings(tenant_id,key,value,updated_at) values(p_tenant,'closed_periods',result::text,now())
 on conflict(tenant_id,key) do update set value=excluded.value,updated_at=excluded.updated_at;
 return result;
end $$;
revoke all on function public.rrs_set_period(uuid,text,boolean) from public,anon;
grant execute on function public.rrs_set_period(uuid,text,boolean) to authenticated;

create or replace function rrs_private.can_write_branding(p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=rrs_private.actor_uid() and p.is_active
    and replace(p.role::text,'-','_') in ('admin','co_admin','super_admin')
    and (split_part(p_name,'/',1)=p.tenant_id::text or (p.role::text='super_admin' and exists(select 1 from public.tenants t where t.id::text=split_part(p_name,'/',1)))))
$$;
revoke all on function rrs_private.can_write_branding(text) from public,anon;
grant usage on schema rrs_private to authenticated;
grant execute on function rrs_private.can_write_branding(text) to authenticated;
do $$ begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists branding_admin_write on storage.objects;
    drop policy if exists branding_admin_update on storage.objects;
    drop policy if exists branding_admin_delete on storage.objects;
    drop policy if exists rrs_branding_insert on storage.objects;
    drop policy if exists rrs_branding_update on storage.objects;
    drop policy if exists rrs_branding_delete on storage.objects;
    create policy rrs_branding_insert on storage.objects for insert to authenticated with check(bucket_id='branding' and rrs_private.can_write_branding(name));
    create policy rrs_branding_update on storage.objects for update to authenticated using(bucket_id='branding' and rrs_private.can_write_branding(name)) with check(bucket_id='branding' and rrs_private.can_write_branding(name));
    create policy rrs_branding_delete on storage.objects for delete to authenticated using(bucket_id='branding' and rrs_private.can_write_branding(name));
    update storage.buckets set file_size_limit=2097152,allowed_mime_types=array['image/png','image/jpeg','image/webp'] where id='branding';
  end if;
end $$;
-- Dedicated NOLOGIN owner; explicit internal policies avoid requiring BYPASSRLS.
do $$ declare t text; base text; f record; begin
  if not exists(select 1 from pg_roles where rolname='rrs_guard_owner') then create role rrs_guard_owner nologin; end if;
  execute format('grant rrs_guard_owner to %I',current_user);
  grant usage on schema public,rrs_private to rrs_guard_owner;
  grant create on schema public,rrs_private to rrs_guard_owner;
  foreach t in array array['profiles','branches','items','tenants','sc_settings','sc_receipt_posts'] loop
    base:=case when t in ('branches','items') and to_regclass('public.inv_'||t) is not null then 'inv_'||t else t end;
    execute format('grant select on public.%I to rrs_guard_owner',base);
    execute format('grant select on public.%I to rrs_guard_owner',t);
    execute format('drop policy if exists rrs_guard_owner_read on public.%I',base);
    execute format('create policy rrs_guard_owner_read on public.%I for select to rrs_guard_owner using(true)',base);
  end loop;
  grant insert on public.sc_receipt_posts to rrs_guard_owner;
  grant update(request_id) on public.sc_receipt_posts to rrs_guard_owner;
  drop policy if exists rrs_guard_owner_receipt_insert on public.sc_receipt_posts;
  create policy rrs_guard_owner_receipt_insert on public.sc_receipt_posts for insert to rrs_guard_owner with check(true);
  grant insert,update on public.sc_settings to rrs_guard_owner;
  drop policy if exists rrs_guard_owner_settings_write on public.sc_settings;
  create policy rrs_guard_owner_settings_write on public.sc_settings for all to rrs_guard_owner using(true) with check(true);
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='rrs_private' loop
    execute 'alter function '||f.signature||' owner to rrs_guard_owner';
  end loop;
  alter function public.sc_fn_post_receipt(uuid,text,text,text,numeric,numeric,uuid) owner to rrs_guard_owner;
  alter function public.rrs_set_period(uuid,text,boolean) owner to rrs_guard_owner;
  revoke create on schema public,rrs_private from rrs_guard_owner;
end $$;
notify pgrst,'reload schema';
