-- ════════════════════════════════════════════════════════════════════════
--  0041_branch_hours.sql
--  เวลาเปิด-ปิดร้านต่อสาขา + รหัสบริการไม่ชนข้าม tenant
-- ════════════════════════════════════════════════════════════════════════
--
-- แต่ละสาขา (และแต่ละนิติบุคคล) ตั้งเวลาเปิด-ปิดเองได้ ไม่ดึง 09:00-20:00 ของ
-- สาขาแรกมาใช้ทั้งระบบ ตารางเวรอ่านค่านี้เป็นฐานตอนสร้างกะเช้า/กะสาย
--
-- รหัสบริการ (`services.code`) เดิมอาจเป็น unique ทั้งระบบ — สองกิจการตั้ง
-- แพ็กเกจรหัสเดียวกันไม่ได้ เปลี่ยนเป็น unique ต่อ tenant

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
    raise notice '[0041] ไม่พบตารางสาขา — ข้าม open_time/close_time';
    return;
  end if;

  execute format(
    'alter table public.%I add column if not exists open_time text not null default %L',
    v_branch_table, '09:00'
  );
  execute format(
    'alter table public.%I add column if not exists close_time text not null default %L',
    v_branch_table, '20:00'
  );

  if v_branch_table = 'inv_branches'
     and exists (select 1 from pg_views where schemaname = 'public' and viewname = 'branches') then
    execute 'create or replace view public.branches as select * from public.inv_branches';
    execute 'alter view public.branches set (security_invoker = on)';
  end if;
end $$;

do $$
declare
  r record;
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'services') then
    return;
  end if;

  -- ถอด unique ทั้งระบบบน code (ถ้ามี) ให้สอง tenant ใช้รหัสเดียวกันได้
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'services'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ~* 'code'
      and pg_get_constraintdef(c.oid) !~* 'tenant_id'
  loop
    execute format('alter table public.services drop constraint if exists %I', r.conname);
  end loop;

  for r in
    select i.relname as idx
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    join pg_class t on t.oid = x.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'services'
      and x.indisunique
      and not x.indisprimary
      and pg_get_indexdef(x.indexrelid) ~* '\(code\)'
      and pg_get_indexdef(x.indexrelid) !~* 'tenant_id'
  loop
    execute format('drop index if exists public.%I', r.idx);
  end loop;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'services' and indexname = 'services_tenant_id_code_key'
  ) then
    execute 'create unique index services_tenant_id_code_key on public.services (tenant_id, code)';
  end if;
end $$;
