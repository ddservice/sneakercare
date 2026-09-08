-- ═══════════════════════════════════════════════════════════════════════════
-- 0026 — แยกเงินเดือนและห้องเช่าออกจาก sc_opex (ขั้นที่ 5 ของ
--        docs/sc-opex-refactor-plan.md)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ทำไม: ตอนนี้สลิปเงินเดือนของพนักงานหนึ่งคนหนึ่งเดือน ถูกกระจายเป็น **7-9 แถว**
-- ใน `sc_opex` ที่แยกกันด้วยชื่อคีย์ที่เอาชื่อคนมาต่อท้าย:
--   emp_<ชื่อ> · empd_base_sal_<ชื่อ> · empd_comm_pct_<ชื่อ> · empd_diligence_<ชื่อ>
--   empd_ot_<ชื่อ> · empd_wht_<ชื่อ> · empd_deduct_total_<ชื่อ> · empd_deduct_json_<ชื่อ>
--   empd_deduct_items_<ชื่อ>
-- ผลที่ตามมาจริงในโปรเจกต์นี้:
--   • เปลี่ยนชื่อพนักงาน = ข้อมูลเงินเดือนเดิมหายทันที (คีย์ไม่ match)
--   • รายการหักมี JSON **สองรูปแบบ** ที่ต่างกัน ({type,detail,minutes,rate,amount} ของเก่า
--     กับ {name,amount} ของใหม่) โค้ดต้องเดาว่าเจอแบบไหน
--   • แถว empd_* มีเงินอยู่จริงแต่ห้ามนับ ต้องมี isPayslipInternalRow() คอยกันไว้ทุกจุด
--   • ห้องเช่าเก็บ "รายรับ" ไว้ใน category rental_income แต่ "ค่าเช่า/มิเตอร์" ไว้ใน
--     rental_meter — เคยทำให้รายรับถูกนับเป็นรายจ่ายมาแล้ว (บั๊กจริง 2026-09-02)
--
-- ⚠️ migration นี้ **ไม่แตะ `sc_opex` เลยแม้แต่แถวเดียว** — เพิ่มตารางใหม่ข้างๆ เท่านั้น
-- หน้าการเงินของระบบเดิม (Google Apps Script) ยังอ่าน/เขียน `sc_opex` อยู่และ repo นี้แก้ไม่ได้
--
-- ⚠️ apply ด้วยมือผ่าน Supabase SQL Editor · rollback: rollback/0026_rollback.sql
-- พิสูจน์ว่ารันได้จริงด้วย `npm run test:migration`
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. สลิปเงินเดือน: หนึ่งคน หนึ่งเดือน = หนึ่งแถว ────────────────────────
create table if not exists public.sc_payslips (
  id              bigserial primary key,

  -- คงรูปแบบ "MM/YYYY" ไว้ให้ตรงกับ sc_opex ตลอดช่วงเปลี่ยนผ่าน (จับคู่ย้อนกลับได้)
  month           text          not null check (month ~ '^[0-9]{2}/[0-9]{4}$'),
  employee_name   text          not null check (length(btrim(employee_name)) > 0),

  base_salary     numeric(12,2) not null default 0 check (base_salary     >= 0 and base_salary     < 10000000),
  diligence       numeric(12,2) not null default 0 check (diligence       >= 0 and diligence       < 10000000),
  ot              numeric(12,2) not null default 0 check (ot              >= 0 and ot              < 10000000),
  commission_pct  numeric(6,2)  not null default 0 check (commission_pct  >= 0 and commission_pct  <= 100),
  wht             numeric(12,2) not null default 0 check (wht             >= 0 and wht             < 10000000),
  deduction_total numeric(12,2) not null default 0 check (deduction_total >= 0 and deduction_total < 10000000),
  days_worked     numeric(6,2)  not null default 0 check (days_worked     >= 0 and days_worked     <= 31),

  -- ยอดที่จ่ายจริง = ตัวเลขเดียวที่หน้าการเงินเอาไปรวมเป็นค่าใช้จ่าย
  net_pay         numeric(12,2) not null default 0 check (net_pay         >= 0 and net_pay         < 10000000),

  branch_id       uuid          references public.inv_branches(id),   -- กฎข้อ 11/12
  legacy_ref      text,                                              -- "<month>|<employee_name>"
  created_by      uuid          references public.profiles(id),
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),

  -- หนึ่งคนมีสลิปได้ใบเดียวต่อเดือน — เดิมไม่มีอะไรกัน จึงเกิดแถวซ้ำได้เงียบๆ
  unique (month, employee_name)
);

create unique index if not exists sc_payslips_legacy_ref_uidx
  on public.sc_payslips (legacy_ref) where legacy_ref is not null;
create index if not exists sc_payslips_month_idx on public.sc_payslips (month);

-- ── 2. รายการหักของสลิป: แตกจาก JSON สองรูปแบบมาเป็นแถวจริง ────────────────
create table if not exists public.sc_payslip_deductions (
  id          bigserial primary key,
  payslip_id  bigint        not null references public.sc_payslips(id) on delete cascade,
  name        text          not null check (length(btrim(name)) > 0),
  amount      numeric(12,2) not null check (amount > 0 and amount < 10000000),

  -- สามช่องนี้มีเฉพาะรายการหักรูปแบบเก่า ({type,detail,minutes,rate,amount})
  -- รูปแบบใหม่ ({name,amount}) จะเป็น null — เก็บไว้เพื่อไม่ให้ข้อมูล มี.ค.–มิ.ย. 69 หายไป
  kind        text,
  detail      text,
  minutes     numeric(8,2),
  rate        numeric(12,2),

  legacy_ref  text,   -- "<month>|<employee_name>|<index>"
  created_at  timestamptz not null default now()
);

