-- ย้อน 0042 (WHT payees / certificates / หมวดค่าเช่าอาคาร / คอลัมน์รายได้ค่าเช่า)

drop trigger if exists sc_wht_payees_touch on public.sc_wht_payees;
drop table if exists public.sc_wht_certificates;
drop table if exists public.sc_wht_payees;

delete from public.sc_expense_categories where key = 'building_rent';

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'sc_rental_records') then
    alter table public.sc_rental_records
      drop column if exists tenant_name,
      drop column if exists tenant_tax_id,
      drop column if exists wht_rate,
      drop column if exists wht_withheld;
  end if;
end $$;
