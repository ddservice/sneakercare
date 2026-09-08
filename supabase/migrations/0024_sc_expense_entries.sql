-- ═══════════════════════════════════════════════════════════════════════════
-- 0024 — ตารางค่าใช้จ่ายแบบมีชนิดจริง (ขั้นที่ 1 ของ docs/sc-opex-refactor-plan.md)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ทำไม: `sc_opex` เป็น key-value store ที่เก็บของ 20 รูปแบบปนกันใน 385 แถว แยกกันด้วย
-- `category`/`key` ที่เป็น free-text ไม่มี enum บังคับที่ระดับฐานข้อมูล — บั๊กเรื่องเงินทุกตัว
-- ที่เจอมามีต้นตอเดียวกันหมด (หมวดหายจากยอดเพราะ whitelist, เงินเดือนถูกนับซ้ำ, รายรับถูกนับ
-- เป็นรายจ่าย, timestamp โผล่ในคอลัมน์ amount, ของที่ซื้อบันทึกแค่ฝั่งคลังจนหายจากยอดกำไร)
--
-- ⚠️ migration นี้ **ไม่แตะ `sc_opex` เลยแม้แต่นิดเดียว** — เป็นการเพิ่มตารางใหม่ข้างๆ เท่านั้น
-- เพราะหน้าการเงินของระบบเดิม (`legacy/sneakercare_dashboard.html` ที่ยังใช้งานจริงทุกวัน)
-- อ่านและเขียน `sc_opex` ตรงๆ ผ่าน Google Apps Script ซึ่ง repo นี้แก้ไม่ได้
-- ถ้าไปแตะโครงสร้างเดิม ร้านจะบันทึกเงินไม่ได้ทันทีในวันที่ deploy
--
-- ⚠️ apply ด้วยมือผ่าน Supabase SQL Editor (repo ไม่มีสิทธิ์ DDL ไปที่ SneakerCareDB)
-- พิสูจน์ว่ารันได้จริงด้วย `npm run test:migration` (รันใส่ Postgres จริงผ่าน PGlite)
--
-- rollback: `supabase/migrations/rollback/0024_rollback.sql` (ปลอดภัยเพราะยังไม่มีใครอ่านตารางนี้)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. ตารางอ้างอิงหมวดค่าใช้จ่าย ──────────────────────────────────────────
--
-- ทำไมเป็นตารางไม่ใช่ enum: เจ้าของต้องเพิ่มหมวดใหม่ได้เองโดยไม่ต้องรัน migration
-- แต่ต้องเพิ่มผ่านตารางนี้เท่านั้น ไม่ใช่พิมพ์ชื่อใหม่ลงไปในแถวค่าใช้จ่ายได้เลยแบบเดิม
-- ⚠️ ค่า key ต้องตรงกับ `ExpenseCategoryKey` ใน lib/expense-categories.ts เสมอ
create table if not exists public.sc_expense_categories (
  key         text primary key,
  label       text        not null,
  short_label text        not null,
  sort_order  int         not null default 100,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

insert into public.sc_expense_categories (key, label, short_label, sort_order) values
  ('payroll',            'ค่าแรงและเงินเดือนพนักงาน (Staff & Payroll)',       'ค่าแรง & เงินเดือน',      10),
  ('facility_utilities', 'สาธารณูปโภคและค่าเช่าร้าน (Utilities & Rent)',      'สาธารณูปโภค & ค่าเช่า',   20),
  ('supplies_cogs',      'ต้นทุนน้ำยาและวัสดุสิ้นเปลือง (Supplies)',          'น้ำยา & วัสดุสิ้นเปลือง', 30),
  ('marketing',          'การตลาดและส่งเสริมการขาย (Marketing & PR)',         'การตลาด & โฆษณา',        40),
  ('tax_professional',   'ภาษี ค่าธรรมเนียม และบัญชี (Taxes & Professional)', 'ภาษี & ค่าวิชาชีพ',       50),
  ('admin_general',      'ดำเนินงานทั่วไปและเบ็ดเตล็ด (General & Admin)',     'ดำเนินงาน & เบ็ดเตล็ด',   60),
  ('partner_share',      'ส่วนแบ่งกำไรหุ้นส่วน (Partner Profit Share)',       'ส่วนแบ่งหุ้นส่วน',        70)
on conflict (key) do nothing;

-- ── 2. ตารางค่าใช้จ่ายตัวจริง ──────────────────────────────────────────────
create table if not exists public.sc_expense_entries (
  id             bigserial primary key,

  -- วันที่จ่ายจริง ไม่ใช่ข้อความ "MM/YYYY" แบบเดิม — เรียง/กรอง/รวมตามช่วงวันได้ตรงๆ
  entry_date     date          not null,

  -- ⚠️ constraint นี้คือสิ่งที่กัน "timestamp โผล่ในคอลัมน์เงิน" ที่เคยเป็นระเบิดเวลามาก่อน
  -- (แถว audit_log เคยเก็บ epoch ms = 1.78 ล้านล้าน ไว้ใน amount) และกันยอด 0/ติดลบไปด้วย
  amount         numeric(12,2) not null check (amount > 0 and amount < 10000000),

  category       text          not null references public.sc_expense_categories(key),
  title          text          not null check (length(btrim(title)) > 0),
  pay_method     text          not null default 'บัญชีร้าน',
  note           text,

  -- กฎข้อ 11/12: ทุกอย่างที่เกี่ยวกับเงินต้องรู้ว่าเป็นของสาขาไหน
  branch_id      uuid          references public.inv_branches(id),

  -- ⭐ หัวใจของ migration นี้: ผูกค่าใช้จ่ายกับ "ของที่รับเข้าคลัง" ตรงๆ
  -- ต้นตอที่ยอดไม่ตรงกับ Excel มาตลอดคือระบบมี ledger เงินสองสายที่ไม่คุยกัน
  -- (`inv_stock_transactions` กับ `sc_opex`) แล้วหน้าการเงินอ่านแค่สายเดียว
  -- คอลัมน์นี้ทำให้ "ของที่ซื้อแล้วแต่ยังไม่ลงค่าใช้จ่าย" กลายเป็นคำถามที่ query ตอบได้
  -- แทนที่จะต้องมีสคริปต์คอยไล่เทียบยอดรวมทีหลัง
  stock_txn_id   uuid          references public.inv_stock_transactions(id),

  -- ตามรอยกลับไปแถวเดิมใน sc_opex ได้ตลอดช่วงที่ยังเขียนสองที่ (ขั้น 2-4 ของแผน)
  legacy_opex_id bigint,

  created_by     uuid          references public.profiles(id),
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);

-- กันบันทึกซ้ำจากการ backfill รันหลายรอบ (ขั้น 3 ของแผน)
create unique index if not exists sc_expense_entries_legacy_uidx
  on public.sc_expense_entries (legacy_opex_id)
  where legacy_opex_id is not null;

-- ของที่รับเข้าคลังหนึ่งรายการ ต้องผูกกับค่าใช้จ่ายได้ไม่เกินหนึ่งแถว ไม่งั้นกลายเป็นนับซ้ำ
create unique index if not exists sc_expense_entries_stock_txn_uidx
  on public.sc_expense_entries (stock_txn_id)
  where stock_txn_id is not null;

create index if not exists sc_expense_entries_date_idx     on public.sc_expense_entries (entry_date desc);
create index if not exists sc_expense_entries_category_idx on public.sc_expense_entries (category, entry_date desc);
create index if not exists sc_expense_entries_branch_idx   on public.sc_expense_entries (branch_id, entry_date desc);

-- ── 3. RLS ─────────────────────────────────────────────────────────────────
--
-- ตามกฎข้อ 4 (บังคับที่ RLS เป็นด่านหลัก) และกฎข้อ 5 (staff ต้องไม่เห็นข้อมูลต้นทุน)
-- ค่าใช้จ่าย = ข้อมูลเงินของร้าน ⇒ เฉพาะ admin/co-admin เหมือน `sc_opex` หลัง migration 0017
alter table public.sc_expense_categories enable row level security;
alter table public.sc_expense_entries    enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'sc_expense_categories' and policyname = 'sc_expense_categories_read') then
    create policy sc_expense_categories_read on public.sc_expense_categories
      for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'sc_expense_entries' and policyname = 'sc_expense_entries_read') then
    create policy sc_expense_entries_read on public.sc_expense_entries
      for select to authenticated
      using (public.sc_get_my_role() = any (array['admin', 'co-admin']));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'sc_expense_entries' and policyname = 'sc_expense_entries_insert') then
    create policy sc_expense_entries_insert on public.sc_expense_entries
      for insert to authenticated
      with check (public.sc_get_my_role() = any (array['admin', 'co-admin']));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'sc_expense_entries' and policyname = 'sc_expense_entries_update') then
    create policy sc_expense_entries_update on public.sc_expense_entries
      for update to authenticated
      using (public.sc_get_my_role() = any (array['admin', 'co-admin']))
      with check (public.sc_get_my_role() = any (array['admin', 'co-admin']));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'sc_expense_entries' and policyname = 'sc_expense_entries_delete') then
    create policy sc_expense_entries_delete on public.sc_expense_entries
      for delete to authenticated
      using (public.sc_get_my_role() = 'admin');
  end if;