create unique index if not exists sc_payslip_deductions_legacy_ref_uidx
  on public.sc_payslip_deductions (legacy_ref) where legacy_ref is not null;
create index if not exists sc_payslip_deductions_payslip_idx
  on public.sc_payslip_deductions (payslip_id);

-- ── 3. ห้องเช่า: รวม "มิเตอร์ + ค่าเช่า + รายรับ" ของห้องหนึ่งเดือนหนึ่งไว้แถวเดียว ──
--
-- เดิมกระจายอยู่ 4 คีย์ใน 2 category ที่ต่างกัน (rental_meter กับ rental_income)
-- ซึ่งเคยทำให้ filter เช็คชื่อ category ผิดตัวแล้วนับรายรับเป็นรายจ่ายมาแล้ว
create table if not exists public.sc_rental_records (
  id            bigserial primary key,
  month         text          not null check (month ~ '^[0-9]{2}/[0-9]{4}$'),
  room_index    int           not null check (room_index >= 0),
  room_name     text,

  prev_meter    numeric(12,2) not null default 0 check (prev_meter    >= 0),
  curr_meter    numeric(12,2) not null default 0 check (curr_meter    >= 0),
  rent_amount   numeric(12,2) not null default 0 check (rent_amount   >= 0 and rent_amount   < 10000000),
  -- ⚠️ นี่คือ **รายรับ** ไม่ใช่รายจ่าย — อยู่คนละตารางกับค่าใช้จ่ายแล้วจึงสับสนไม่ได้อีก
  income_amount numeric(12,2) not null default 0 check (income_amount >= 0 and income_amount < 10000000),

  branch_id     uuid          references public.inv_branches(id),
  legacy_ref    text,         -- "<month>|<room_index>"
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now(),

  unique (month, room_index)
);

create unique index if not exists sc_rental_records_legacy_ref_uidx
  on public.sc_rental_records (legacy_ref) where legacy_ref is not null;
create index if not exists sc_rental_records_month_idx on public.sc_rental_records (month);

-- ── 4. RLS ─────────────────────────────────────────────────────────────────
--
-- เงินเดือนเป็นข้อมูลที่อ่อนไหวที่สุดในระบบ (กฎข้อ 5) — เฉพาะ admin/co-admin เท่านั้น
-- แบบเดียวกับที่ 0017 ทำกับ sc_opex
alter table public.sc_payslips            enable row level security;
alter table public.sc_payslip_deductions  enable row level security;
alter table public.sc_rental_records      enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['sc_payslips', 'sc_payslip_deductions', 'sc_rental_records'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_read') then
      execute format(
        'create policy %I on public.%I for select to authenticated
           using (public.sc_get_my_role() = any (array[''admin'',''co-admin'']))', t||'_read', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_insert') then
      execute format(
        'create policy %I on public.%I for insert to authenticated
           with check (public.sc_get_my_role() = any (array[''admin'',''co-admin'']))', t||'_insert', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_update') then
      execute format(
        'create policy %I on public.%I for update to authenticated
           using (public.sc_get_my_role() = any (array[''admin'',''co-admin'']))
           with check (public.sc_get_my_role() = any (array[''admin'',''co-admin'']))', t||'_update', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_delete') then
      execute format(
        'create policy %I on public.%I for delete to authenticated
           using (public.sc_get_my_role() = ''admin'')', t||'_delete', t);
    end if;
    -- ด่านที่สอง: ถอนสิทธิ์ anon ตั้งแต่ระดับ GRANT (บทเรียนจาก 0016 — RLS ด่านเดียวไม่พอ)
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ── 5. trigger updated_at (ใช้ฟังก์ชันเดิมจาก 0024) ────────────────────────
drop trigger if exists sc_payslips_touch on public.sc_payslips;
create trigger sc_payslips_touch
  before update on public.sc_payslips
  for each row execute function public.sc_touch_updated_at();

drop trigger if exists sc_rental_records_touch on public.sc_rental_records;
create trigger sc_rental_records_touch
  before update on public.sc_rental_records
  for each row execute function public.sc_touch_updated_at();

comment on table public.sc_payslips is
  'สลิปเงินเดือน หนึ่งคนหนึ่งเดือนหนึ่งแถว — แทน emp_*/empd_* ที่กระจายอยู่ 7-9 แถวใน sc_opex '
  '(ดู docs/sc-opex-refactor-plan.md) · ยังไม่มีหน้าไหนอ่านจนกว่าจะสลับการอ่านเสร็จ';
comment on table public.sc_rental_records is
  'ห้องเช่า: มิเตอร์ + ค่าเช่า + รายรับ ของห้องหนึ่งเดือนหนึ่งไว้แถวเดียว '
  '— income_amount เป็นรายรับ ไม่ใช่รายจ่าย (เดิมอยู่คนละ category จนเคยถูกนับสลับกันมาแล้ว)';
