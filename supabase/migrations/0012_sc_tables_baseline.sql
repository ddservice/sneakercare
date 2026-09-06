-- ════════════════════════════════════════════════════════════════════════
--  0012_sc_tables_baseline.sql
--  Baseline ของตาราง sc_* (POS / ยอดขาย / ค่าใช้จ่าย / เงินเดือน / ผู้ใช้)
-- ════════════════════════════════════════════════════════════════════════
--
-- ⚠️ migration นี้เป็น "no-op สนิทบน production" โดยเจตนา
--    ทุก statement มี IF NOT EXISTS หรือ guard ครอบไว้ทั้งหมด — รันบน SneakerCareDB
--    (ref mdlxogfkpwejnqpzhmoy) กี่ครั้งก็ไม่เปลี่ยนอะไร เพราะทุกอย่างมีอยู่แล้วที่นั่น
--
-- ทำไมต้องมีไฟล์นี้:
--   ตาราง sc_employees, sc_expenses, sc_opex, sc_opex_history, sc_payments, sc_sales,
--   sc_settings, sc_users ถูกสร้างบน SneakerCareDB โดยตรง "นอกระบบ migration" ตอนพัฒนา
--   โมดูล POS/เงินเดือนช่วงแรก (ดู CLAUDE.md/HANDOFF.md) ผลคือใครก็ตามที่กู้ระบบขึ้น Supabase
--   โปรเจกต์ใหม่จากศูนย์ด้วย supabase/migrations/ อย่างเดียว จะได้ระบบที่ไม่มีโมดูลการเงินเลย
--   และ migration 0011 ก็ต้องมี guard พิเศษไว้ข้ามการสร้าง index บนตารางที่ยังไม่มี
--
--   ไฟล์นี้ปิดช่องว่างนั้น: ตั้งแต่นี้ไป `supabase start` / CI / disaster recovery จะได้ schema
--   ครบทั้งฝั่งคลังสินค้า (0001-0007) และฝั่งการเงิน (0008-0012)
--
-- ที่มาของนิยาม: pg_dump --schema-only -t 'public.sc_*' จาก production เมื่อ 2026-09-06
--   (อ่านอย่างเดียว ไม่แตะข้อมูล) แล้วแปลงเป็นรูปแบบ idempotent
--
-- ⚠️ ไม่รวม sc_audit_logs — ตารางนั้นเป็นของ migration 0011 อยู่แล้ว อย่านิยามซ้ำที่นี่
--
-- ⚠️ ข้อจำกัดที่ต้องรู้: ไฟล์นี้กู้ "โครงสร้าง" ไม่ใช่ "ข้อมูล" การกู้ข้อมูลจริงยังต้องใช้
--    ไฟล์สำรองรายวันจาก scripts/backup-db-to-r2.sh เหมือนเดิม

-- ── 1. ตาราง ────────────────────────────────────────────────────────────
-- ผู้ใช้ฝั่งการเงิน (คนละตารางกับ profiles — ระบบมี user directory สองชุดตามประวัติการพัฒนา)
create table if not exists public.sc_users (
  id         bigserial primary key,
  user_id    uuid unique references auth.users(id) on delete cascade,
  username   text not null unique,
  fullname   text default ''::text,
  nickname   text default ''::text,
  role       text default 'staff'::text,
  created_at timestamptz default now(),
  branch_id  uuid
);

-- ยอดขายรายวัน (1 แถว = 1 วัน จึง unique ที่ date) จำนวนคู่แยกตามขนาดรองเท้า S/M/L/XL
create table if not exists public.sc_sales (
  id              bigserial primary key,
  date            date not null unique,
  extra_items     text default ''::text,
  size_s          integer default 0,
  size_m          integer default 0,
  size_l          integer default 0,
  size_xl         integer default 0,
  total_revenue   numeric(12,2) default 0,
  cash_amount     numeric(12,2) default 0,
  transfer_amount numeric(12,2) default 0,
  recorded_by     text default ''::text,
  discount        numeric(12,2) default 0,
  grand_total     numeric(12,2) default 0,
  payment_status  text default ''::text,
  amount_paid     numeric(12,2) default 0,
  last_updated    timestamptz,
  created_at      timestamptz default now()
);

