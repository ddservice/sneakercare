grant create on schema public to rrs_command_owner;
grant select on public.sc_opex,public.sc_expense_entries,public.inv_purchase_receipts to rrs_command_owner;
drop policy if exists rrs_command_owner_read on public.sc_opex;
create policy rrs_command_owner_read on public.sc_opex for select to rrs_command_owner using(true);
drop policy if exists rrs_command_owner_read on public.sc_expense_entries;
create policy rrs_command_owner_read on public.sc_expense_entries for select to rrs_command_owner using(true);
drop policy if exists rrs_command_owner_read on public.inv_purchase_receipts;
create policy rrs_command_owner_read on public.inv_purchase_receipts for select to rrs_command_owner using(true);

do $$declare t text; begin
 foreach t in array array['sc_wht_certificates','sc_wht_payees','sc_receipt_posts','sc_settings','sc_expenses'] loop
  execute format('grant select on public.%I to rrs_command_owner',t);
  execute format('drop policy if exists rrs_command_owner_read on public.%I',t);
  execute format('create policy rrs_command_owner_read on public.%I for select to rrs_command_owner using(true)',t);
 end loop;
end $$;

create or replace function public.rrs_accountant_packet(p_actor uuid,p_tenant uuid,p_month text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare first_day date; next_day date; balances jsonb;
begin
 perform rrs_private.service_actor(p_actor,p_tenant,array['admin','super_admin']);
 if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'เลือกเดือน YYYY-MM'; end if;
 first_day:=(p_month||'-01')::date; next_day:=(first_day+interval '1 month')::date;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into balances from (
  select s.id sale_id,s.date,coalesce(s.total_revenue,s.grand_total-coalesce(s.discount,0),0) total_revenue,coalesce(s.amount_paid,coalesce(s.cash_amount,0)+coalesce(s.transfer_amount,0)) amount_paid,
   coalesce((select sum(p.amount) from public.sc_payments p where p.sale_id=s.id and p.tenant_id=p_tenant and p.received_date<first_day),0) receipts_before,
   coalesce((select sum(p.amount) from public.sc_payments p where p.sale_id=s.id and p.tenant_id=p_tenant and p.received_date>=first_day and p.received_date<next_day),0) receipts_month,
   coalesce(s.total_revenue,s.grand_total-coalesce(s.discount,0),0)-coalesce(s.amount_paid,coalesce(s.cash_amount,0)+coalesce(s.transfer_amount,0))-coalesce((select sum(p.amount) from public.sc_payments p where p.sale_id=s.id and p.tenant_id=p_tenant and p.received_date<next_day),0) balance_end
  from public.sc_sales s where s.tenant_id=p_tenant and s.date<next_day
 ) x;
 return jsonb_build_object('month',p_month,'tenant_id',p_tenant,'generated_at',now(),
  'sales',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('total_revenue',coalesce(s.total_revenue,s.grand_total-coalesce(s.discount,0),0),'amount_paid',coalesce(s.amount_paid,coalesce(s.cash_amount,0)+coalesce(s.transfer_amount,0)),'legacy_missing_amount',s.total_revenue is null or s.amount_paid is null) order by s.date,s.id) from public.sc_sales s where tenant_id=p_tenant and date>=first_day and date<next_day),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(p order by p.received_date,p.id) from public.sc_payments p where tenant_id=p_tenant and received_date>=first_day and received_date<next_day),'[]'::jsonb),
  'balances',balances,
  'unmatched',coalesce((select jsonb_agg(p) from public.sc_payments p where tenant_id=p_tenant and sale_id is null and received_date<next_day),'[]'::jsonb),
  'documents',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('contact',to_jsonb(c))) from extension_layer.ext_documents d left join extension_layer.ext_contacts c on c.id=d.contact_id and c.tenant_id=d.tenant_id where d.tenant_id=p_tenant and d.issue_date>=first_day and d.issue_date<next_day),'[]'::jsonb),
  'document_lines',coalesce((select jsonb_agg(l) from extension_layer.ext_document_items l join extension_layer.ext_documents d on d.id=l.document_id and d.tenant_id=l.tenant_id where d.tenant_id=p_tenant and d.issue_date>=first_day and d.issue_date<next_day),'[]'::jsonb),
  'expense_entries',coalesce((select jsonb_agg(e) from public.sc_expense_entries e where tenant_id=p_tenant and entry_date>=first_day and entry_date<next_day),'[]'::jsonb),
  'opex_source',coalesce((select jsonb_agg(e) from public.sc_opex e where tenant_id=p_tenant and month in (p_month,to_char(first_day,'MM/YYYY'))),'[]'::jsonb),
  'wht_certificates',coalesce((select jsonb_agg(to_jsonb(w)||jsonb_build_object('payee',to_jsonb(p))) from public.sc_wht_certificates w left join public.sc_wht_payees p on p.id=w.payee_id and p.tenant_id=w.tenant_id where w.tenant_id=p_tenant and w.payment_date>=first_day and w.payment_date<next_day),'[]'::jsonb),
  'purchase_vat_settings',coalesce((select jsonb_agg(jsonb_build_object('key',key,'value',value)) from public.sc_settings where tenant_id=p_tenant and key='purchase_vat_lines'),'[]'::jsonb),
  'receipt_posts_all',coalesce((select jsonb_agg(p) from public.sc_receipt_posts p where tenant_id=p_tenant),'[]'::jsonb),
  'legacy_expenses',coalesce((select jsonb_agg(e) from public.sc_expenses e where tenant_id=p_tenant and date>=first_day and date<next_day),'[]'::jsonb),
  'purchase_receipts',coalesce((select jsonb_agg(p) from public.inv_purchase_receipts p where tenant_id=p_tenant and purchase_date>=first_day and purchase_date<next_day),'[]'::jsonb)
 );
end $$;
alter function public.rrs_accountant_packet(uuid,uuid,text) owner to rrs_command_owner;
revoke all on function public.rrs_accountant_packet(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.rrs_accountant_packet(uuid,uuid,text) to service_role;
revoke create on schema public from rrs_command_owner;
notify pgrst,'reload schema';

-- Automatic slip verification is not connected; clients cannot manufacture verification records.
revoke insert,update,delete,truncate,trigger,references on extension_layer.ext_slip_verifications from public,anon,authenticated;
