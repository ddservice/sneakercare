-- ย้อน 0032 กลับสู่สภาพเดิม (key เดี่ยวเป็น PK)
--
-- ⚠️ ถ้าตอนนี้มีมากกว่า 1 tenant ตั้งค่า key ชื่อเดียวกันไว้แล้ว (เช่น 'name' ของทั้งสองร้าน)
-- การย้อนกลับจะชนกันทันที (PK ซ้ำ) — เช็คก่อนด้วย
-- `select key, count(*) from sc_settings group by key having count(*) > 1`
-- ต้องได้ 0 แถวก่อนรันไฟล์นี้เสมอ

do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'sc_settings') then
    raise notice '[0032 rollback] ไม่พบตาราง sc_settings — ข้าม';
    return;
  end if;

  if exists (select 1 from pg_constraint where conname = 'sc_settings_tenant_key_key') then
    alter table public.sc_settings drop constraint sc_settings_tenant_key_key;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sc_settings_pkey') then
    alter table public.sc_settings add constraint sc_settings_pkey primary key (key);
  end if;

  -- คืน backup_success_notify กลับไปเป็น tenant #1 (สภาพก่อน 0032) และคืน tenant_id ให้บังคับ not null
  update public.sc_settings set tenant_id = '00000000-0000-0000-0000-000000000001'::uuid where tenant_id is null;
  alter table public.sc_settings alter column tenant_id set not null;
end $$;