-- การรับชำระย้อนหลัง (ลูกหนี้) — sale_date ชี้กลับไปที่วันขายใน sc_sales,
-- received_date คือวันที่เงินเข้าจริง (คนละวันกันได้ จึงต้องมี index ทั้งสองคอลัมน์)
create table if not exists public.sc_payments (
  id            bigserial primary key,
  sale_date     date not null,
  amount        numeric(12,2) default 0,
  pay_method    text default ''::text,
  notes         text default ''::text,
  recorded_by   text default ''::text,
  created_at    timestamptz default now(),
  received_date date not null default current_date
);

-- ⚠️ key-value store รายเดือน — เก็บของหลายอย่างปนกัน (ค่าใช้จ่ายจริง, ยอดสรุปเงินเดือน,
-- รายรับห้องเช่า, ข้อมูลโปรไฟล์พนักงาน) แยกกันด้วย category/key ที่เป็น free-text
-- ดู "บทเรียน" ท้ายหัวข้อ 2026-09-02 ใน CLAUDE.md ก่อนเพิ่ม category/key ใหม่
-- month เก็บเป็น text รูปแบบ 'MM/YYYY' (ไม่ใช่ date) ตามข้อมูลเดิมที่ย้ายมาจาก Google Sheets
create table if not exists public.sc_opex (
  id           bigserial primary key,
  month        text not null,
  category     text default ''::text,
  key          text default ''::text,
  name         text default ''::text,
  amount       numeric(20,4) default 0,
  pay_method   text default ''::text,
  recorded_by  text default ''::text,
  last_updated timestamptz,
  created_at   timestamptz default now(),
  constraint sc_opex_month_key_unique unique (month, key)
);

-- snapshot ของ sc_opex ทั้งเดือนตอนกดบันทึก (versioned) ใช้ย้อนดูว่าตัวเลขเดือนนั้นเคยเป็นเท่าไหร่
create table if not exists public.sc_opex_history (
  id          bigserial primary key,
  month       text not null,
  version     integer not null default 1,
  saved_at    timestamptz default now(),
  saved_by    text default ''::text,
  change_note text default ''::text,
  items       jsonb not null
);

create table if not exists public.sc_employees (
  id           bigserial primary key,
  name         text not null,
  salary       numeric(12,2) default 0,
  "position"   text default ''::text,
  bank         text default ''::text,
  account      text default ''::text,
  status       text default 'Active'::text,
  nickname     text default ''::text,
  comm_rate    numeric(5,2) default 0,
  last_updated timestamptz,
  updated_at   timestamptz default now(),
  -- ยกเว้นประกันสังคมรายคน (เช่น หุ้นส่วนผู้จัดการที่ไม่นับเป็นลูกจ้างตาม พ.ร.บ.ประกันสังคม)
  -- แยกจากประเภทการจ้างงานโดยเจตนา — ดูหัวข้อ 2026-09-02 ใน CLAUDE.md
  sso_exempt   boolean not null default false
);

-- ⚠️ ตารางนี้เปิด RLS ไว้แต่ "ไม่มี policy เลย" = authenticated เข้าไม่ถึงทั้งอ่านและเขียน
-- (เข้าถึงได้เฉพาะ service_role) สภาพนี้ตรงกับ production จริง — โค้ดแอปปัจจุบันใช้ sc_opex
-- เป็นแหล่งค่าใช้จ่ายแทน ตารางนี้เป็นของเก่าที่เหลือค้างไว้ อย่าเพิ่งลบจนกว่าจะยืนยันว่าไม่มีข้อมูล
create table if not exists public.sc_expenses (
  id           bigserial primary key,
  date         date not null,
  category     text default ''::text,
  name         text not null,
  amount       numeric(12,2) default 0,
  pay_method   text default ''::text,
  recorded_by  text default ''::text,
  last_updated timestamptz,
  created_at   timestamptz default now()
);

-- ข้อมูลร้าน/หัวเอกสาร (ชื่อนิติบุคคล, เลขผู้เสียภาษี, PromptPay, dbd_company_registry)
create table if not exists public.sc_settings (
  key        text primary key,
  value      text default ''::text,
  updated_at timestamptz default now()
);

-- ── 2. ฟังก์ชันสิทธิ์ของฝั่งการเงิน ──────────────────────────────────────
-- อ่าน role จาก sc_users (คนละตารางกับ profiles ของฝั่งคลังสินค้า) — ใช้ใน RLS policy
-- แทบทุกตัวด้านล่าง ต้องเป็น SECURITY DEFINER ไม่งั้น policy จะไปติด RLS ของ sc_users เอง
create or replace function public.sc_get_my_role()
returns text
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select role from sc_users where user_id = auth.uid();
$fn$;

