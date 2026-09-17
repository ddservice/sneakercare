-- ย้อน 0033 กลับสู่สภาพเดิม (PK เดี่ยวที่ key, ฟังก์ชันไม่กรอง tenant)
--
-- ⚠️ ถ้าตอนนี้มีมากกว่า 1 tenant ตั้งค่า key ชื่อเดียวกันไว้แล้ว (เช่น telegram_bot_token ของ
-- ทั้งสองร้าน) การย้อนกลับจะชนกันทันที (PK ซ้ำ) — เช็คก่อนด้วย
-- `select key, count(*) from inv_integration_secrets group by key having count(*) > 1`
-- ต้องได้ 0 แถวก่อนรันไฟล์นี้เสมอ
--
-- ⚠️ อีกจุด: การคืน FK ของ updated_by กลับไปที่ sc_users(user_id) จะพังถ้ามีแถวไหนถูก
-- set/update หลัง 0033 ด้วยบัญชีที่ไม่มีแถวใน sc_users เลย (เช่นทุกบัญชีที่เชิญเข้าระบบใหม่
-- ตั้งแต่ 0023 เป็นต้นมา — sc_users ไม่ถูกเขียนใหม่อีกแล้ว) เช็คก่อนด้วย
-- `select updated_by from inv_integration_secrets where updated_by is not null
--   and updated_by not in (select user_id from sc_users)`
-- ถ้ามีผลลัพธ์ ต้อง `update inv_integration_secrets set updated_by = null where ...` ก่อนรันไฟล์นี้

do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'inv_integration_secrets') then
    raise notice '[0033 rollback] ไม่พบตาราง inv_integration_secrets — ข้าม';
    return;
  end if;

  if exists (select 1 from pg_constraint where conname = 'inv_integration_secrets_tenant_key_pkey') then
    alter table public.inv_integration_secrets drop constraint inv_integration_secrets_tenant_key_pkey;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'inv_integration_secrets_pkey') then
    alter table public.inv_integration_secrets add constraint inv_integration_secrets_pkey primary key (key);
  end if;

  if exists (select 1 from pg_constraint where conname = 'inv_integration_secrets_updated_by_profiles_fkey') then
    alter table public.inv_integration_secrets drop constraint inv_integration_secrets_updated_by_profiles_fkey;
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'sc_users')
     and not exists (select 1 from pg_constraint where conname = 'inv_integration_secrets_updated_by_fkey') then
    alter table public.inv_integration_secrets
      add constraint inv_integration_secrets_updated_by_fkey foreign key (updated_by) references public.sc_users(user_id);
  end if;
end $$;

-- คืนนิยามฟังก์ชันเดิมทุกตัวชัดๆ (คัดลอกจาก pg_get_functiondef ของ production ก่อน apply 0033)
create or replace function public.inv_fn_set_integration_secret(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if inv_fn_current_role() not in ('admin', 'co-admin') then
    raise exception 'เฉพาะ Admin และ Co-Admin เท่านั้นที่ตั้งค่า integration secret ได้';
  end if;
  if p_value is null or length(trim(p_value)) = 0 then
    raise exception 'ค่า secret ห้ามว่าง';
  end if;

  insert into inv_integration_secrets(key, value, updated_by, updated_at)
  values (p_key, p_value, auth.uid(), now())
  on conflict (key) do update set value = p_value, updated_by = auth.uid(), updated_at = now();
end;
$$;

create or replace function public.inv_fn_integration_secret_status(p_key text)
returns table(is_set boolean, value_suffix text, updated_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if inv_fn_current_role() not in ('admin', 'co-admin') then
    raise exception 'เฉพาะ Admin และ Co-Admin เท่านั้นที่ดูสถานะ integration secret ได้';
  end if;

  return query
  select true, right(s.value, 4), s.updated_at
  from inv_integration_secrets s where s.key = p_key
  union all
  select false, null::text, null::timestamptz
  where not exists (select 1 from inv_integration_secrets where key = p_key)
  limit 1;
end;
$$;

create or replace function public.fn_integration_secret_status(p_key text)
returns table(is_set boolean, value_suffix text, updated_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
BEGIN
  RETURN QUERY
  SELECT
    EXISTS (SELECT 1 FROM inv_integration_secrets WHERE key = p_key) AS is_set,
    SUBSTRING(value FROM GREATEST(1, LENGTH(value) - 3)) AS value_suffix,
    inv_integration_secrets.updated_at
  FROM inv_integration_secrets
  WHERE key = p_key;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::timestamptz;
  END IF;
END;
$$;
