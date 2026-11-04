-- Synthetic commands; every row and counter-table change is rolled back to the savepoint.
create temp table release_baseline on commit drop as select
 (select count(*) from public.sc_sales) sales,
 (select count(*) from public.sc_payments) payments,
 (select count(*) from public.service_orders) orders,
 (select count(*) from public.customers) customers,
 (select count(*) from extension_layer.ext_documents) documents,
 (select count(*) from public.inv_purchase_receipts) purchases,
 (select count(*) from public.inv_stock_transactions) stock;
create temp table release_actor on commit drop as select p.id actor,p.tenant_id tenant,b.id branch
 from public.profiles p join public.branches b on b.tenant_id=p.tenant_id
 where p.role::text='admin' and p.is_active and b.is_active limit 1;
do $$begin if not exists(select 1 from release_actor) then raise exception 'No active shop admin for rolled-back smoke'; end if; end$$;
grant select on release_actor to authenticated,service_role;
savepoint business_smoke;
do $$declare a record; begin select * into a from release_actor; perform set_config('request.jwt.claim.sub',a.actor::text,true); perform set_config('request.jwt.claims',jsonb_build_object('sub',a.actor,'role','service_role')::text,true); end$$;
set local role service_role;
do $$declare a record; sale jsonb; payment jsonb; doc jsonb; issued jsonb; work jsonb; packet jsonb; begin
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
 or b.stock<>(select count(*) from public.inv_stock_transactions) then raise exception 'Smoke rows persisted'; end if;
end $$;
select 'BUSINESS_SMOKE_PASS_ZERO_PERSISTED_ROWS';
