-- New writes are atomic, actor-scoped and idempotent. No historical allocation guesses.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='rrs_command_owner') then create role rrs_command_owner nologin; end if;
 execute format('grant rrs_command_owner to %I',current_user);
end $$;
grant usage on schema public,rrs_private to rrs_command_owner;
grant create on schema public,rrs_private to rrs_command_owner;

-- Multiple independent sales per day; order numbers are unique within a tenant.
alter table public.sc_sales drop constraint if exists sc_sales_date_key;
alter table public.service_orders drop constraint if exists service_orders_order_no_key;
create unique index if not exists service_orders_tenant_order_no_key on public.service_orders(tenant_id,order_no);

alter table public.sc_sales add column if not exists version integer not null default 1;
alter table public.sc_payments add column if not exists sale_id bigint references public.sc_sales(id);
create index if not exists sc_payments_sale_id_idx on public.sc_payments(tenant_id,sale_id);
alter table public.service_orders add column if not exists total_amount numeric(10,2) not null default 0;
alter table public.service_orders add column if not exists payment_status text not null default 'paid';
alter table public.service_orders add column if not exists note text;
alter table public.service_orders add column if not exists created_by uuid references public.profiles(id);
do $$ declare col text; begin
 foreach col in array array['payment_method','status'] loop
  if exists(select 1 from pg_attribute where attrelid='public.service_orders'::regclass and attname=col and atttypid<>'text'::regtype) then
   execute format('alter table public.service_orders alter column %I drop default',col);
   execute format('alter table public.service_orders alter column %I type text using %I::text',col,col);
   execute format('alter table public.service_orders alter column %I set default %L',col,case col when 'status' then 'received' else 'cash' end);
  end if;
 end loop;
end $$;

create table if not exists rrs_private.commands(
 tenant_id uuid not null, command text not null, request_id text not null,
 actor_id uuid not null, payload jsonb not null, response jsonb not null, created_at timestamptz not null default now(),
 primary key(tenant_id,command,request_id)
);
alter table rrs_private.commands enable row level security;
alter table rrs_private.commands owner to rrs_command_owner;
revoke all on rrs_private.commands from public,anon,authenticated;
create table if not exists rrs_private.order_counters(tenant_id uuid,day date,sequence integer not null,primary key(tenant_id,day));
alter table rrs_private.order_counters enable row level security;
alter table rrs_private.order_counters owner to rrs_command_owner;
revoke all on rrs_private.order_counters from public,anon,authenticated;

create or replace function rrs_private.service_actor(p_actor uuid,p_tenant uuid,p_roles text[])
returns public.profiles language plpgsql security definer set search_path='' as $$
declare a public.profiles%rowtype;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception 'Server command only' using errcode='42501'; end if;
 select * into a from public.profiles where id=p_actor and is_active;
 if not found or p_tenant is null or not(replace(a.role::text,'-','_')=any(p_roles)) or (a.role::text<>'super_admin' and a.tenant_id is distinct from p_tenant) then
  raise exception 'ไม่มีสิทธิ์ทำรายการของกิจการนี้' using errcode='42501';
 end if;
 return a;
end $$;

create or replace function rrs_private.money(p_value numeric)
returns numeric language plpgsql immutable set search_path='' as $$
begin
 if p_value is null or p_value::text in ('NaN','Infinity','-Infinity') or p_value<0 or p_value>999999999 or p_value<>round(p_value,2) then
  raise exception 'จำนวนเงินไม่ถูกต้อง ใช้ทศนิยมไม่เกิน 2 ตำแหน่ง' using errcode='22023';
 end if;
 return p_value;
end $$;

create or replace function rrs_private.replay(p_tenant uuid,p_actor uuid,p_command text,p_request text,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare old rrs_private.commands%rowtype;
begin
 if p_request is null or length(p_request) not between 1 and 120 or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'คีย์หรือข้อมูลรายการไม่ถูกต้อง' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant::text||p_command||p_request,49));
 select * into old from rrs_private.commands where tenant_id=p_tenant and command=p_command and request_id=p_request;
 if found then
  if old.actor_id is distinct from p_actor or old.payload is distinct from p_data then raise exception 'คีย์เดิมแต่ข้อมูลเปลี่ยน กรุณาเริ่มรายการใหม่' using errcode='23514'; end if;
  return old.response||jsonb_build_object('replay',true);
 end if;
 if (select count(*) from rrs_private.commands where actor_id=p_actor and created_at>now()-interval '1 minute')>=60 then raise exception 'ทำรายการถี่เกินไป กรุณารอสักครู่'; end if;
 return null;
