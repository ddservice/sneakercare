-- ════════════════════════════════════════════════════════════════════════
--  0042_wht_rent.sql
--  ผู้รับเงินหัก ณ ที่จ่าย + หนังสือรับรอง 50 ทวิ + หมวดค่าเช่าอาคาร
--  + รายได้ค่าเช่าห้องถูกหักภาษีไว้
-- ════════════════════════════════════════════════════════════════════════
--
-- WHT ไม่ใช่รายจ่ายเพิ่ม: sc_opex.amount ยังเป็นยอดเต็ม (ฐาน+VAT)
-- แถวใน sc_wht_certificates เก็บอัตรา/ยอดหัก/ยอดโอนสุทธิ สำหรับ ภ.ง.ด.3/53
-- และพิมพ์ 50 ทวิ — ห้ามเอา tax_amount ไปบวก sc_opex อีกครั้ง
--
-- sc_expense_categories เป็นตารางอ้างอิงกลางใช้ร่วมทุก tenant (ดู 0028/0031)

insert into public.sc_expense_categories (key, label, short_label, sort_order)
values (
  'building_rent',
  'ค่าเช่าอาคารและสถานที่ (Building Rent)',
  'ค่าเช่าอาคาร/สถานที่',
  15
)
on conflict (key) do update
  set label = excluded.label,
      short_label = excluded.short_label,
      sort_order = excluded.sort_order;

-- ── ผู้รับเงิน / เจ้าของตึก ───────────────────────────────────────────────
create table if not exists public.sc_wht_payees (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id),
  kind          text not null check (kind in ('person', 'juristic')),
  name          text not null check (length(btrim(name)) > 0),
  tax_id        text not null check (tax_id ~ '^[0-9]{13}$'),
  address       text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, tax_id)
);

create index if not exists sc_wht_payees_tenant_idx
  on public.sc_wht_payees (tenant_id, name);

-- ── หนังสือรับรองหัก ณ ที่จ่าย (หนึ่งใบต่อรายการที่หัก) ───────────────────
create table if not exists public.sc_wht_certificates (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id),
  payee_id             uuid references public.sc_wht_payees(id),
  direction            text not null default 'payable'
                         check (direction in ('payable', 'receivable')),
  form_type            text not null check (form_type in ('PND3', 'PND53')),
  income_type_code     text not null default '5',
  income_type_label    text not null default 'ค่าเช่า',
  certificate_number   text not null,
  payment_date         date not null,
  base_amount          numeric(12,2) not null check (base_amount >= 0 and base_amount < 10000000),
  vat_amount           numeric(12,2) not null default 0 check (vat_amount >= 0 and vat_amount < 10000000),
  gross_amount         numeric(12,2) not null check (gross_amount >= 0 and gross_amount < 10000000),
  wht_rate             numeric(6,2)  not null check (wht_rate in (1, 2, 3, 5)),
  tax_amount           numeric(12,2) not null check (tax_amount >= 0 and tax_amount < 10000000),
  net_payment          numeric(12,2) not null check (net_payment >= 0 and net_payment < 10000000),
  legacy_opex_id       bigint,
  rental_record_id     bigint,
  note                 text,
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  unique (tenant_id, certificate_number)
);

create unique index if not exists sc_wht_certificates_opex_uidx
  on public.sc_wht_certificates (tenant_id, legacy_opex_id)
  where legacy_opex_id is not null;

create unique index if not exists sc_wht_certificates_rental_uidx
  on public.sc_wht_certificates (tenant_id, rental_record_id)
  where rental_record_id is not null;

create index if not exists sc_wht_certificates_period_idx
  on public.sc_wht_certificates (tenant_id, payment_date, form_type);

-- ── รายได้ค่าเช่าห้อง: ผู้เช่า + ถูกหัก ณ ที่จ่ายไว้ ─────────────────────
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'sc_rental_records') then
    alter table public.sc_rental_records
      add column if not exists tenant_name text,
      add column if not exists tenant_tax_id text,
      add column if not exists wht_rate numeric(6,2) not null default 0
        check (wht_rate in (0, 1, 2, 3, 5)),
      add column if not exists wht_withheld numeric(12,2) not null default 0
        check (wht_withheld >= 0 and wht_withheld < 10000000);
  end if;
end $$;

-- ── RLS: ข้อมูลเงิน — admin/co-admin ของ tenant ตัวเอง · super_admin ข้ามได้
alter table public.sc_wht_payees enable row level security;
alter table public.sc_wht_certificates enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.sc_wht_payees from anon;
    revoke all on public.sc_wht_certificates from anon;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'sc_get_my_role'
  ) or not exists (
    select 1 from pg_proc where proname = 'fn_current_tenant'
  ) then
    raise notice '[0042] ข้าม RLS policy — ยังไม่มี sc_get_my_role/fn_current_tenant (สภาพแวดล้อมเทสต์)';
    return;
  end if;

  if not exists (select 1 from pg_policies where policyname = 'sc_wht_payees_read') then
    execute $ddl$
      create policy sc_wht_payees_read on public.sc_wht_payees for select to authenticated
        using ((public.sc_get_my_role() = 'super_admin')
          or (tenant_id = public.fn_current_tenant()
              and public.sc_get_my_role() = any (array['admin'::text, 'co-admin'::text, 'co_admin'::text])))
    $ddl$;
  end if;
  if not exists (select 1 from pg_policies where policyname = 'sc_wht_payees_write') then
    execute $ddl$
      create policy sc_wht_payees_write on public.sc_wht_payees for all to authenticated
        using ((public.sc_get_my_role() = 'super_admin')
          or (tenant_id = public.fn_current_tenant()
              and public.sc_get_my_role() = any (array['admin'::text, 'co-admin'::text, 'co_admin'::text])))
        with check ((public.sc_get_my_role() = 'super_admin')
          or (tenant_id = public.fn_current_tenant()
              and public.sc_get_my_role() = any (array['admin'::text, 'co-admin'::text, 'co_admin'::text])))
    $ddl$;
  end if;
  if not exists (select 1 from pg_policies where policyname = 'sc_wht_certificates_read') then
    execute $ddl$
      create policy sc_wht_certificates_read on public.sc_wht_certificates for select to authenticated
        using ((public.sc_get_my_role() = 'super_admin')
          or (tenant_id = public.fn_current_tenant()
              and public.sc_get_my_role() = any (array['admin'::text, 'co-admin'::text, 'co_admin'::text])))
    $ddl$;
  end if;
  if not exists (select 1 from pg_policies where policyname = 'sc_wht_certificates_write') then
    execute $ddl$
      create policy sc_wht_certificates_write on public.sc_wht_certificates for all to authenticated
        using ((public.sc_get_my_role() = 'super_admin')
          or (tenant_id = public.fn_current_tenant()
              and public.sc_get_my_role() = any (array['admin'::text, 'co-admin'::text, 'co_admin'::text])))
        with check ((public.sc_get_my_role() = 'super_admin')
          or (tenant_id = public.fn_current_tenant()
              and public.sc_get_my_role() = any (array['admin'::text, 'co-admin'::text, 'co_admin'::text])))
    $ddl$;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'sc_touch_updated_at') then
    if not exists (select 1 from pg_trigger where tgname = 'sc_wht_payees_touch') then
      create trigger sc_wht_payees_touch
        before update on public.sc_wht_payees
        for each row execute function public.sc_touch_updated_at();
    end if;
  end if;
end $$;
