-- คืน FK ของ ext_documents.branch_id ไปชี้ extension_layer.ext_branches ตาม 0009
-- ใช้ได้เฉพาะตอนที่ยังไม่มีแถวที่ branch_id เป็น UUID ของ inv_branches/branches
-- (ถ้ามีแล้ว Postgres จะปฏิเสธการผูก FK กลับ — อย่า force)

do $$
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

  if exists (
    select 1 from pg_tables
    where schemaname = 'extension_layer' and tablename = 'ext_branches'
  ) then
    alter table extension_layer.ext_documents
      add constraint ext_documents_branch_id_fkey
      foreign key (branch_id) references extension_layer.ext_branches(id);
  end if;
end $$;