-- ── 3. FK ของ sc_users.branch_id ─────────────────────────────────────────
-- production ชี้ไป inv_branches(id) แต่ฐานข้อมูลที่สร้างจาก migrations ล้วนๆ (local/CI) มีแค่
-- branches (ตาราง inv_* เกิดจาก scripts/apply-aliases-and-unified-schema.sql ที่รันบน production
-- เท่านั้น) — เลือกอันที่มีอยู่จริง ถ้าไม่มีทั้งคู่ก็ข้ามไปโดยไม่ error
do $$
declare
  v_target text;
begin
  if exists (select 1 from pg_constraint where conname = 'sc_users_branch_id_fkey') then
    return;
  end if;

  select t into v_target
  from (values ('inv_branches'), ('branches')) as candidates(t)
  where exists (select 1 from pg_tables where schemaname = 'public' and tablename = candidates.t)
  limit 1;

  if v_target is not null then
    execute format(
      'alter table public.sc_users add constraint sc_users_branch_id_fkey foreign key (branch_id) references public.%I(id)',
      v_target
    );
  end if;
end $$;

-- ── 4. Index ─────────────────────────────────────────────────────────────
-- 3 ตัวแรกซ้ำกับ 0011 โดยตั้งใจ: บนฐานข้อมูลใหม่ 0011 รันก่อนที่ตารางจะมีอยู่จึงข้ามไป
-- (guard ใน 0011) ต้องมาสร้างที่นี่แทน — บน production ทั้งหมดมีอยู่แล้ว IF NOT EXISTS จึงเงียบ
create index if not exists idx_sc_sales_date             on public.sc_sales ("date" desc);
create index if not exists idx_sc_payments_sale_date     on public.sc_payments (sale_date);
create index if not exists idx_sc_opex_month             on public.sc_opex (month);
create index if not exists idx_sc_payments_received_date on public.sc_payments (received_date);
create index if not exists idx_opex_history_month        on public.sc_opex_history (month, version desc);

-- ── 5. Row Level Security ────────────────────────────────────────────────
alter table public.sc_users        enable row level security;
alter table public.sc_sales        enable row level security;
alter table public.sc_payments     enable row level security;
alter table public.sc_opex         enable row level security;
alter table public.sc_opex_history enable row level security;
alter table public.sc_employees    enable row level security;
alter table public.sc_expenses     enable row level security;
alter table public.sc_settings     enable row level security;