end $$;

create or replace function public.rrs_save_sale(p_actor uuid,p_tenant uuid,p_request text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles%rowtype; old public.sc_sales%rowtype; result jsonb; sale_id bigint;
 gross numeric; net numeric; discount numeric; cash numeric; transfer numeric; paid numeric; received numeric; business_date date;
begin
 a:=rrs_private.service_actor(p_actor,p_tenant,array['admin','co_admin','staff','super_admin']);
 result:=rrs_private.replay(p_tenant,p_actor,'sale',p_request,p_data); if result is not null then return result; end if;
 gross:=rrs_private.money((p_data->>'gross')::numeric); discount:=rrs_private.money((p_data->>'discount')::numeric);
 net:=rrs_private.money((p_data->>'net')::numeric); cash:=rrs_private.money((p_data->>'cash')::numeric); transfer:=rrs_private.money((p_data->>'transfer')::numeric);
 paid:=rrs_private.money((p_data->>'paid')::numeric); business_date:=(p_data->>'date')::date;
 if business_date is null or discount>gross or net<>gross-discount or paid<>cash+transfer or paid>net then raise exception 'ยอดสุทธิ ส่วนลด และเงินรับไม่ตรงกัน' using errcode='23514'; end if;
 perform rrs_private.assert_open(p_tenant,business_date::text);
 sale_id:=nullif(p_data->>'id','')::bigint;
 if sale_id is not null then
  select * into old from public.sc_sales where id=sale_id and tenant_id=p_tenant for update;
  if not found then raise exception 'ไม่พบยอดขาย' using errcode='42501'; end if;
  if exists(select 1 from public.sc_payments p where p.tenant_id=p_tenant and p.sale_id is null and p.sale_date=old.date) then raise exception 'มีเงินรับเก่าที่ยังไม่ผูกใบขาย กรุณากระทบยอดก่อนแก้ไข'; end if;
  if old.service_order_id is not null then raise exception 'ยอดจากใบรับงานแก้ผ่านรายการรับงานเท่านั้น'; end if;
  if old.version is distinct from (p_data->>'version')::integer then raise exception 'รายการถูกแก้ไขแล้ว กรุณาโหลดใหม่' using errcode='40001'; end if;
  perform rrs_private.assert_open(p_tenant,old.date::text);
  select coalesce(sum(p.amount),0) into received from public.sc_payments p where p.tenant_id=p_tenant and p.sale_id=old.id;
  if paid+received>net then raise exception 'ยอดใหม่ต่ำกว่าเงินที่รับชำระแล้ว'; end if;
 else received:=0; end if;
 if coalesce((p_data->>'size_s')::integer,0)<0 or coalesce((p_data->>'size_m')::integer,0)<0 or coalesce((p_data->>'size_l')::integer,0)<0 or coalesce((p_data->>'size_xl')::integer,0)<0 then raise exception 'จำนวนคู่ต้องไม่ติดลบ'; end if;
 if sale_id is null then
  insert into public.sc_sales(tenant_id,date,size_s,size_m,size_l,size_xl,grand_total,discount,total_revenue,cash_amount,transfer_amount,amount_paid,payment_status,extra_items,recorded_by,last_updated,client_request_id)
   values(p_tenant,business_date,coalesce((p_data->>'size_s')::integer,0),coalesce((p_data->>'size_m')::integer,0),coalesce((p_data->>'size_l')::integer,0),coalesce((p_data->>'size_xl')::integer,0),gross,discount,net,cash,transfer,paid,
     case when paid>=net then 'ชำระครบ' else 'ค้างชำระ' end,coalesce(p_data->>'extra_items',''),a.display_name,now(),p_request::uuid)
   returning id into sale_id;
 else
  if old.date<>business_date and exists(select 1 from public.sc_payments p where p.tenant_id=p_tenant and p.sale_id=old.id) then raise exception 'รายการมีรับชำระแล้ว เปลี่ยนวันขายไม่ได้'; end if;
  update public.sc_sales set date=business_date,size_s=coalesce((p_data->>'size_s')::integer,0),size_m=coalesce((p_data->>'size_m')::integer,0),size_l=coalesce((p_data->>'size_l')::integer,0),size_xl=coalesce((p_data->>'size_xl')::integer,0),
   grand_total=gross,discount=rrs_save_sale.discount,total_revenue=net,cash_amount=cash,transfer_amount=transfer,amount_paid=paid,
   payment_status=case when paid+received>=net then 'ชำระครบ' else 'ค้างชำระ' end,extra_items=coalesce(p_data->>'extra_items',''),recorded_by=a.display_name,last_updated=now(),version=version+1
   where id=sale_id and tenant_id=p_tenant;
 end if;
 result:=jsonb_build_object('id',sale_id,'replay',false);
 insert into rrs_private.commands values(p_tenant,'sale',p_request,p_actor,p_data,result,now()); return result;
end $$;

create or replace function public.rrs_record_payment(p_actor uuid,p_tenant uuid,p_request text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles%rowtype; sale public.sc_sales%rowtype; amount numeric; received numeric; payment_id bigint; result jsonb; received_date date;
begin
 a:=rrs_private.service_actor(p_actor,p_tenant,array['admin','co_admin','staff','super_admin']);
 result:=rrs_private.replay(p_tenant,p_actor,'payment',p_request,p_data); if result is not null then return result; end if;
 select * into sale from public.sc_sales where id=(p_data->>'sale_id')::bigint and tenant_id=p_tenant for update;
 if not found then raise exception 'ไม่พบรายการขายที่รับชำระ' using errcode='42501'; end if;
 amount:=rrs_private.money((p_data->>'amount')::numeric); received_date:=(p_data->>'received_date')::date;
 if amount<=0 or received_date is null or received_date<sale.date then raise exception 'วันที่หรือยอดรับชำระไม่ถูกต้อง'; end if;
 perform rrs_private.assert_open(p_tenant,received_date::text);
 -- Legacy unallocated payments are never guessed against multiple same-day sales.
 if exists(select 1 from public.sc_payments where tenant_id=p_tenant and sale_date=sale.date and sale_id is null) then raise exception 'มีเงินรับเก่าที่ยังไม่ผูกใบขาย กรุณากระทบยอดก่อนรับเพิ่ม'; end if;
 select coalesce(sum(p.amount),0) into received from public.sc_payments p where p.tenant_id=p_tenant and p.sale_id=sale.id;
 if coalesce(sale.amount_paid,0)+received+amount>coalesce(sale.total_revenue,0) then raise exception 'ยอดรับชำระเกินยอดคงค้าง' using errcode='23514'; end if;
 if coalesce(p_data->>'pay_method','') not in ('เงินสด','โอน','อื่นๆ') then raise exception 'วิธีรับเงินไม่ถูกต้อง'; end if;
 insert into public.sc_payments(tenant_id,sale_id,sale_date,received_date,amount,pay_method,notes,recorded_by,client_request_id)
 values(p_tenant,sale.id,sale.date,received_date,amount,p_data->>'pay_method',coalesce(p_data->>'notes',''),a.display_name,p_request::uuid) returning id into payment_id;
 update public.sc_sales set payment_status=case when coalesce(sale.amount_paid,0)+received+amount>=sale.total_revenue then 'ชำระครบ' else 'ค้างชำระ' end,last_updated=now(),version=version+1 where id=sale.id;
 result:=jsonb_build_object('id',payment_id,'sale_id',sale.id,'replay',false);
 insert into rrs_private.commands values(p_tenant,'payment',p_request,p_actor,p_data,result,now()); return result;
end $$;

create or replace function public.rrs_delete_payment(p_actor uuid,p_tenant uuid,p_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare payment public.sc_payments%rowtype; sale public.sc_sales%rowtype; received numeric;
begin
 perform rrs_private.service_actor(p_actor,p_tenant,array['admin','co_admin','super_admin']);
 select * into payment from public.sc_payments where id=p_id and tenant_id=p_tenant;
 if not found then return jsonb_build_object('replay',true); end if;
 if payment.sale_id is not null then select * into sale from public.sc_sales where id=payment.sale_id and tenant_id=p_tenant for update; end if;
 select * into payment from public.sc_payments where id=p_id and tenant_id=p_tenant for update;
 if not found then return jsonb_build_object('replay',true); end if;
 perform rrs_private.assert_open(p_tenant,payment.received_date::text);
 delete from public.sc_payments where id=p_id and tenant_id=p_tenant;
 if sale.id is not null then
  select coalesce(sum(amount),0) into received from public.sc_payments where tenant_id=p_tenant and sale_id=sale.id;
  update public.sc_sales set payment_status=case when coalesce(sale.amount_paid,0)+received>=sale.total_revenue then 'ชำระครบ' else 'ค้างชำระ' end,last_updated=now(),version=version+1 where id=sale.id;
 end if;
 return jsonb_build_object('id',p_id,'replay',false);
end $$;

create or replace function public.rrs_create_service_order(p_actor uuid,p_tenant uuid,p_request text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles%rowtype; result jsonb; branch uuid; customer uuid; order_id uuid; order_no text; seq integer;
 gross numeric; discount numeric; net numeric; cash numeric:=0; transfer numeric:=0; business_date date; received_at timestamptz;
 line jsonb; selected public.services%rowtype; payment text;
begin
 a:=rrs_private.service_actor(p_actor,p_tenant,array['admin','co_admin','staff','super_admin']);
 result:=rrs_private.replay(p_tenant,p_actor,'order',p_request,p_data); if result is not null then return result; end if;
 branch:=(p_data->>'branch_id')::uuid;
 if not exists(select 1 from public.branches where id=branch and tenant_id=p_tenant and is_active)
  or (replace(a.role::text,'-','_') not in ('admin','super_admin') and a.branch_id is distinct from branch) then raise exception 'ไม่มีสิทธิ์สาขาที่รับงาน' using errcode='42501'; end if;
 gross:=rrs_private.money((p_data->>'gross')::numeric); discount:=rrs_private.money((p_data->>'discount')::numeric); net:=rrs_private.money((p_data->>'net')::numeric);
 business_date:=(p_data->>'date')::date; payment:=p_data->>'payment_method';
 if business_date is null or coalesce(payment,'') not in ('cash','transfer','credit','unpaid') or discount>gross or net<>gross-discount then raise exception 'ข้อมูลรับงานหรือยอดเงินไม่ตรงกัน' using errcode='23514'; end if;
 if length(btrim(coalesce(p_data->>'customer_name',''))) not between 1 and 200 or length(btrim(coalesce(p_data->>'customer_phone',''))) not between 1 and 40 then raise exception 'ชื่อและเบอร์ลูกค้าไม่ถูกต้อง'; end if;
 if jsonb_typeof(p_data->'services')<>'array' or jsonb_array_length(p_data->'services') not between 1 and 100 then raise exception 'รายการบริการไม่ถูกต้อง'; end if;
 if (select sum(rrs_private.money((value->>'price')::numeric)) from jsonb_array_elements(p_data->'services')) is distinct from gross then raise exception 'ยอดรวมบริการไม่ตรงกับยอดรับงาน'; end if;
 if payment<>'unpaid' then perform rrs_private.assert_open(p_tenant,business_date::text); end if;
 if payment='cash' then cash:=net; elsif payment in ('transfer','credit') then transfer:=net; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant::text||(p_data->>'customer_phone'),491));
 select id into customer from public.customers where tenant_id=p_tenant and phone=p_data->>'customer_phone' limit 1;
 if customer is null then insert into public.customers(tenant_id,name,phone) values(p_tenant,p_data->>'customer_name',p_data->>'customer_phone') returning id into customer;
 else update public.customers set name=p_data->>'customer_name',updated_at=now() where id=customer and tenant_id=p_tenant; end if;
 insert into rrs_private.order_counters values(p_tenant,business_date,1) on conflict(tenant_id,day) do update set sequence=rrs_private.order_counters.sequence+1 returning sequence into seq;
 order_no:='SC-'||to_char(business_date,'YYYYMMDD')||'-'||lpad(seq::text,6,'0');
 received_at:=business_date::timestamp at time zone 'Asia/Bangkok';
 insert into public.service_orders(tenant_id,branch_id,customer_id,order_no,customer_name,customer_phone,shoe_brand,shoe_model,shoe_color,shoe_size,total_amount,discount_amount,net_amount,payment_method,payment_status,status,note,created_by,received_at,cash_amount,transfer_amount)
 values(p_tenant,branch,customer,order_no,p_data->>'customer_name',p_data->>'customer_phone',p_data->>'shoe_brand',p_data->>'shoe_model',p_data->>'shoe_color',coalesce(p_data->>'shoe_size','M'),gross,discount,net,payment,
 case when payment='unpaid' then 'unpaid' else 'paid' end,'received',p_data->>'notes',p_actor,received_at,cash,transfer) returning id into order_id;
 for line in select value from jsonb_array_elements(p_data->'services') loop
  if nullif(line->>'id','') is not null then
   select * into selected from public.services where id=(line->>'id')::uuid and tenant_id=p_tenant and is_active;
   if not found then raise exception 'ไม่พบบริการที่เลือกในกิจการนี้' using errcode='42501'; end if;
  end if;
  if coalesce(line->>'name','')='' then raise exception 'ชื่อบริการไม่ถูกต้อง'; end if;
  insert into public.service_order_items(tenant_id,order_id,service_id,service_name,price,quantity)
  values(p_tenant,order_id,nullif(line->>'id','')::uuid,line->>'name',rrs_private.money((line->>'price')::numeric),1);
 end loop;
 if payment<>'unpaid' then
  insert into public.sc_sales(tenant_id,date,size_s,size_m,size_l,size_xl,grand_total,discount,total_revenue,cash_amount,transfer_amount,amount_paid,payment_status,extra_items,recorded_by,last_updated,client_request_id,service_order_id)
  values(p_tenant,business_date,0,0,0,0,gross,discount,net,cash,transfer,net,'ชำระครบ','ใบรับงาน '||order_no,a.display_name,now(),order_id,order_id);
 end if;
 result:=jsonb_build_object('id',order_id,'order_no',order_no,'posted_to_books',payment<>'unpaid','replay',false);
 insert into rrs_private.commands values(p_tenant,'order',p_request,p_actor,p_data,result,now()); return result;
end $$;

-- Explicit internal grants. Service-only RPCs verify the actual actor supplied by the server.
do $$ declare t text; f record; begin
 foreach t in array array['profiles','branches','services','customers','service_orders','service_order_items','sc_sales','sc_payments'] loop
  execute format('grant select on public.%I to rrs_command_owner',t);
  if t not in ('profiles','branches','services') then execute format('grant insert,update,delete on public.%I to rrs_command_owner',t); end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t and c.relkind='r') then
   execute format('drop policy if exists rrs_command_owner_access on public.%I',t);
   execute format('create policy rrs_command_owner_access on public.%I for all to rrs_command_owner using(true) with check(true)',t);
  end if;
 end loop;
 if to_regclass('public.inv_branches') is not null then
  grant select on public.inv_branches to rrs_command_owner;
  drop policy if exists rrs_command_owner_access on public.inv_branches;
  create policy rrs_command_owner_access on public.inv_branches for select to rrs_command_owner using(true);
 end if;
 grant usage,select on all sequences in schema public to rrs_command_owner;
 grant execute on function rrs_private.assert_open(uuid,text) to rrs_command_owner;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname in ('rrs_save_sale','rrs_record_payment','rrs_delete_payment','rrs_create_service_order')) or (n.nspname='rrs_private' and p.proname in ('service_actor','money','replay')) loop
  execute 'alter function '||f.signature||' owner to rrs_command_owner';
  execute 'revoke all on function '||f.signature||' from public,anon,authenticated';
  if f.signature::text like 'rrs_%' or f.signature::text like 'public.rrs_%' then execute 'grant execute on function '||f.signature||' to service_role'; end if;
 end loop;
 revoke create on schema public,rrs_private from rrs_command_owner;
end $$;
notify pgrst,'reload schema';
