-- Run within release-db's transaction. Any unexpected write aborts the release.
do $$ begin
 if has_function_privilege('anon','public.fn_consume_stock_outflow(uuid,uuid,numeric)','execute')
   or has_function_privilege('authenticated','public.fn_consume_stock_outflow(uuid,uuid,numeric)','execute')
   or has_function_privilege('anon','extension_layer.fn_generate_document_number(character varying,character varying,character varying,uuid)','execute') then
   raise exception 'Unsafe RPC grant remains';
 end if;
 if has_table_privilege('authenticated','public.sc_receipt_posts','insert') or has_table_privilege('authenticated','public.sc_receipt_posts','update') then
   raise exception 'Direct ledger writes remain';
 end if;
 if has_table_privilege('authenticated','public.sc_opex','insert') or has_table_privilege('authenticated','public.sc_expense_entries','update')
 or has_table_privilege('authenticated','public.sc_wht_certificates','delete') or has_function_privilege('authenticated','public.rrs_create_expense(uuid,uuid,text,jsonb)','execute')
 or has_function_privilege('anon','public.rrs_delete_expense(uuid,uuid,text,jsonb)','execute') then raise exception 'Expense command boundary missing';end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.profiles'::regclass and tgname='rrs_guard_profile') then raise exception 'Profile guard missing'; end if;
end $$;
do $$ declare actor uuid; begin
 select id into actor from public.profiles where role='admin' and is_active limit 1;
 if actor is null then raise exception 'No active admin for smoke test'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ begin
 begin
  update public.profiles set role='super_admin' where id=auth.uid();
  raise exception 'Profile escalation was permitted';
 exception when insufficient_privilege then null;
 end;
 if exists(select 1 from public.inv_v_item_stock v where not exists(select 1 from public.branches b where b.id=v.branch_id and b.tenant_id=public.fn_current_tenant())) then
  raise exception 'Cross-tenant inventory view rows remain';
 end if;
end $$;
reset role;
do $$ begin
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claims','{}',true);
end $$;
select 'SECURITY_SMOKE_PASS';
