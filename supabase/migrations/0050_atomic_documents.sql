grant create on schema public,rrs_private to rrs_command_owner;

create or replace function rrs_private.next_document_number(p_tenant uuid,p_type text,p_date date)
returns text language plpgsql set search_path='' as $$
declare v_prefix text; seq integer; date_code text;
begin
 v_prefix:=case p_type when 'QUOTATION' then 'QA' when 'DO' then 'DO' when 'INVOICE' then 'INV' when 'BILLING_NOTE' then 'BL' when 'TAX_INVOICE' then 'TAX' when 'RECEIPT' then 'REC' else null end;
 if v_prefix is null or p_date is null then raise exception 'เอกสารประเภทนี้ยังออกเลขทางการไม่ได้'; end if;
 date_code:=to_char(p_date,'YYYYMMDD');
 insert into extension_layer.ext_numbering_sequences(tenant_id,doc_type,prefix,year_month,current_sequence)
 values(p_tenant,p_type,v_prefix,date_code,1) on conflict(tenant_id,doc_type,prefix,year_month)
 do update set current_sequence=extension_layer.ext_numbering_sequences.current_sequence+1 returning current_sequence into seq;
 return v_prefix||'-'||date_code||'-'||lpad(seq::text,greatest(4,length(seq::text)),'0');
end $$;

