-- Custom expenses: one transaction for source, daily detail, WHT and audit.
-- Existing monthly payroll/rental writers remain separate legacy workflows.
grant create on schema public,rrs_private to rrs_command_owner;
create table rrs_private.wht_counters(tenant_id uuid not null,period text not null,sequence bigint not null,primary key(tenant_id,period));
alter table rrs_private.wht_counters owner to rrs_command_owner;
alter table rrs_private.wht_counters enable row level security;
revoke all on rrs_private.wht_counters from public,anon,authenticated;

-- Allocation happens inside the certificate INSERT transaction for every writer.
create or replace function rrs_private.number_wht_certificate() returns trigger
language plpgsql security definer set search_path='' as $$
declare ym text; n bigint; baseline bigint;
begin
 perform rrs_private.assert_open(new.tenant_id,new.payment_date::text);
 if new.payee_id is not null and not exists(select 1 from public.sc_wht_payees where id=new.payee_id and tenant_id=new.tenant_id) then
  raise exception 'ผู้รับเงินไม่ใช่ของกิจการนี้' using errcode='23514';
 end if;
 if new.legacy_opex_id is not null then
  perform 1 from public.sc_opex where id=new.legacy_opex_id and tenant_id=new.tenant_id and amount=new.gross_amount for key share;
  if not found then raise exception 'ไม่พบค่าใช้จ่ายที่มียอดตรงกันของกิจการนี้' using errcode='23514'; end if;
 end if;
 ym:=to_char(new.payment_date,'YYYYMM');
 -- MAX suffix, never COUNT: deleted historical numbers must not be reused.
 select coalesce(max(substring(certificate_number from '^WHT-[0-9]{6}-([0-9]+)$')::bigint),0)
 into baseline from public.sc_wht_certificates where tenant_id=new.tenant_id and certificate_number like 'WHT-'||ym||'-%';
 insert into rrs_private.wht_counters values(new.tenant_id,ym,baseline+1)
 on conflict(tenant_id,period) do update set sequence=greatest(wht_counters.sequence,baseline)+1 returning sequence into n;
 new.certificate_number:='WHT-'||ym||'-'||lpad(n::text,greatest(4,length(n::text)), '0');
 return new;
end $$;
alter function rrs_private.number_wht_certificate() owner to rrs_command_owner;
revoke all on function rrs_private.number_wht_certificate() from public,anon,authenticated;
create trigger rrs_number_wht_certificate before insert on public.sc_wht_certificates for each row execute function rrs_private.number_wht_certificate();
-- NOT VALID preserves old data; all new links and parent deletes are enforced.
alter table public.sc_wht_certificates add constraint rrs_wht_opex_fk foreign key(legacy_opex_id) references public.sc_opex(id) on delete restrict not valid;

