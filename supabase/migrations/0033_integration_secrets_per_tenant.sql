-- ════════════════════════════════════════════════════════════════════════
--  0033_integration_secrets_per_tenant.sql
--  แยก integration secret (Telegram Bot Token) ให้ตั้งค่าได้ต่อ tenant จริง
-- ════════════════════════════════════════════════════════════════════════
--
-- 0028 เพิ่ม tenant_id ให้ inv_integration_secrets ไปแล้ว แต่ PRIMARY KEY ยังเป็น (key) เดี่ยว
-- (บั๊กแบบเดียวกับที่ 0032 แก้ให้ sc_settings) ⇒ สอง tenant ยังตั้ง telegram_bot_token
-- คนละค่าพร้อมกันไม่ได้จริง — ต่างจาก sc_settings ตรงที่ตารางนี้ไม่มีแถวระดับแพลตฟอร์มปนอยู่เลย
-- (ทุกแถวเป็นของ tenant ใด tenant หนึ่งเสมอ) จึงใช้ PRIMARY KEY (tenant_id, key) ตรงๆ ได้
-- ไม่ต้องพึ่ง UNIQUE NULLS NOT DISTINCT เหมือน 0032
--
-- ⚠️ เหตุผลที่ RLS ของตารางนี้ไม่ต้องแก้: `relrowsecurity = true` แต่มี 0 policy อยู่แล้ว
-- (ตรวจกับ production จริงก่อนเขียนไฟล์นี้) แปลว่า role authenticated เข้าตารางนี้ตรงๆ ไม่ได้
-- เลยอยู่แล้วโดยธรรมชาติของ RLS (0 policy = deny-all) — เข้าถึงได้ทางเดียวผ่านฟังก์ชัน
-- SECURITY DEFINER ด้านล่างเท่านั้น ตรงกับกฎข้อ 9 ("ห้าม SELECT ค่าจริงจาก integration_secrets
-- กลับมาแสดง แม้แต่ให้ Admin ดู") อยู่แล้ว ไม่ต้องเพิ่ม policy ใดๆ

do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'inv_integration_secrets') then
    raise notice '[0033] ไม่พบตาราง inv_integration_secrets ในฐานข้อมูลนี้ — ข้ามทั้งไฟล์';
    return;
  end if;

  if exists (select 1 from pg_constraint where conname = 'inv_integration_secrets_pkey') then
    alter table public.inv_integration_secrets drop constraint inv_integration_secrets_pkey;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'inv_integration_secrets_tenant_key_pkey') then
    alter table public.inv_integration_secrets
      add constraint inv_integration_secrets_tenant_key_pkey primary key (tenant_id, key);
  end if;

  -- ⚠️ [เจอระหว่างทดสอบกับ production จริง 2026-09-17] updated_by ยังชี้ไปตาราง sc_users
  -- (deprecated ตามกฎ "ตั้งแต่นี้ไป profiles คือตารางเดียวที่ใช้ตัดสินสิทธิ์" — ดู CLAUDE.md
  -- หัวข้อ npm run test:staff) บัญชี admin ที่ไม่เคยมีแถวใน sc_users (เช่นบัญชีที่เชิญเข้าระบบใหม่
  -- ทุกบัญชีตั้งแต่ 0023 เป็นต้นมา — sc_users ไม่ถูกเขียนใหม่อีกแล้ว) จะตั้งค่า integration secret
  -- ไม่ได้เลย ชน FK violation ทันที — พิสูจน์จริงด้วย npm run test:multi-tenant (บัญชีทดสอบใหม่
  -- ไม่มีแถวใน sc_users) ย้าย FK ไปชี้ profiles(id) แทน ให้ตรงกับ FK อื่นๆ ในระบบที่ทำไปแล้ว
  if exists (select 1 from pg_constraint where conname = 'inv_integration_secrets_updated_by_fkey') then
    alter table public.inv_integration_secrets drop constraint inv_integration_secrets_updated_by_fkey;
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'profiles')
     and not exists (select 1 from pg_constraint where conname = 'inv_integration_secrets_updated_by_profiles_fkey') then
    alter table public.inv_integration_secrets
      add constraint inv_integration_secrets_updated_by_profiles_fkey foreign key (updated_by) references public.profiles(id);
  end if;
end $$;

-- ── เขียน secret: ผูกกับ tenant ของผู้เรียกเสมอ (fn_current_tenant()) ──
-- super_admin ไม่มี tenant ของตัวเอง (fn_current_tenant() คืน null) ⇒ ตั้งค่าไม่ได้ ต้องแจ้งชัดเจน
-- แทนที่จะปล่อยให้ insert ชน NOT NULL constraint แบบข้อความอ่านไม่รู้เรื่อง
create or replace function public.inv_fn_set_integration_secret(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tenant uuid;
begin
  if inv_fn_current_role() not in ('admin', 'co-admin') then
    raise exception 'เฉพาะ Admin และ Co-Admin เท่านั้นที่ตั้งค่า integration secret ได้';
  end if;
  if p_value is null or length(trim(p_value)) = 0 then
    raise exception 'ค่า secret ห้ามว่าง';
  end if;

  v_tenant := fn_current_tenant();
  if v_tenant is null then
    raise exception 'บัญชีนี้ไม่มี tenant ของตัวเอง ตั้งค่า integration secret ไม่ได้';
  end if;

  insert into inv_integration_secrets(tenant_id, key, value, updated_by, updated_at)
  values (v_tenant, p_key, p_value, auth.uid(), now())
  on conflict (tenant_id, key) do update
    set value = p_value, updated_by = auth.uid(), updated_at = now();
end;
$$;

-- ── อ่านสถานะ (ไม่ใช่ค่าจริง — แค่ is_set/suffix 4 ตัวท้าย/updated_at) ──
-- ผูกกับ tenant ของผู้เรียกด้วยเช่นกัน กันไม่ให้ admin ของ tenant หนึ่งเห็นสถานะ token ของอีก tenant
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
  from inv_integration_secrets s
  where s.key = p_key and s.tenant_id = fn_current_tenant()
  union all
  select false, null::text, null::timestamptz
  where not exists (
    select 1 from inv_integration_secrets where key = p_key and tenant_id = fn_current_tenant()
  )
  limit 1;
end;
$$;

-- ── alias ไร้ prefix ที่หน้า /settings และ /admin/settings เรียกจริง ──
-- ⚠️ [แก้บั๊กจริงที่เจอระหว่างทาง] ตัวเดิมไม่มีการเช็คสิทธิ์เลย (ต่างจาก inv_fn_ ข้างบนที่มี)
-- แปลว่า staff คนไหนก็เรียก RPC นี้ตรงๆ แล้วเห็น 4 ตัวท้ายของ bot token ได้มาตลอด — ไม่ใช่ค่าเต็ม
-- แต่ก็ไม่ควรเห็นเลยตามกฎข้อ 9 เพิ่มเช็คสิทธิ์ให้ตรงกับตัว inv_fn_ พร้อมกับกรอง tenant ในคราวเดียว
create or replace function public.fn_integration_secret_status(p_key text)
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
  from inv_integration_secrets s
  where s.key = p_key and s.tenant_id = fn_current_tenant()
  union all
  select false, null::text, null::timestamptz
  where not exists (
    select 1 from inv_integration_secrets where key = p_key and tenant_id = fn_current_tenant()
  )
  limit 1;
end;
$$;
