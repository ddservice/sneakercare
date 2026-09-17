-- rollback 0041: เอาเวลาเปิด-ปิดสาขาออก
-- ต้องถอด view `branches` ก่อน drop column เพราะ view ผูกคอลัมน์ไว้ (ห้าม CASCADE ตารางสาขา)

drop index if exists public.services_tenant_id_code_key;

do $$
declare
  v_branch_table text;
  v_has_view boolean := false;
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'inv_branches') then
    v_branch_table := 'inv_branches';
  elsif exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'branches') then
    v_branch_table := 'branches';
  else
    return;
  end if;

  if v_branch_table = 'inv_branches'
     and exists (select 1 from pg_views where schemaname = 'public' and viewname = 'branches') then
    v_has_view := true;
    execute 'drop view public.branches';
  end if;

  execute format('alter table public.%I drop column if exists open_time', v_branch_table);
  execute format('alter table public.%I drop column if exists close_time', v_branch_table);

  if v_has_view then
    execute 'create or replace view public.branches as select * from public.inv_branches';
    execute 'alter view public.branches set (security_invoker = on)';
  end if;
end $$;