create or replace function public.rrs_create_expense(p_actor uuid,p_tenant uuid,p_request text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles%rowtype; result jsonb; expense_id bigint; entry_id bigint; payee uuid; cert text;
 business_date date; base numeric; vat numeric; gross numeric; tax numeric; vr numeric; wr numeric;
 category_key text; category_label text; title text; method text; withholding boolean;
begin
 a:=rrs_private.service_actor(p_actor,p_tenant,array['admin','co_admin','super_admin']);
 result:=rrs_private.replay(p_tenant,p_actor,'expense',p_request,p_data);if result is not null then return result;end if;
 business_date:=(p_data->>'date')::date;
 if business_date is null or business_date::text is distinct from p_data->>'date' then raise exception 'วันที่ค่าใช้จ่ายไม่ถูกต้อง' using errcode='22023';end if;
 perform rrs_private.assert_open(p_tenant,business_date::text);
 base:=rrs_private.money((p_data->>'amount')::numeric);
 if base<=0 then raise exception 'จำนวนเงินต้องมากกว่า 0' using errcode='22023';end if;
 title:=btrim(p_data->>'title');method:=btrim(p_data->>'pay_method');
 if coalesce(length(title),0) not between 1 and 500 or coalesce(length(method),0) not between 1 and 100 then raise exception 'ชื่อรายการหรือช่องทางจ่ายไม่ถูกต้อง' using errcode='22023';end if;
 select key,short_label into category_key,category_label from public.sc_expense_categories where key=p_data->>'category_key' and is_active;
 if not found then raise exception 'หมวดค่าใช้จ่ายไม่พร้อมใช้งาน' using errcode='22023';end if;
 withholding:=coalesce((p_data->>'withhold')::boolean,false);
 vr:=coalesce((p_data->>'vat_rate')::numeric,0);wr:=coalesce((p_data->>'wht_rate')::numeric,0);
 if vr not in (0,7) or wr not in (0,1,2,3,5) or (not withholding and (vr<>0 or wr<>0)) or (withholding and wr=0) then raise exception 'อัตราภาษีไม่ถูกต้อง' using errcode='22023';end if;
 vat:=round(base*vr/100,2);gross:=base+vat;tax:=round(base*wr/100,2);
 if gross>=10000000 then raise exception 'ยอดรวมค่าใช้จ่ายต้องน้อยกว่า 10,000,000 บาท' using errcode='22023';end if;
 insert into public.sc_opex(tenant_id,month,category,name,amount,pay_method,recorded_by,key,last_updated)
 values(p_tenant,to_char(business_date,'MM/YYYY'),category_label,title,gross,method,a.display_name,'custom_'||p_request,now()) returning id into expense_id;
 insert into public.sc_expense_entries(tenant_id,entry_date,amount,category,title,pay_method,legacy_opex_id,created_by)
 values(p_tenant,business_date,gross,category_key,title,method,expense_id,p_actor) returning id into entry_id;
 if withholding and tax>0 then
  payee:=nullif(p_data->>'payee_id','')::uuid;
  if payee is not null then
   perform 1 from public.sc_wht_payees where id=payee and tenant_id=p_tenant and is_active;
   if not found then raise exception 'ไม่พบผู้รับเงินของกิจการนี้' using errcode='23514';end if;
  else
   if coalesce(p_data->>'payee_tax_id','') !~ '^[0-9]{13}$' or coalesce(length(btrim(p_data->>'payee_name')),0) not between 1 and 300 or coalesce(p_data->>'payee_kind','') not in ('person','juristic') or length(coalesce(p_data->>'payee_address',''))>2000 then raise exception 'ข้อมูลผู้รับเงินไม่ถูกต้อง' using errcode='22023';end if;
   insert into public.sc_wht_payees(tenant_id,kind,name,tax_id,address,is_active)
   values(p_tenant,p_data->>'payee_kind',btrim(p_data->>'payee_name'),p_data->>'payee_tax_id',p_data->>'payee_address',true)
   on conflict(tenant_id,tax_id) do update set kind=excluded.kind,name=excluded.name,address=excluded.address,is_active=true returning id into payee;
  end if;
  insert into public.sc_wht_certificates(tenant_id,payee_id,direction,form_type,income_type_code,income_type_label,certificate_number,payment_date,base_amount,vat_amount,gross_amount,wht_rate,tax_amount,net_payment,legacy_opex_id,created_by)
  select p_tenant,payee,'payable',case kind when 'juristic' then 'PND53' else 'PND3' end,
   case category_key when 'building_rent' then '5' else '6' end,
   case category_key when 'building_rent' then 'ค่าเช่าอาคาร/อสังหาริมทรัพย์ (มาตรา 40(5))' else 'ค่าจ้างทำของ / ค่าบริการ (มาตรา 40(6))' end,
   '',business_date,base,vat,gross,wr,tax,gross-tax,expense_id,p_actor from public.sc_wht_payees where id=payee returning certificate_number into cert;
 end if;
 result:=jsonb_build_object('id',expense_id,'entry_id',entry_id,'certificate_number',cert,'certificateIssued',cert is not null,'replay',false);
 insert into public.sc_audit_logs(tenant_id,action,entity,entity_id,actor_id,actor_name,detail)
 values(p_tenant,'CREATE','expense',expense_id::text,p_actor,a.display_name,jsonb_build_object('request_id',p_request,'date',business_date,'amount',gross,'vat_amount',vat,'wht_amount',tax,'net_payment',gross-tax,'entry_id',entry_id,'certificate_number',cert));
 insert into rrs_private.commands values(p_tenant,'expense',p_request,p_actor,p_data,result,now());return result;
end $$;

create or replace function public.rrs_delete_expense(p_actor uuid,p_tenant uuid,p_request text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles%rowtype; e public.sc_opex%rowtype; result jsonb;
begin
 a:=rrs_private.service_actor(p_actor,p_tenant,array['admin','co_admin','super_admin']);
 result:=rrs_private.replay(p_tenant,p_actor,'expense_delete',p_request,p_data);if result is not null then return result;end if;
 select * into e from public.sc_opex where id=(p_data->>'id')::bigint and tenant_id=p_tenant for update;
 if not found then raise exception 'ไม่พบค่าใช้จ่ายของกิจการนี้' using errcode='23514';end if;
 perform rrs_private.assert_open(p_tenant,e.month);
 if exists(select 1 from public.sc_wht_certificates where legacy_opex_id=e.id) then raise exception 'รายการนี้ออกหนังสือรับรอง 50 ทวิแล้ว กรุณาให้ผู้ทำบัญชีตรวจแก้เอกสารก่อน ห้ามลบหลักฐานเดิม' using errcode='23514';end if;
 delete from public.sc_expense_entries where legacy_opex_id=e.id and tenant_id=p_tenant;
 delete from public.sc_opex where id=e.id and tenant_id=p_tenant;
 insert into public.sc_audit_logs(tenant_id,action,entity,entity_id,actor_id,actor_name,detail)
 values(p_tenant,'DELETE','expense',e.id::text,p_actor,a.display_name,jsonb_build_object('request_id',p_request,'month',e.month,'name',e.name,'amount',e.amount));
 result:=jsonb_build_object('id',e.id,'replay',false);
 insert into rrs_private.commands values(p_tenant,'expense_delete',p_request,p_actor,p_data,result,now());return result;
end $$;

-- Receiving rental WHT evidence is also atomic; existing evidence is preserved.
create or replace function public.rrs_record_rental_wht(p_actor uuid,p_tenant uuid,p_request text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles%rowtype; room public.sc_rental_records%rowtype; result jsonb; base numeric; rate numeric; tax numeric; payee uuid; cert text; v_name text; v_tax_id text; v_kind text; payment_date date;
begin
 a:=rrs_private.service_actor(p_actor,p_tenant,array['admin','co_admin','super_admin']);
 result:=rrs_private.replay(p_tenant,p_actor,'rental_wht',p_request,p_data);if result is not null then return result;end if;
 select * into room from public.sc_rental_records where id=(p_data->>'id')::bigint and tenant_id=p_tenant for update;
 if not found then raise exception 'ไม่พบรายการค่าเช่าห้องของกิจการนี้' using errcode='23514';end if;
 perform rrs_private.assert_open(p_tenant,room.month);
 if room.month !~ '^(0[1-9]|1[0-2])/[0-9]{4}$' then raise exception 'งวดค่าเช่าไม่ถูกต้อง' using errcode='22023';end if;
 payment_date:=(right(room.month,4)||'-'||left(room.month,2)||'-01')::date;
 if exists(select 1 from public.sc_wht_certificates where rental_record_id=room.id) then raise exception 'รายการนี้มีหนังสือรับรองหัก ณ ที่จ่ายแล้ว กรุณาให้ผู้ทำบัญชีตรวจแก้ ห้ามแทนที่หลักฐานเดิม' using errcode='23514';end if;
 base:=rrs_private.money(room.income_amount);rate:=(p_data->>'wht_rate')::numeric;
 v_name:=btrim(p_data->>'name');v_tax_id:=coalesce(p_data->>'tax_id','');v_kind:=p_data->>'kind';
 if base<=0 or base>=10000000 or rate is null or rate not in (0,1,2,3,5) or coalesce(length(v_name),0) not between 1 and 300 or v_kind not in ('person','juristic') or (rate>0 and v_tax_id !~ '^[0-9]{13}$') then raise exception 'ข้อมูลหัก ณ ที่จ่ายค่าเช่าไม่ถูกต้อง' using errcode='22023';end if;
 tax:=round(base*rate/100,2);
 update public.sc_rental_records set tenant_name=v_name,tenant_tax_id=nullif(v_tax_id,''),wht_rate=rate,wht_withheld=tax where id=room.id and tenant_id=p_tenant;
 if tax>0 then
  insert into public.sc_wht_payees(tenant_id,kind,name,tax_id,is_active) values(p_tenant,v_kind,v_name,v_tax_id,true)
  on conflict(tenant_id,tax_id) do update set kind=excluded.kind,name=excluded.name,is_active=true returning id into payee;
  insert into public.sc_wht_certificates(tenant_id,payee_id,direction,form_type,income_type_code,income_type_label,certificate_number,payment_date,base_amount,vat_amount,gross_amount,wht_rate,tax_amount,net_payment,rental_record_id,created_by)
  values(p_tenant,payee,'receivable',case v_kind when 'juristic' then 'PND53' else 'PND3' end,'5','ค่าเช่าอาคาร/อสังหาริมทรัพย์ (มาตรา 40(5))','',payment_date,base,0,base,rate,tax,base-tax,room.id,p_actor) returning certificate_number into cert;
 end if;
 result:=jsonb_build_object('id',room.id,'certificate_number',cert,'replay',false);
 insert into public.sc_audit_logs(tenant_id,action,entity,entity_id,actor_id,actor_name,detail)
 values(p_tenant,'UPDATE','expense',room.id::text,p_actor,a.display_name,jsonb_build_object('request_id',p_request,'kind','rental_wht_receivable','withheld',tax,'cash_in',base-tax,'income',base,'certificate_number',cert));
 insert into rrs_private.commands values(p_tenant,'rental_wht',p_request,p_actor,p_data,result,now());return result;
end $$;

-- Browsers cannot bypass command validation. Existing server-side monthly writers use service_role.
revoke insert,update,delete on public.sc_opex,public.sc_expense_entries,public.sc_wht_certificates,public.sc_wht_payees from authenticated,anon;
do $$ declare t text; begin
 foreach t in array array['sc_opex','sc_expense_entries','sc_wht_payees','sc_wht_certificates','sc_audit_logs','sc_rental_records'] loop
  execute format('grant select,insert on public.%I to rrs_command_owner',t);
  execute format('drop policy if exists rrs_expense_owner on public.%I',t);
  execute format('create policy rrs_expense_owner on public.%I for all to rrs_command_owner using(true) with check(true)',t);
 end loop;
end $$;
grant update(id) on public.sc_opex to rrs_command_owner;
grant delete on public.sc_opex,public.sc_expense_entries to rrs_command_owner;
grant update on public.sc_wht_payees,public.sc_rental_records to rrs_command_owner;
grant select on public.sc_expense_categories to rrs_command_owner;
create policy rrs_expense_categories_owner on public.sc_expense_categories for select to rrs_command_owner using(true);
grant usage,select on all sequences in schema public to rrs_command_owner;
alter function public.rrs_record_rental_wht(uuid,uuid,text,jsonb) owner to rrs_command_owner;
revoke all on function public.rrs_record_rental_wht(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.rrs_record_rental_wht(uuid,uuid,text,jsonb) to service_role;
alter function public.rrs_create_expense(uuid,uuid,text,jsonb) owner to rrs_command_owner;
alter function public.rrs_delete_expense(uuid,uuid,text,jsonb) owner to rrs_command_owner;
revoke all on function public.rrs_create_expense(uuid,uuid,text,jsonb),public.rrs_delete_expense(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.rrs_create_expense(uuid,uuid,text,jsonb),public.rrs_delete_expense(uuid,uuid,text,jsonb) to service_role;
revoke create on schema public,rrs_private from rrs_command_owner;
notify pgrst,'reload schema';