create or replace function public.rrs_create_document(p_actor uuid,p_tenant uuid,p_request text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles%rowtype; result jsonb; branch uuid; registered boolean; doc_type text; issue_date date; rate numeric; subtotal numeric:=0; vat numeric; grand numeric;
 line jsonb; quantity numeric; price numeric; discount numeric; line_total numeric; contact uuid; doc uuid; number text; share text;
 parent extension_layer.ext_documents%rowtype; ref extension_layer.ext_documents%rowtype; source_id uuid; correction boolean; existing_credit numeric; existing_debit numeric; ref_id text; sort_no integer:=0;
begin
 a:=rrs_private.service_actor(p_actor,p_tenant,array['admin','co_admin','super_admin']);
 result:=rrs_private.replay(p_tenant,p_actor,'document',p_request,p_data); if result is not null then return result; end if;
 branch:=(p_data->>'branch_id')::uuid; doc_type:=p_data->>'doc_type'; issue_date:=(p_data->>'issue_date')::date;
 select vat_registered into registered from public.branches where id=branch and tenant_id=p_tenant and is_active;
 if not found or (replace(a.role::text,'-','_')='co_admin' and a.branch_id is distinct from branch) then raise exception 'เลือกสาขาที่มีสิทธิ์ก่อนออกเอกสาร' using errcode='42501'; end if;
 if coalesce(doc_type,'') not in ('QUOTATION','DO','INVOICE','BILLING_NOTE','TAX_INVOICE','RECEIPT','CREDIT_NOTE','DEBIT_NOTE') or issue_date is null then raise exception 'ประเภทหรือวันที่เอกสารไม่ถูกต้อง'; end if;
 perform rrs_private.assert_open(p_tenant,issue_date::text);
 correction:=doc_type in ('CREDIT_NOTE','DEBIT_NOTE');
 if doc_type='TAX_INVOICE' and not coalesce(registered,false) then raise exception 'สาขานี้ยังไม่จด VAT'; end if;
 rate:=case when not coalesce(registered,false) or doc_type in ('QUOTATION','DO') then 0 when doc_type='TAX_INVOICE' then 7
   when coalesce((p_data->>'charge_vat')::boolean,doc_type<>'RECEIPT') then 7 else 0 end;
 source_id:=nullif(p_data->>'source_doc_id','')::uuid;
 if source_id is not null then
  select * into parent from extension_layer.ext_documents where id=source_id and tenant_id=p_tenant for update;
  if not found or parent.status='VOID' then raise exception 'ไม่พบเอกสารต้นทางที่ใช้งานได้'; end if;
  if parent.branch_id is not null and parent.branch_id<>branch then raise exception 'เลือกสาขาเดียวกับเอกสารต้นทางก่อนแปลงเอกสาร'; end if;
  if correction then
   if parent.doc_type not in ('INVOICE','TAX_INVOICE','RECEIPT') then raise exception 'เอกสารต้นทางออกใบลดหนี้/เพิ่มหนี้ไม่ได้'; end if;
   rate:=parent.vat_rate;
  elsif coalesce((p_data->>'convert_source')::boolean,false) then
   if parent.status='CONVERTED' then raise exception 'เอกสารนี้ถูกแปลงแล้ว กรุณาโหลดใหม่'; end if;
   if not ((parent.doc_type='QUOTATION' and doc_type in ('DO','INVOICE')) or (parent.doc_type='DO' and doc_type in ('BILLING_NOTE','INVOICE'))
    or (parent.doc_type='INVOICE' and doc_type in ('BILLING_NOTE','RECEIPT','TAX_INVOICE')) or (parent.doc_type='BILLING_NOTE' and doc_type in ('RECEIPT','TAX_INVOICE'))
    or (parent.doc_type='RECEIPT' and doc_type='TAX_INVOICE')) then raise exception 'แปลงเอกสารตามลำดับนี้ไม่ได้'; end if;
  end if;
 elsif correction then raise exception 'ใบลดหนี้/เพิ่มหนี้ต้องอ้างเอกสารต้นทาง'; end if;
 if jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 500 then raise exception 'ต้องมีรายการเอกสาร 1–500 รายการ'; end if;
 for line in select value from jsonb_array_elements(p_data->'items') loop
  quantity:=(line->>'quantity')::numeric; price:=rrs_private.money((line->>'unit_price')::numeric); discount:=rrs_private.money((line->>'discount')::numeric);
  if quantity is null or quantity::text in ('NaN','Infinity','-Infinity') or quantity<=0 or quantity>999999999 or quantity<>round(quantity,3) or length(btrim(coalesce(line->>'name',''))) not between 1 and 500 then raise exception 'ชื่อหรือจำนวนรายการไม่ถูกต้อง'; end if;
  line_total:=rrs_private.money(round(quantity*price-discount,2));
  if (line->>'total')::numeric is distinct from line_total then raise exception 'ยอดรายการไม่ตรงกับจำนวน ราคา และส่วนลด' using errcode='23514'; end if;
  subtotal:=subtotal+line_total;
 end loop;
 subtotal:=rrs_private.money(subtotal); if subtotal<=0 then raise exception 'ยอดเอกสารต้องมากกว่า 0'; end if;
 vat:=round(subtotal*rate/100,2); grand:=rrs_private.money(subtotal+vat);
 if correction and doc_type='CREDIT_NOTE' then
  select coalesce(sum(grand_total) filter(where d.doc_type='CREDIT_NOTE'),0),coalesce(sum(grand_total) filter(where d.doc_type='DEBIT_NOTE'),0) into existing_credit,existing_debit
  from extension_layer.ext_documents d where d.tenant_id=p_tenant and d.ref_parent_doc_id=parent.id and d.status<>'VOID';
  if existing_credit+grand>parent.grand_total+existing_debit then raise exception 'ยอดลดหนี้เกินยอดเอกสารต้นทาง' using errcode='23514'; end if;
 end if;
 if length(btrim(coalesce(p_data#>>'{contact,company_name}',''))) not between 1 and 300 then raise exception 'ระบุชื่อลูกค้า'; end if;
 -- A per-document contact snapshot prevents future edits from changing old invoices.
 insert into extension_layer.ext_contacts(tenant_id,company_name,tax_id,branch_code,address,phone,email)
 values(p_tenant,p_data#>>'{contact,company_name}',p_data#>>'{contact,tax_id}',coalesce(p_data#>>'{contact,branch_code}','00000'),p_data#>>'{contact,address}',p_data#>>'{contact,phone}',p_data#>>'{contact,email}') returning id into contact;
 number:=case when doc_type in ('TAX_INVOICE','RECEIPT') then rrs_private.next_document_number(p_tenant,doc_type,issue_date)
  else 'DRAFT-'||to_char(issue_date,'YYYYMMDD')||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,12) end;
 share:='doc_'||replace(gen_random_uuid()::text,'-','');
 insert into extension_layer.ext_documents(tenant_id,branch_id,doc_type,doc_number,contact_id,issue_date,due_date,credit_term_days,status,subtotal_amount,discount_amount,vat_rate,vat_amount,grand_total,promptpay_payload,share_token,notes,ref_parent_doc_id,ref_parent_doc_number)
 values(p_tenant,branch,doc_type,number,contact,issue_date,nullif(p_data->>'due_date','')::date,coalesce((p_data->>'credit_term_days')::integer,0),'DRAFT',subtotal,0,rate,vat,grand,p_data->>'promptpay_payload',share,p_data->>'notes',source_id,parent.doc_number) returning id into doc;
 for line in select value from jsonb_array_elements(p_data->'items') loop
  insert into extension_layer.ext_document_items(tenant_id,document_id,item_name,quantity,unit_price,discount,total_line_amount,sort_order)
  values(p_tenant,doc,line->>'name',(line->>'quantity')::numeric,(line->>'unit_price')::numeric,(line->>'discount')::numeric,(line->>'total')::numeric,sort_no);
  sort_no:=sort_no+1;
 end loop;
 for ref_id in select value from jsonb_array_elements_text(coalesce(p_data->'billing_refs','[]'::jsonb)) order by value loop
  select * into ref from extension_layer.ext_documents d where d.id=ref_id::uuid and d.tenant_id=p_tenant and d.doc_type='DO' and d.status not in ('VOID','CONVERTED') for update;
  if not found then raise exception 'ใบส่งของถูกวางบิลแล้ว หรือไม่ใช่ของกิจการนี้'; end if;
  if ref.branch_id is distinct from branch then raise exception 'ใบส่งของอยู่คนละสาขา'; end if;
  if exists(select 1 from extension_layer.ext_billing_references r join extension_layer.ext_documents b on b.id=r.billing_note_id where r.ref_doc_id=ref.id and b.status<>'VOID') then raise exception 'ใบส่งของนี้ถูกวางบิลแล้ว'; end if;
  insert into extension_layer.ext_billing_references(tenant_id,billing_note_id,ref_doc_id,ref_doc_type,ref_doc_number,ref_date,total_amount,balance_due)
   values(p_tenant,doc,ref.id,ref.doc_type,ref.doc_number,ref.issue_date,ref.grand_total,ref.grand_total);
  update extension_layer.ext_documents set status='CONVERTED' where id=ref.id;
 end loop;
 if source_id is not null and not correction and coalesce((p_data->>'convert_source')::boolean,false) then update extension_layer.ext_documents set status='CONVERTED' where id=source_id; end if;
 result:=jsonb_build_object('id',doc,'doc_number',number,'share_token',share,'replay',false);
 insert into rrs_private.commands values(p_tenant,'document',p_request,p_actor,p_data,result,now()); return result;
end $$;

create or replace function public.rrs_issue_document(p_actor uuid,p_tenant uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare doc extension_layer.ext_documents%rowtype; number text; a public.profiles%rowtype;
begin
 a:=rrs_private.service_actor(p_actor,p_tenant,array['admin','co_admin','super_admin']);
 select * into doc from extension_layer.ext_documents where id=p_id and tenant_id=p_tenant for update;
 if found and replace(a.role::text,'-','_')='co_admin' and doc.branch_id is distinct from a.branch_id then raise exception 'ไม่มีสิทธิ์เอกสารสาขานี้' using errcode='42501'; end if;
 if not found or doc.status='VOID' then raise exception 'ไม่พบเอกสารที่ออกเลขได้'; end if;
 if doc.doc_type in ('CREDIT_NOTE','DEBIT_NOTE') then raise exception 'ใบลดหนี้/เพิ่มหนี้ยังเป็นร่าง ต้องให้สำนักงานบัญชีตรวจและออกเอกสารทางการ'; end if;
 if doc.doc_number not like 'DRAFT-%' then return jsonb_build_object('doc_number',doc.doc_number,'replay',true); end if;
 perform rrs_private.assert_open(p_tenant,doc.issue_date::text);
 if not exists(select 1 from extension_layer.ext_document_items where document_id=doc.id and tenant_id=p_tenant) then raise exception 'เอกสารไม่มีรายละเอียด ออกเลขไม่ได้'; end if;
 number:=rrs_private.next_document_number(p_tenant,doc.doc_type,doc.issue_date);
 update extension_layer.ext_documents set doc_number=number where id=doc.id;
 return jsonb_build_object('doc_number',number,'replay',false);
end $$;

create or replace function public.rrs_document_lifecycle(p_actor uuid,p_tenant uuid,p_id uuid,p_action text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare doc extension_layer.ext_documents%rowtype; referenced boolean; a public.profiles%rowtype;
begin
 a:=rrs_private.service_actor(p_actor,p_tenant,array['admin','co_admin','super_admin']);
 select * into doc from extension_layer.ext_documents where id=p_id and tenant_id=p_tenant for update;
 if found and replace(a.role::text,'-','_')='co_admin' and doc.branch_id is distinct from a.branch_id then raise exception 'ไม่มีสิทธิ์เอกสารสาขานี้' using errcode='42501'; end if;
 if not found then raise exception 'ไม่พบเอกสาร'; end if;
 perform rrs_private.assert_open(p_tenant,doc.issue_date::text);
 referenced:=exists(select 1 from extension_layer.ext_billing_references where ref_doc_id=doc.id)
  or exists(select 1 from extension_layer.ext_documents where ref_parent_doc_id=doc.id and status<>'VOID');
 if p_action='delete' then
  if doc.status<>'DRAFT' or doc.doc_number not like 'DRAFT-%' or referenced or doc.doc_type in ('TAX_INVOICE','RECEIPT','CREDIT_NOTE','DEBIT_NOTE') then raise exception 'เอกสารมีเลขหรือถูกอ้างแล้ว ใช้ยกเลิกแทนลบ'; end if;
  delete from extension_layer.ext_billing_references where billing_note_id=doc.id and tenant_id=p_tenant;
  delete from extension_layer.ext_document_items where document_id=doc.id and tenant_id=p_tenant;
  delete from extension_layer.ext_documents where id=doc.id and tenant_id=p_tenant;
 elsif p_action='void' then
  if doc.status='VOID' then return jsonb_build_object('doc_number',doc.doc_number,'replay',true); end if;
  if length(btrim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'ระบุเหตุผลยกเลิกไม่เกิน 500 ตัวอักษร'; end if;
  if not referenced and doc.status='DRAFT' and doc.doc_number like 'DRAFT-%' and doc.doc_type not in ('TAX_INVOICE','RECEIPT','CREDIT_NOTE','DEBIT_NOTE') then raise exception 'ฉบับร่างนี้ลบได้ ไม่ต้องยกเลิก'; end if;
  update extension_layer.ext_documents set status='VOID',notes=coalesce(notes,'')||chr(10)||'[ยกเลิก] '||btrim(p_reason) where id=doc.id;
 else raise exception 'คำสั่งเอกสารไม่ถูกต้อง'; end if;
 return jsonb_build_object('doc_number',doc.doc_number,'replay',false);
end $$;

do $$ declare t text; f record; begin
 grant usage on schema extension_layer to rrs_command_owner;
 foreach t in array array['ext_documents','ext_document_items','ext_contacts','ext_numbering_sequences','ext_billing_references'] loop
  execute format('grant select,insert,update,delete on extension_layer.%I to rrs_command_owner',t);
  execute format('drop policy if exists rrs_command_owner_access on extension_layer.%I',t);
  execute format('create policy rrs_command_owner_access on extension_layer.%I for all to rrs_command_owner using(true) with check(true)',t);
  execute format('revoke insert,update,delete,truncate,trigger,references on extension_layer.%I from anon,authenticated',t);
 end loop;
 grant usage,select on all sequences in schema extension_layer to rrs_command_owner;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname in ('rrs_create_document','rrs_issue_document','rrs_document_lifecycle')) or (n.nspname='rrs_private' and p.proname='next_document_number') loop
  execute 'alter function '||f.signature||' owner to rrs_command_owner';
  execute 'revoke all on function '||f.signature||' from public,anon,authenticated';
  if f.signature::text not like '%rrs_private.%' then execute 'grant execute on function '||f.signature||' to service_role'; end if;
 end loop;
 revoke create on schema public,rrs_private from rrs_command_owner;
end $$;
notify pgrst,'reload schema';
