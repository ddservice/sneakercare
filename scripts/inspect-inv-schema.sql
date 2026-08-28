-- ============================================================================
-- ตรวจสอบ schema แปลกปลอม prefix `inv_` ใน SneakerCareDB (ref mdlxogfkpwejnqpzhmoy)
-- ============================================================================
-- บริบท: 2026-08-26 พบตาราง/view ที่ขึ้นต้นด้วย `inv_` (inv_v_inventory_value,
-- inv_notification_log, ...) อยู่ใน SneakerCareDB ซึ่งเป็น production ที่มีข้อมูล
-- ขายจริงของระบบ legacy (sc_sales, sc_payments, ...) — ของพวกนี้ไม่ได้มาจาก
-- migration ใน repo นี้ (ทั้ง repo ไม่มีที่ไหนอ้าง prefix `inv_`) และไม่มีใครในทีม
-- ตั้งใจสร้าง
--
-- ⚠️ วิธีใช้ — อ่านให้ครบก่อนรัน:
--   1. ไฟล์นี้ **อ่านอย่างเดียวทั้งไฟล์** ไม่มี DROP/DELETE/ALTER สักบรรทัด รันได้ปลอดภัย
--   2. รันใน Supabase Dashboard → SQL Editor ของโปรเจกต์ **SneakerCareDB** เท่านั้น
--      (ไม่ใช่ shoe-care-inventory / tecrcoienazmtbynuqpg ที่ repo นี้ link อยู่)
--   3. ห้าม `supabase link` ไปที่ SneakerCareDB เพื่อรันไฟล์นี้ — เปิด SQL Editor บนเว็บพอ
--   4. อ่านผลทั้ง 6 ส่วนก่อนตัดสินใจลบอะไร โดยเฉพาะ §3 (FK) และ §5 (จำนวนแถว)
--   5. คำสั่งลบอยู่ท้ายไฟล์แบบคอมเมนต์ไว้ — ต้องแก้ด้วยมือทีละบรรทัด ไม่มี auto-drop
-- ============================================================================


-- §1. ตาราง/view/matview ทั้งหมดที่ขึ้นต้นด้วย inv_ ------------------------------
--     ดูว่ามีอะไรบ้าง เป็นชนิดไหน และใครเป็นเจ้าของ
select
  c.relname                                as object_name,
  case c.relkind
    when 'r' then 'table'
    when 'v' then 'view'
    when 'm' then 'materialized view'
    when 'f' then 'foreign table'
    when 'p' then 'partitioned table'
    else c.relkind::text
  end                                      as object_type,
  pg_get_userbyid(c.relowner)              as owner,
  c.relrowsecurity                         as rls_enabled,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname like 'inv\_%'
order by c.relkind, c.relname;


-- §2. วันที่สร้างโดยประมาณ (จาก audit ของ pg ถ้ามี) -----------------------------
--     ช่วยเดาว่าถูกสร้างช่วงไหน เทียบกับ timeline ของทีมได้
select
  schemaname,
  relname,
  n_tup_ins  as rows_inserted_since_stats_reset,
  n_tup_upd  as rows_updated,
  n_tup_del  as rows_deleted,
  last_autoanalyze,
  last_analyze
from pg_stat_user_tables
where schemaname = 'public'
  and relname like 'inv\_%'
order by relname;


-- §3. ⚠️ สำคัญที่สุด: FK ที่โยงระหว่าง inv_* กับตารางอื่น -------------------------
--     ถ้าผลลัพธ์ว่าง = inv_* ไม่ผูกกับ sc_* เลย ลบได้ปลอดภัย
--     ถ้าไม่ว่าง = **ห้ามลบ** จนกว่าจะเข้าใจว่าใครอ้างใคร
select
  con.conname                        as constraint_name,
  src_ns.nspname || '.' || src.relname  as referencing_table,
  tgt_ns.nspname || '.' || tgt.relname  as referenced_table,
  pg_get_constraintdef(con.oid)      as definition
from pg_constraint con
join pg_class src      on src.oid = con.conrelid
join pg_namespace src_ns on src_ns.oid = src.relnamespace
join pg_class tgt      on tgt.oid = con.confrelid
join pg_namespace tgt_ns on tgt_ns.oid = tgt.relnamespace
where con.contype = 'f'
  and (src.relname like 'inv\_%' or tgt.relname like 'inv\_%')