-- policy ไม่มี IF NOT EXISTS ใน Postgres จึงต้องเช็คจาก pg_policies เอง
-- (ห้ามใช้ DROP POLICY IF EXISTS แล้วสร้างใหม่ เพราะถ้ารันบน production จะมีช่วงเสี้ยววินาที
--  ที่ตารางเปิดโล่งไม่มี policy คุ้มครองอยู่)
do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('sc_users', 'sc_users_read',
       'create policy sc_users_read on public.sc_users for select to authenticated using (true)'),
      ('sc_users', 'sc_users_admin_all',
       'create policy sc_users_admin_all on public.sc_users to authenticated using (public.sc_get_my_role() = ''admin'') with check (public.sc_get_my_role() = ''admin'')'),
      -- แก้ role ของตัวเองไม่ได้: with check บังคับว่า role ใหม่ต้องเท่ากับ role ปัจจุบันเสมอ
      ('sc_users', 'sc_users_update_own',
       'create policy sc_users_update_own on public.sc_users for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and role = public.sc_get_my_role())'),

      ('sc_sales', 'sc_sales_read_insert',
       'create policy sc_sales_read_insert on public.sc_sales for select to authenticated using (true)'),
      ('sc_sales', 'sc_sales_insert',
       'create policy sc_sales_insert on public.sc_sales for insert to authenticated with check (true)'),
      ('sc_sales', 'sc_sales_update',
       'create policy sc_sales_update on public.sc_sales for update to authenticated using (true) with check (true)'),
      ('sc_sales', 'sc_sales_delete_admin',
       'create policy sc_sales_delete_admin on public.sc_sales for delete using (public.sc_get_my_role() = any (array[''admin'',''co-admin'']))'),

      ('sc_payments', 'sc_payments_select',
       'create policy sc_payments_select on public.sc_payments for select using (true)'),
      ('sc_payments', 'sc_payments_insert',
       'create policy sc_payments_insert on public.sc_payments for insert with check (true)'),
      ('sc_payments', 'sc_payments_update',
       'create policy sc_payments_update on public.sc_payments for update using (true) with check (true)'),
      ('sc_payments', 'sc_payments_delete_admin_co_admin',
       'create policy sc_payments_delete_admin_co_admin on public.sc_payments for delete using (public.sc_get_my_role() = any (array[''admin'',''co-admin'']))'),

      ('sc_opex', 'sc_opex_read_insert',
       'create policy sc_opex_read_insert on public.sc_opex for select to authenticated using (true)'),
      ('sc_opex', 'sc_opex_insert',
       'create policy sc_opex_insert on public.sc_opex for insert to authenticated with check (true)'),
      ('sc_opex', 'sc_opex_update',
       'create policy sc_opex_update on public.sc_opex for update to authenticated using (true) with check (true)'),
      ('sc_opex', 'sc_opex_delete_admin',
       'create policy sc_opex_delete_admin on public.sc_opex for delete using (public.sc_get_my_role() = any (array[''admin'',''co-admin'']))'),

      ('sc_opex_history', 'opex_history_read',
       'create policy opex_history_read on public.sc_opex_history for select to authenticated using (true)'),
      ('sc_opex_history', 'opex_history_write',
       'create policy opex_history_write on public.sc_opex_history for insert to authenticated with check (public.sc_get_my_role() = any (array[''admin'',''co-admin'']))'),
      ('sc_opex_history', 'opex_history_delete',
       'create policy opex_history_delete on public.sc_opex_history for delete to authenticated using (public.sc_get_my_role() = ''admin'')'),

      ('sc_employees', 'sc_employees_admin_co_admin',
       'create policy sc_employees_admin_co_admin on public.sc_employees using (public.sc_get_my_role() = any (array[''admin'',''co-admin''])) with check (public.sc_get_my_role() = any (array[''admin'',''co-admin'']))'),

      ('sc_settings', 'sc_settings_read',
       'create policy sc_settings_read on public.sc_settings for select to authenticated using (true)'),
      ('sc_settings', 'sc_settings_write_admin',
       'create policy sc_settings_write_admin on public.sc_settings to authenticated using (public.sc_get_my_role() = any (array[''admin'',''co-admin''])) with check (public.sc_get_my_role() = any (array[''admin'',''co-admin'']))')
    ) as v(tbl, pol, ddl)
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = p.tbl and policyname = p.pol
    ) then
      execute p.ddl;
    end if;
  end loop;
end $$;

-- ── 6. Trigger เขียน audit ลง ledger ของคลังสินค้า ───────────────────────
-- sc_sales/sc_payments/sc_opex เขียน before/after JSON ลง inv_audit_logs ผ่าน
-- inv_fn_write_audit_log() (คนละสายกับ sc_audit_logs ที่ lib/audit.ts เขียน — ห้ามรวมกัน
-- ดูกฎข้อ 1 ใน CLAUDE.md) ฟังก์ชันตัวนี้เป็นของฝั่ง production ที่มี prefix inv_ ซึ่งบนฐานข้อมูล
-- ที่สร้างจาก migrations ล้วนๆ จะไม่มี (ที่นั่นชื่อ fn_write_audit_log) — ถ้าไม่มีก็ข้ามไปเงียบๆ
-- ไม่ error เพราะ audit ฝั่งคลังสินค้าไม่ใช่เงื่อนไขที่ทำให้โมดูลการเงินทำงานไม่ได้
do $$
declare
  t text;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'inv_fn_write_audit_log'
  ) then
    raise notice '0012: ข้ามการสร้าง trigger audit ของ sc_* เพราะไม่มีฟังก์ชัน inv_fn_write_audit_log()';
    return;
  end if;

  foreach t in array array['sales', 'payments', 'opex'] loop
    if not exists (select 1 from pg_trigger where tgname = 'sc_trg_audit_' || t) then
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.inv_fn_write_audit_log()',
        'sc_trg_audit_' || t, 'sc_' || t
      );
    end if;
  end loop;
end $$;
