-- ════════════════════════════════════════════════════════════════════════
--  0043_branch_vat_registered.sql
--  จด VAT เป็นระดับสาขา — แต่ละสาขาเป็นคนละนิติบุคคล
-- ════════════════════════════════════════════════════════════════════════
--
-- ค่าเริ่มต้น true เพื่อไม่เปลี่ยนพฤติกรรมสาขาที่มีอยู่ (SneakerCare จด VAT อยู่แล้ว)
-- แอปอ่านจากสาขาที่เลือกที่หัวเว็บ ไม่ใช่ sc_settings ของทั้ง tenant

do $$
declare
  v_branch_table text;
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'inv_branches') then
    v_branch_table := 'inv_branches';
  elsif exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'branches'
  ) then
    v_branch_table := 'branches';
  else
    raise notice '[0043] ไม่พบตารางสาขา — ข้าม vat_registered';
    return;
  end if;

  execute format(
    'alter table public.%I add column if not exists vat_registered boolean not null default true',
    v_branch_table
  );

  if v_branch_table = 'inv_branches'
     and exists (select 1 from pg_views where schemaname = 'public' and viewname = 'branches') then
    execute 'create or replace view public.branches as select * from public.inv_branches';
    execute 'alter view public.branches set (security_invoker = on)';
  end if;
end $$;
