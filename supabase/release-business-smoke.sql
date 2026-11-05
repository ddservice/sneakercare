-- Synthetic commands; every row and counter-table change is rolled back to the savepoint.
create temp table release_baseline on commit drop as select
 (select count(*) from public.sc_sales) sales,
 (select count(*) from public.sc_payments) payments,
 (select count(*) from public.service_orders) orders,
 (select count(*) from public.customers) customers,
 (select count(*) from extension_layer.ext_documents) documents,
 (select count(*) from public.inv_purchase_receipts) purchases,
 (select count(*) from public.inv_stock_transactions) stock,
 (select count(*) from public.sc_opex) opex,
 (select count(*) from public.sc_expense_entries) expense_entries,
 (select count(*) from public.sc_wht_payees) payees,
 (select count(*) from public.sc_rental_records) rentals,
 (select count(*) from public.sc_wht_certificates) wht,
 (select count(*) from public.sc_audit_logs) audit,
 (select count(*) from rrs_private.commands) commands,
 (select coalesce(sum(sequence),0) from rrs_private.wht_counters) wht_sequence;
create temp table release_actor on commit drop as select p.id actor,p.tenant_id tenant,b.id branch
 from public.profiles p join public.branches b on b.tenant_id=p.tenant_id
 where p.role::text='admin' and p.is_active and b.is_active limit 1;
do $$begin if not exists(select 1 from release_actor) then raise exception 'No active shop admin for rolled-back smoke'; end if; end$$;
grant select on release_actor to authenticated,service_role;
savepoint business_smoke;
do $$declare a record; begin select * into a from release_actor; perform set_config('request.jwt.claim.sub',a.actor::text,true); perform set_config('request.jwt.claims',jsonb_build_object('sub',a.actor,'role','service_role')::text,true); end$$;
set local role service_role;
do $$declare a record; sale jsonb; payment jsonb; doc jsonb; issued jsonb; work jsonb; packet jsonb; expense jsonb; expense_request text; expense_data jsonb; rental_id bigint; rental_result jsonb; begin
 select * into a from release_actor;
 sale:=public.rrs_save_sale(a.actor,a.tenant,gen_random_uuid()::text,'{"date":"2099-11-04","gross":100,"discount":0,"net":100,"cash":0,"transfer":0,"paid":0}'::jsonb);
 payment:=public.rrs_record_payment(a.actor,a.tenant,gen_random_uuid()::text,jsonb_build_object('sale_id',sale->'id','received_date','2099-11-04','amount',100,'pay_method','โอน'));
 if payment->>'sale_id'<>sale->>'id' then raise exception 'Payment link mismatch'; end if;
 doc:=public.rrs_create_document(a.actor,a.tenant,gen_random_uuid()::text,jsonb_build_object('branch_id',a.branch,'doc_type','INVOICE','issue_date','2099-11-04','charge_vat',false,'contact',jsonb_build_object('company_name','RELEASE TEST ROLLBACK'),'items','[{"name":"RELEASE TEST","quantity":1,"unit_price":100,"discount":0,"total":100}]'::jsonb));
 issued:=public.rrs_issue_document(a.actor,a.tenant,(doc->>'id')::uuid);
 if issued->>'doc_number' like 'DRAFT-%' then raise exception 'Issue failed'; end if;
 if public.rrs_issue_document(a.actor,a.tenant,(doc->>'id')::uuid)->>'doc_number'<>issued->>'doc_number' then raise exception 'Issue replay failed'; end if;
 work:=public.rrs_create_service_order(a.actor,a.tenant,gen_random_uuid()::text,jsonb_build_object('branch_id',a.branch,'date','2099-11-04','customer_name','RELEASE TEST ROLLBACK','customer_phone','release-rollback','gross',200,'discount',20,'net',180,'payment_method','cash','services','[{"id":null,"name":"RELEASE TEST","price":200}]'::jsonb));
 if work->>'posted_to_books'<>'true' then raise exception 'Order not posted'; end if;
 perform public.rrs_set_order_status(a.actor,a.tenant,(work->>'id')::uuid,'in_progress');
 expense_request:=gen_random_uuid()::text;
 expense_data:='{"date":"2099-11-04","title":"RELEASE TEST ROLLBACK","category_key":"admin_general","amount":100,"pay_method":"บัญชีร้าน","withhold":true,"vat_rate":7,"wht_rate":3,"payee_id":"","payee_kind":"person","payee_name":"RELEASE TEST ROLLBACK","payee_tax_id":"0000000000000","payee_address":"TEST ONLY"}'::jsonb;
 expense:=public.rrs_create_expense(a.actor,a.tenant,expense_request,expense_data);
 if expense->>'certificateIssued'<>'true' or nullif(expense->>'certificate_number','') is null then raise exception 'Expense/WHT incomplete';end if;
 if public.rrs_create_expense(a.actor,a.tenant,expense_request,expense_data)->>'id'<>expense->>'id' then raise exception 'Expense replay failed';end if;
 begin
  perform public.rrs_delete_expense(a.actor,a.tenant,gen_random_uuid()::text,jsonb_build_object('id',expense->'id'));
  raise exception 'Issued expense deletion allowed';
 exception when check_violation then null;
 end;
 insert into public.sc_rental_records(tenant_id,month,room_index,room_name,rent_amount,income_amount,tenant_name,legacy_ref)
 select a.tenant,'11/2099',coalesce(max(room_index),-1)+1,'RELEASE TEST',100,100,'RELEASE TEST ROLLBACK',gen_random_uuid()::text
 from public.sc_rental_records where tenant_id=a.tenant and month='11/2099' returning id into rental_id;
 rental_result:=public.rrs_record_rental_wht(a.actor,a.tenant,gen_random_uuid()::text,jsonb_build_object('id',rental_id,'name','RELEASE TEST ROLLBACK','tax_id','0000000000000','kind','person','wht_rate',5));
 if nullif(rental_result->>'certificate_number','') is null then raise exception 'Rental WHT incomplete';end if;
 packet:=public.rrs_accountant_packet(a.actor,a.tenant,'2099-11');
 if jsonb_array_length(packet->'sales')<2 or jsonb_array_length(packet->'payments')<1 then raise exception 'Accountant packet incomplete'; end if;
