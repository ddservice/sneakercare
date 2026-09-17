-- ย้อน 0036 กลับสู่สภาพเดิม (ไม่มี tenant_id, doc_number/sequence กลับเป็น global unique,
-- RLS กลับเป็น deny-all แบบ 0035)
--
-- ⚠️ ถ้ามีมากกว่า 1 tenant ใช้ doc_number/legacy_contact_id/ตัวนับเลขที่เอกสารซ้ำกันแล้ว
-- การย้อนกลับจะชนกันทันที (UNIQUE เดี่ยวไม่ยอมให้ซ้ำ) — เช็คก่อนด้วย
-- `select doc_number, count(*) from extension_layer.ext_documents group by doc_number having count(*) > 1`
-- ต้องได้ 0 แถวก่อนรันไฟล์นี้เสมอ

do $$
declare
  v_tbl text;
begin
  if not exists (select 1 from pg_namespace where nspname = 'extension_layer') then
    raise notice '[0036 rollback] ไม่พบ schema extension_layer — ข้าม';
    return;
  end if;

  -- คืน RLS เป็น deny-all (ลบ policy ที่ 0036 สร้าง)
  foreach v_tbl in array array[
    'ext_contacts', 'ext_documents', 'ext_document_items', 'ext_billing_references', 'ext_numbering_sequences'
  ]
  loop
    if exists (select 1 from pg_tables where schemaname = 'extension_layer' and tablename = v_tbl) then
      execute format('drop policy if exists %I_tenant_admin on extension_layer.%I', v_tbl, v_tbl);
    end if;
  end loop;
  if exists (select 1 from pg_tables where schemaname = 'extension_layer' and tablename = 'ext_staged_expenses') then
    drop policy if exists ext_staged_expenses_tenant_select on extension_layer.ext_staged_expenses;
    drop policy if exists ext_staged_expenses_tenant_write on extension_layer.ext_staged_expenses;
    drop policy if exists ext_staged_expenses_tenant_update on extension_layer.ext_staged_expenses;
  end if;

  -- คืนฟังก์ชันเดิม (3 พารามิเตอร์ ไม่มี tenant)
  if exists (select 1 from pg_namespace where nspname = 'extension_layer') then
    drop function if exists extension_layer.fn_generate_document_number(varchar, varchar, varchar, uuid);
    create or replace function extension_layer.fn_generate_document_number(
      p_doc_type varchar, p_prefix varchar, p_date_str varchar
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
      insert into extension_layer.ext_numbering_sequences (doc_type, prefix, year_month, current_sequence)
      values (p_doc_type, p_prefix, p_date_str, 1)
      on conflict (doc_type, prefix, year_month)
      do update set current_sequence = extension_layer.ext_numbering_sequences.current_sequence + 1
      returning current_sequence into v_seq;

      v_doc_number := p_prefix || '-' || p_date_str || '-' || lpad(v_seq::text, 4, '0');
      return v_doc_number;
    end;
    $fn$;
  end if;

  -- คืน UNIQUE constraint เดิม
  if exists (select 1 from pg_tables where schemaname = 'extension_layer' and tablename = 'ext_documents') then
    if exists (select 1 from pg_constraint where conname = 'ext_documents_tenant_doc_number_key') then
      alter table extension_layer.ext_documents drop constraint ext_documents_tenant_doc_number_key;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'ext_documents_doc_number_key') then
      alter table extension_layer.ext_documents add constraint ext_documents_doc_number_key unique (doc_number);
    end if;
  end if;

  if exists (select 1 from pg_tables where schemaname = 'extension_layer' and tablename = 'ext_numbering_sequences') then
    if exists (select 1 from pg_constraint where conname = 'ext_numbering_sequences_tenant_key') then
      alter table extension_layer.ext_numbering_sequences drop constraint ext_numbering_sequences_tenant_key;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'ext_numbering_sequences_doc_type_prefix_year_month_key') then
      alter table extension_layer.ext_numbering_sequences
        add constraint ext_numbering_sequences_doc_type_prefix_year_month_key unique (doc_type, prefix, year_month);
    end if;
  end if;

  if exists (select 1 from pg_tables where schemaname = 'extension_layer' and tablename = 'ext_contacts') then
    if exists (select 1 from pg_constraint where conname = 'ext_contacts_tenant_legacy_id_key') then
      alter table extension_layer.ext_contacts drop constraint ext_contacts_tenant_legacy_id_key;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'ext_contacts_legacy_contact_id_key') then
      alter table extension_layer.ext_contacts add constraint ext_contacts_legacy_contact_id_key unique (legacy_contact_id);
    end if;
  end if;

  -- ลบคอลัมน์ tenant_id ออก
  foreach v_tbl in array array[
    'ext_contacts', 'ext_documents', 'ext_document_items',
    'ext_billing_references', 'ext_staged_expenses', 'ext_numbering_sequences'
  ]
  loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'extension_layer' and table_name = v_tbl and column_name = 'tenant_id') then
      execute format('alter table extension_layer.%I drop column tenant_id', v_tbl);
    end if;
  end loop;
end $$;
