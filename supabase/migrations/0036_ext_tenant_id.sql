-- ════════════════════════════════════════════════════════════════════════
--  0036_ext_tenant_id.sql
--  เพิ่ม tenant_id ให้ตาราง ext_* ที่แอปใช้งานจริง + แก้เลขที่เอกสารให้แยกต่อ tenant
--  + แทนที่ deny-all ฉุกเฉินของ 0035 ด้วย RLS ที่กรอง tenant จริง
-- ════════════════════════════════════════════════════════════════════════
--
-- ตารางที่แอปใช้งานจริง (ตรวจด้วย grep `.from("ext_` ทั่ว app/ ก่อนเขียนไฟล์นี้ — ตารางอื่นใน
-- extension_layer ที่เหลือ 11 ตัว ยังไม่มีโค้ดแอปแตะเลยสักจุด จึงยังไม่ใส่ tenant_id ให้ตอนนี้
-- ตามหลัก "ไม่เพิ่ม abstraction เกินกว่าที่ต้องใช้จริง" — เพิ่มทีหลังได้เมื่อมีโค้ดใช้งานจริง):
--   ext_contacts, ext_documents, ext_document_items, ext_billing_references,
--   ext_staged_expenses, ext_numbering_sequences

do $$
declare
  v_t1 uuid := '00000000-0000-0000-0000-000000000001';
  v_tbl text;
begin
  if not exists (select 1 from pg_namespace where nspname = 'extension_layer') then
    raise notice '[0036] ไม่พบ schema extension_layer — ข้ามทั้งไฟล์';
    return;
  end if;

  foreach v_tbl in array array[
    'ext_contacts', 'ext_documents', 'ext_document_items',
    'ext_billing_references', 'ext_staged_expenses', 'ext_numbering_sequences'
  ]
  loop
    if exists (select 1 from pg_tables where schemaname = 'extension_layer' and tablename = v_tbl)
       and not exists (
         select 1 from information_schema.columns
         where table_schema = 'extension_layer' and table_name = v_tbl and column_name = 'tenant_id'
       ) then
      execute format(
        'alter table extension_layer.%I add column tenant_id uuid not null references public.tenants(id) default %L',
        v_tbl, v_t1
      );
    end if;
  end loop;
end $$;

-- ── เลขที่เอกสารต้องไม่ชนกันข้าม tenant (doc_number เดิมเป็น UNIQUE เดี่ยวทั้งระบบ) ──
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'extension_layer' and tablename = 'ext_documents') then
    if exists (select 1 from pg_constraint where conname = 'ext_documents_doc_number_key') then
      alter table extension_layer.ext_documents drop constraint ext_documents_doc_number_key;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'ext_documents_tenant_doc_number_key') then
      alter table extension_layer.ext_documents
        add constraint ext_documents_tenant_doc_number_key unique (tenant_id, doc_number);
    end if;
  end if;
end $$;

-- ── ตัวนับเลขที่เอกสารต้องแยกต่อ tenant ด้วย (ไม่งั้น tenant 2 จะสานต่อเลขของ tenant 1) ──
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'extension_layer' and tablename = 'ext_numbering_sequences') then
    if exists (select 1 from pg_constraint where conname = 'ext_numbering_sequences_doc_type_prefix_year_month_key') then
      alter table extension_layer.ext_numbering_sequences
        drop constraint ext_numbering_sequences_doc_type_prefix_year_month_key;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'ext_numbering_sequences_tenant_key') then
      alter table extension_layer.ext_numbering_sequences
        add constraint ext_numbering_sequences_tenant_key unique (tenant_id, doc_type, prefix, year_month);
    end if;
  end if;
end $$;

-- ── legacy_contact_id ก็ควรแยกต่อ tenant เช่นกัน (สมุดที่อยู่ลูกค้าคนละธุรกิจไม่ควรชนกัน) ──
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'extension_layer' and tablename = 'ext_contacts') then
    if exists (select 1 from pg_constraint where conname = 'ext_contacts_legacy_contact_id_key') then
      alter table extension_layer.ext_contacts drop constraint ext_contacts_legacy_contact_id_key;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'ext_contacts_tenant_legacy_id_key') then
      alter table extension_layer.ext_contacts
        add constraint ext_contacts_tenant_legacy_id_key unique (tenant_id, legacy_contact_id);
    end if;
  end if;
end $$;

-- ── fn_generate_document_number ต้องรับ tenant_id ด้วย — เรียกผ่าน service_role (ไม่มี session
-- ผู้ใช้ให้ derive tenant จาก auth.uid() ได้) จึงต้องรับเป็นพารามิเตอร์ตรงๆ เหมือนที่ lib/tenant.ts
-- ทำกับไฟล์ server action อื่นๆ ทั้ง 10 ไฟล์ที่แก้ไปก่อนหน้านี้ในเซสชันนี้ ──
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'extension_layer') then
    drop function if exists extension_layer.fn_generate_document_number(varchar, varchar, varchar);
    create or replace function extension_layer.fn_generate_document_number(
      p_doc_type varchar, p_prefix varchar, p_date_str varchar, p_tenant_id uuid
    )
    returns varchar
    language plpgsql
    security definer
    set search_path to 'extension_layer', 'pg_temp'
    as $fn$
    declare
      v_seq int;
      v_doc_number varchar(50);
    begin
      if p_tenant_id is null then
        raise exception 'ต้องระบุ tenant_id ก่อนออกเลขที่เอกสาร';
      end if;

      insert into extension_layer.ext_numbering_sequences (doc_type, prefix, year_month, current_sequence, tenant_id)
      values (p_doc_type, p_prefix, p_date_str, 1, p_tenant_id)
      on conflict (tenant_id, doc_type, prefix, year_month)
      do update set current_sequence = extension_layer.ext_numbering_sequences.current_sequence + 1
      returning current_sequence into v_seq;

      v_doc_number := p_prefix || '-' || p_date_str || '-' || lpad(v_seq::text, 4, '0');
      return v_doc_number;
    end;
    $fn$;
  end if;