order by referencing_table, constraint_name;


-- §4. object อื่นที่ "พึ่งพา" inv_* อยู่ (view ซ้อน view, function, trigger) --------
--     ถ้ามี view ชื่อปกติที่ select จาก inv_* อยู่ การ drop จะทำให้ของนั้นพังตาม
select distinct
  dependent_ns.nspname || '.' || dependent.relname as dependent_object,
  case dependent.relkind
    when 'v' then 'view' when 'm' then 'materialized view'
    when 'r' then 'table' else dependent.relkind::text
  end                                              as dependent_type,
  source_ns.nspname || '.' || source.relname       as depends_on_inv_object
from pg_depend d
join pg_rewrite r          on r.oid = d.objid
join pg_class dependent    on dependent.oid = r.ev_class
join pg_namespace dependent_ns on dependent_ns.oid = dependent.relnamespace
join pg_class source       on source.oid = d.refobjid
join pg_namespace source_ns on source_ns.oid = source.relnamespace
where source.relname like 'inv\_%'
  and dependent.relname not like 'inv\_%'
  and source_ns.nspname = 'public'
order by dependent_object;


-- §5. จำนวนแถวจริงในตาราง inv_* (view ข้ามไป) ---------------------------------
--     ถ้าทุกตารางว่าง = แทบยืนยันได้ว่าเป็นซากที่สร้างทิ้งไว้ ไม่มีใครเขียนข้อมูลลงไป
--     ถ้ามีข้อมูล = ต้องเปิดดูก่อนว่าเป็นข้อมูลอะไร ของใคร
do $$
declare
  r record;
  cnt bigint;
begin
  raise notice '--- row counts for inv_* tables ---';
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'inv\_%'
    order by c.relname
  loop
    execute format('select count(*) from public.%I', r.relname) into cnt;
    raise notice '% : % rows', rpad(r.relname, 40), cnt;
  end loop;
end $$;


-- §6. function/trigger ที่ชื่อขึ้นต้นด้วย inv_ หรืออ้างถึง inv_ ในตัวโค้ด ------------
select
  p.proname                    as function_name,
  pg_get_userbyid(p.proowner)  as owner,
  l.lanname                    as language
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language  l on l.oid = p.prolang
where n.nspname = 'public'
  and (p.proname like 'inv\_%' or p.prosrc like '%inv\_%')
order by p.proname;


-- ============================================================================
-- คำสั่งลบ — ยังไม่เปิดใช้งาน อ่านเงื่อนไขก่อน
-- ============================================================================
-- ลบได้ก็ต่อเมื่อครบทุกข้อนี้:
--   [ ] §3 คืนผลลัพธ์ว่าง (ไม่มี FK เชื่อมกับ sc_* หรือตารางอื่นใด)
--   [ ] §4 คืนผลลัพธ์ว่าง (ไม่มี view/function ปกติที่พึ่งพา inv_* อยู่)
--   [ ] §5 ทุกตารางมี 0 แถว (หรือได้ตรวจแล้วว่าข้อมูลข้างในทิ้งได้จริง)
--   [ ] ได้ backup ของ SneakerCareDB ไว้แล้วก่อนลบ
--
-- ถ้าครบแล้ว: copy ชื่อ object จากผล §1 มาใส่ด้วยมือทีละบรรทัด **ห้ามใช้ loop
-- อัตโนมัติ drop ตามชื่อ pattern** เพราะพลาดครั้งเดียวกินตาราง sc_* ที่มีข้อมูลขายจริงได้
--
--   -- ลบ view ก่อนเสมอ แล้วค่อยลบตาราง
--   drop view if exists public.inv_v_inventory_value;
--   drop table if exists public.inv_notification_log;
--   -- ... (เติมจากผล §1)
--
-- ห้ามใช้ `drop ... cascade` เด็ดขาด — ถ้า drop ธรรมดาแล้วติด dependency
-- แปลว่ายังมีของอื่นพึ่งพาอยู่ ให้กลับไปดู §4 ใหม่ ไม่ใช่บังคับลบทับ
-- ============================================================================
