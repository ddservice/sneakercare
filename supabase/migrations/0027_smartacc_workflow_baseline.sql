-- 0027_smartacc_workflow_baseline.sql
--
-- เก็บ DDL ของ extension_layer ที่ถูก apply ลง production ตรงๆ ผ่านสคริปต์ ad-hoc
-- (`scripts/update-smartacc-workflow.sql` + `scripts/recreate-fn.sql`) เข้าระบบ migration
--
-- ⚠️ ทำไมต้องมีไฟล์นี้: ตรวจ production เมื่อ 2026-09-08 พบว่าคอลัมน์ `ref_parent_doc_id` /
-- `ref_parent_doc_number` **มีอยู่จริงบนฐานข้อมูล แต่ไม่มีอยู่ใน migration ไฟล์ไหนเลย**
-- ⇒ ถ้ากู้ระบบขึ้นโปรเจกต์ใหม่จาก `supabase/migrations/` อย่างเดียว การแปลงเอกสาร
-- (QA ➔ DO/INV ➔ BL ➔ REC/TAX) จะพังทันทีเพราะไม่มีคอลัมน์อ้างอิงเอกสารต้นทาง
-- เป็นช่องว่าง disaster recovery แบบเดียวกับที่ `0012_sc_tables_baseline.sql` ปิดไปแล้ว
--
-- ⚠️ **จงใจไม่ยก "ส่วนที่ 4" ของสคริปต์เดิมมา** — ส่วนนั้นเป็น `DELETE FROM` 8 ตาราง
-- แบบไม่มี WHERE (เขียนไว้ตอนล้างข้อมูลทดลองก่อนเปิดใช้จริง) ตอนนี้ตารางพวกนั้นมีเอกสาร
-- ภาษีจริงแล้ว การรันซ้ำ = ล้างใบกำกับภาษี/ใบเสร็จทิ้งทั้งหมดโดยกู้ไม่ได้
-- **ห้ามเติมกลับเข้ามาในไฟล์นี้ไม่ว่ากรณีใด** (ไฟล์ต้นทางถูกลบทิ้งแล้วด้วยเหตุผลเดียวกัน)
--
-- ทุก statement มี guard — ตรวจกับ production จริงแล้วว่าเป็น no-op สนิท

-- ── 1. คอลัมน์อ้างอิงเอกสารต้นทาง (ใช้ตอนแปลง QA → DO/INV → BL → REC/TAX) ──
alter table extension_layer.ext_documents
  add column if not exists ref_parent_doc_id uuid
    references extension_layer.ext_documents(id) on delete set null;

alter table extension_layer.ext_documents
  add column if not exists ref_parent_doc_number varchar(50);

-- ── 2. เลขที่เอกสารเปลี่ยนจากรายเดือน (YYYYMM) เป็นรายวัน (YYYYMMDD) ──────────
-- คอลัมน์ชื่อ `year_month` แต่เก็บ YYYYMMDD จริงๆ ตั้งแต่เปลี่ยนรูปแบบเลขเอกสาร
-- (ไม่เปลี่ยนชื่อคอลัมน์เพราะกระทบ ON CONFLICT ที่ฟังก์ชันด้านล่างใช้อยู่)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'extension_layer'
      and table_name = 'ext_numbering_sequences'
      and column_name = 'year_month'
      and character_maximum_length < 8
  ) then
    alter table extension_layer.ext_numbering_sequences
      alter column year_month type varchar(8);
  end if;
end $$;

-- ── 3. รันเลขเอกสารแบบ atomic ─────────────────────────────────────────────────
-- ⚠️ ต้องเป็น INSERT ... ON CONFLICT DO UPDATE ... RETURNING ก้อนเดียวเสมอ
-- ห้ามแยกเป็น select-แล้ว-update เด็ดขาด: ถ้าออกเอกสารพร้อมกันสองคนจะได้เลขซ้ำ
-- ซึ่งกับใบกำกับภาษีคือปัญหาทางบัญชี ไม่ใช่แค่บั๊ก UI
--
-- ⚠️ `set search_path` บังคับไว้ — ฟังก์ชันนี้เป็น SECURITY DEFINER ถ้าไม่ตั้ง
-- คนเรียกจะชี้ search_path ไปที่ schema ของตัวเองแล้วหลอกให้เขียนตารางปลอมได้
create or replace function extension_layer.fn_generate_document_number(
  p_doc_type varchar(30),
  p_prefix varchar(10),
  p_date_str varchar(8)   -- เช่น '20260830'
)
returns varchar(50)
language plpgsql
security definer
set search_path = extension_layer, pg_temp
as $$
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
$$;
