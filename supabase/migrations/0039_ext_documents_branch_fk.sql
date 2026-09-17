-- 0039_ext_documents_branch_fk.sql
--
-- 🔴 [แก้บั๊กจริง 2026-09-17] กด "ออกเอกสาร" ที่ /invoicing แล้วขึ้น overlay
-- "An error occurred in the Server Components render" — PM2 log จริงคือ
--   insert or update on table "ext_documents" violates foreign key constraint
--   "ext_documents_branch_id_fkey"
--
-- สาเหตุ: 0009 ให้ ext_documents.branch_id ชี้ไป extension_layer.ext_branches
-- (ตารางสาขาของโมดูล SmartAcc ที่แอปไม่เคยใส่แถว) แต่ createSmartAccDocument()
-- ใส่ profiles.branch_id ซึ่งชี้ public.inv_branches / public.branches (สาขาจริงของร้าน)
-- ⇒ UUID ถูกต้องของร้าน ถูกปฏิเสธทุกครั้ง เอกสารออกไม่ได้เลยตั้งแต่มีหน้านี้
--
-- แก้โดยย้าย FK ไปตารางสาขาจริงของแอป — เลือก inv_branches ถ้ามี (production)
-- ไม่เช่นนั้น branches (local/CI จาก 0001) รูปแบบเดียวกับ 0012 ของ sc_users.branch_id
-- คอลัมน์ยังเป็น nullable: แอดมินที่ยังไม่เลือกสาขาที่หัวเว็บใส่ null ได้ตามเดิม

do $$
declare
  v_target text;
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'extension_layer' and tablename = 'ext_documents'
  ) then
    return;
  end if;

  if exists (select 1 from pg_constraint where conname = 'ext_documents_branch_id_fkey') then
    alter table extension_layer.ext_documents drop constraint ext_documents_branch_id_fkey;
  end if;

  select t into v_target
  from (values ('inv_branches'), ('branches')) as candidates(t)
  where exists (select 1 from pg_tables where schemaname = 'public' and tablename = candidates.t)
  limit 1;

  if v_target is null then
    raise notice '0039: ไม่พบ public.inv_branches หรือ public.branches — ข้ามการผูก FK ใหม่';
    return;
  end if;

  execute format(
    'alter table extension_layer.ext_documents
       add constraint ext_documents_branch_id_fkey
       foreign key (branch_id) references public.%I(id)',
    v_target
  );
end $$;