end $$;

-- ── แทนที่ deny-all ฉุกเฉินของ 0035 ด้วย RLS ที่กรอง tenant จริง (นิยาม role ตรงกับ
-- lib/permissions.ts: invoicing = admin/co_admin, expenses (OCR) view = admin/co_admin/staff
-- write = admin/co_admin) — ใช้ inv_fn_current_role()/fn_current_tenant() ตัวเดียวกับที่ 0031/
-- 0033 ใช้ทั้งระบบแล้ว ไม่สร้างฟังก์ชันซ้ำ ──
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'inv_fn_current_role' and pronamespace = 'public'::regnamespace) then
    raise notice '[0036] ไม่พบ inv_fn_current_role() (ยังไม่ผ่าน 0017+) — ข้ามส่วน RLS policy';
    return;
  end if;

  -- ext_contacts, ext_documents, ext_document_items, ext_billing_references,
  -- ext_numbering_sequences: เฉพาะ admin/co-admin (ตรงกับโมดูล invoicing)
  if exists (select 1 from pg_tables where schemaname = 'extension_layer' and tablename = 'ext_contacts') then
    drop policy if exists ext_contacts_tenant_admin on extension_layer.ext_contacts;
    create policy ext_contacts_tenant_admin on extension_layer.ext_contacts for all to authenticated
      using ((public.inv_fn_current_role() = 'super_admin') or
             (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any(array['admin','co-admin'])))
      with check ((public.inv_fn_current_role() = 'super_admin') or
                  (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any(array['admin','co-admin'])));
  end if;

  if exists (select 1 from pg_tables where schemaname = 'extension_layer' and tablename = 'ext_documents') then
    drop policy if exists ext_documents_tenant_admin on extension_layer.ext_documents;
    create policy ext_documents_tenant_admin on extension_layer.ext_documents for all to authenticated
      using ((public.inv_fn_current_role() = 'super_admin') or
             (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any(array['admin','co-admin'])))
      with check ((public.inv_fn_current_role() = 'super_admin') or
                  (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any(array['admin','co-admin'])));
  end if;

  if exists (select 1 from pg_tables where schemaname = 'extension_layer' and tablename = 'ext_document_items') then
    drop policy if exists ext_document_items_tenant_admin on extension_layer.ext_document_items;
    create policy ext_document_items_tenant_admin on extension_layer.ext_document_items for all to authenticated
      using ((public.inv_fn_current_role() = 'super_admin') or
             (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any(array['admin','co-admin'])))
      with check ((public.inv_fn_current_role() = 'super_admin') or
                  (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any(array['admin','co-admin'])));
  end if;

  if exists (select 1 from pg_tables where schemaname = 'extension_layer' and tablename = 'ext_billing_references') then
    drop policy if exists ext_billing_references_tenant_admin on extension_layer.ext_billing_references;
    create policy ext_billing_references_tenant_admin on extension_layer.ext_billing_references for all to authenticated
      using ((public.inv_fn_current_role() = 'super_admin') or
             (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any(array['admin','co-admin'])))
      with check ((public.inv_fn_current_role() = 'super_admin') or
                  (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any(array['admin','co-admin'])));
  end if;

  if exists (select 1 from pg_tables where schemaname = 'extension_layer' and tablename = 'ext_numbering_sequences') then
    drop policy if exists ext_numbering_sequences_tenant_admin on extension_layer.ext_numbering_sequences;
    create policy ext_numbering_sequences_tenant_admin on extension_layer.ext_numbering_sequences for all to authenticated
      using ((public.inv_fn_current_role() = 'super_admin') or
             (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any(array['admin','co-admin'])))
      with check ((public.inv_fn_current_role() = 'super_admin') or
                  (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any(array['admin','co-admin'])));
  end if;

  -- ext_staged_expenses: อ่านได้ถึง staff (ตรงกับโมดูล expenses) เขียนได้แค่ admin/co-admin
  if exists (select 1 from pg_tables where schemaname = 'extension_layer' and tablename = 'ext_staged_expenses') then
    drop policy if exists ext_staged_expenses_tenant_select on extension_layer.ext_staged_expenses;
    create policy ext_staged_expenses_tenant_select on extension_layer.ext_staged_expenses for select to authenticated
      using ((public.inv_fn_current_role() = 'super_admin') or
             (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any(array['admin','co-admin','staff'])));
    drop policy if exists ext_staged_expenses_tenant_write on extension_layer.ext_staged_expenses;
    create policy ext_staged_expenses_tenant_write on extension_layer.ext_staged_expenses for insert to authenticated
      with check ((public.inv_fn_current_role() = 'super_admin') or
                  (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any(array['admin','co-admin'])));
    drop policy if exists ext_staged_expenses_tenant_update on extension_layer.ext_staged_expenses;
    create policy ext_staged_expenses_tenant_update on extension_layer.ext_staged_expenses for update to authenticated
      using ((public.inv_fn_current_role() = 'super_admin') or
             (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any(array['admin','co-admin'])))
      with check ((public.inv_fn_current_role() = 'super_admin') or
                  (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any(array['admin','co-admin'])));
  end if;
end $$;
