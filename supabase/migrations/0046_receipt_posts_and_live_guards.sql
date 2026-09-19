-- 0046_receipt_posts_and_live_guards.sql
--
-- ตารางลงสมุดซื้อแบบ unique ต่อ tenant + ฟังก์ชันปิดเส้นทาง live
-- รันซ้ำได้ · ยังไม่ apply production จนกว่าเจ้าของสั่ง
-- แอปปัจจุบันยังเขียน JSON ใน sc_settings — ตารางนี้เป็นชั้น DB สำหรับฐานทดสอบ/เมื่ออนุมัติแล้ว

create table if not exists public.sc_receipt_posts (
  tenant_id uuid not null,
  receipt_id text not null,
  request_id text not null,
  fingerprint text not null,
  purchase_amount numeric not null default 0,
  vat_credit numeric not null default 0,
  approved_by uuid,
  created_at timestamptz not null default now(),
  primary key (tenant_id, receipt_id),
  unique (tenant_id, request_id)
);

create index if not exists sc_receipt_posts_tenant_created_idx
  on public.sc_receipt_posts (tenant_id, created_at desc);

comment on table public.sc_receipt_posts is
  'ลงสมุดซื้อหลังอนุมัติ — unique กันใบเดียวกัน/คีย์กันซ้ำ ยังไม่ apply production';

create or replace function public.sc_fn_guard_live_feature(p_feature text)
returns void
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_feature in ('etax_live', 'auto_issue', 'cn_official') then
    raise exception '% ยังไม่เปิดใช้ — บล็อกที่ฐานข้อมูล', p_feature
      using errcode = 'P0001';
  end if;
end;
$function$;

comment on function public.sc_fn_guard_live_feature(text) is
  'ปิด e-Tax ส่งจริง / ตัดสต๊อกอัตโนมัติ / ออกเลข CN ทางการ ที่ชั้น DB';

create or replace function public.sc_fn_post_receipt(
  p_tenant_id uuid,
  p_receipt_id text,
  p_request_id text,
  p_fingerprint text,
  p_purchase_amount numeric,
  p_vat_credit numeric,
  p_approved_by uuid
)
returns table (replay boolean, purchase_amount numeric, vat_credit numeric)
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  existing public.sc_receipt_posts%rowtype;
begin
  if p_tenant_id is null or coalesce(p_receipt_id, '') = '' or coalesce(p_request_id, '') = '' then
    raise exception 'ต้องมี tenant / ใบเสร็จ / คีย์กันซ้ำ' using errcode = '22023';
  end if;

  select * into existing
    from public.sc_receipt_posts
    where tenant_id = p_tenant_id and receipt_id = p_receipt_id
    for update;

  if found then
    if existing.request_id is distinct from p_request_id then
      raise exception 'ใบนี้ลงสมุดแล้วด้วยคีย์อื่น' using errcode = '23505';
    end if;
    if existing.fingerprint is distinct from p_fingerprint then
      raise exception 'คีย์กันซ้ำเดิมแต่ข้อมูลไม่ตรง — ห้ามลงซ้ำ' using errcode = '23514';
    end if;
    replay := true;
    purchase_amount := existing.purchase_amount;
    vat_credit := existing.vat_credit;
    return next;
    return;
  end if;

  begin
    insert into public.sc_receipt_posts (
      tenant_id, receipt_id, request_id, fingerprint, purchase_amount, vat_credit, approved_by
    ) values (
      p_tenant_id, p_receipt_id, p_request_id, p_fingerprint, p_purchase_amount, p_vat_credit, p_approved_by
    );
  exception
    when unique_violation then
      select * into existing
        from public.sc_receipt_posts
        where tenant_id = p_tenant_id and receipt_id = p_receipt_id;
      if not found then
        raise exception 'คีย์กันซ้ำนี้ถูกใช้กับใบอื่นแล้ว' using errcode = '23505';
      end if;
      if existing.request_id is distinct from p_request_id then
        raise exception 'ใบนี้ลงสมุดแล้วด้วยคีย์อื่น' using errcode = '23505';
      end if;
      if existing.fingerprint is distinct from p_fingerprint then
        raise exception 'คีย์กันซ้ำเดิมแต่ข้อมูลไม่ตรง — ห้ามลงซ้ำ' using errcode = '23514';
      end if;
      replay := true;
      purchase_amount := existing.purchase_amount;
      vat_credit := existing.vat_credit;
      return next;
      return;
  end;

  replay := false;
  purchase_amount := p_purchase_amount;
  vat_credit := p_vat_credit;
  return next;
end;
$function$;

comment on function public.sc_fn_post_receipt(uuid, text, text, text, numeric, numeric, uuid) is
  'ลงสมุดซื้อแบบอะตอม — replay คีย์เดิม / conflict ถ้า payload ต่าง / unique กันใบซ้ำ';

alter table public.sc_receipt_posts enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.sc_receipt_posts from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert on public.sc_receipt_posts to authenticated;
    grant execute on function public.sc_fn_post_receipt(uuid, text, text, text, numeric, numeric, uuid) to authenticated;
    grant execute on function public.sc_fn_guard_live_feature(text) to authenticated;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'sc_get_my_role')
     or not exists (select 1 from pg_proc where proname = 'fn_current_tenant') then
    raise notice '[0046] ข้าม RLS policy — ยังไม่มี sc_get_my_role/fn_current_tenant (สภาพแวดล้อมเทสต์)';
    return;
  end if;

  if not exists (select 1 from pg_policies where policyname = 'sc_receipt_posts_tenant') then
    execute $ddl$
      create policy sc_receipt_posts_tenant on public.sc_receipt_posts
        for all to authenticated
        using ((public.sc_get_my_role() = 'super_admin')
          or (tenant_id = public.fn_current_tenant()
              and public.sc_get_my_role() = any (array['admin'::text, 'co-admin'::text, 'co_admin'::text])))
        with check ((public.sc_get_my_role() = 'super_admin')
          or (tenant_id = public.fn_current_tenant()
              and public.sc_get_my_role() = any (array['admin'::text, 'co-admin'::text, 'co_admin'::text])))
    $ddl$;
  end if;
end $$;
