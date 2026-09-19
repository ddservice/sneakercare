-- ถอดคอลัมน์ลิงก์ใบรับงานออกจาก sc_sales

drop index if exists public.sc_sales_tenant_order_uidx;

do $$
begin
  if to_regclass('public.sc_sales') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'sc_sales'
         and column_name = 'service_order_id'
     )
  then
    execute $sql$ alter table public.sc_sales drop column service_order_id $sql$;
  end if;
end
$$;