end $$;

-- ด่านที่สอง: ถอนสิทธิ์ anon ตั้งแต่ระดับ GRANT (บทเรียนจาก 0016 — RLS ด่านเดียวไม่พอ
-- เพราะพลาด policy เดียวก็หลุดหมด และ view ตัวเดียวเปิดทะลุได้ทุกอย่าง)
revoke all on public.sc_expense_categories from anon;
revoke all on public.sc_expense_entries    from anon;

-- ── 4. trigger อัปเดต updated_at ───────────────────────────────────────────
create or replace function public.sc_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp   -- ตามบทเรียน migration 0019 (function search_path mutable)
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sc_expense_entries_touch on public.sc_expense_entries;
create trigger sc_expense_entries_touch
  before update on public.sc_expense_entries
  for each row execute function public.sc_touch_updated_at();

comment on table public.sc_expense_entries is
  'ค่าใช้จ่ายแบบมีชนิดจริง — ตัวแทนของ sc_opex ในอนาคต (ดู docs/sc-opex-refactor-plan.md) '
  'ยังไม่มีหน้าไหนอ่านตารางนี้จนกว่าจะถึงขั้นที่ 4 ของแผน';
comment on column public.sc_expense_entries.stock_txn_id is
  'ผูกกับของที่รับเข้าคลัง — ทำให้ "ซื้อของแล้วแต่ยังไม่ลงค่าใช้จ่าย" เป็นคำถามที่ query ตอบได้';