end $$;
reset role;
set local role authenticated;
do $$declare a record; receipt uuid; payload jsonb; begin
 select * into a from release_actor;
 payload:=jsonb_build_object('new_item_name','RELEASE TEST ROLLBACK','new_item_category','ทดสอบ','new_item_unit','ใบ','new_min_stock',0,'supplier_name','RELEASE TEST','purchase_date',(now() at time zone 'Asia/Bangkok')::date,'purchase_unit','แพ็ก','purchase_qty',2,'units_per_pack',100,'goods_amount',400,'shipping_amount',40,'discount_amount',20);
 receipt:=public.inv_fn_receive_purchase(a.branch,gen_random_uuid(),payload);
 if receipt is null then raise exception 'Purchase failed'; end if;
end $$;
reset role;
rollback to savepoint business_smoke;
do $$declare b record; begin
 select * into b from release_baseline;
 if b.sales<>(select count(*) from public.sc_sales) or b.payments<>(select count(*) from public.sc_payments)
 or b.orders<>(select count(*) from public.service_orders) or b.customers<>(select count(*) from public.customers)
 or b.documents<>(select count(*) from extension_layer.ext_documents) or b.purchases<>(select count(*) from public.inv_purchase_receipts)
 or b.stock<>(select count(*) from public.inv_stock_transactions)
 or b.opex<>(select count(*) from public.sc_opex) or b.expense_entries<>(select count(*) from public.sc_expense_entries)
 or b.rentals<>(select count(*) from public.sc_rental_records)
 or b.payees<>(select count(*) from public.sc_wht_payees) or b.wht<>(select count(*) from public.sc_wht_certificates)
 or b.audit<>(select count(*) from public.sc_audit_logs) or b.commands<>(select count(*) from rrs_private.commands)
 or b.wht_sequence<>(select coalesce(sum(sequence),0) from rrs_private.wht_counters) then raise exception 'Smoke rows persisted'; end if;
end $$;
select 'BUSINESS_SMOKE_PASS_ZERO_PERSISTED_ROWS';
