-- ════════════════════════════════════════════════════════════════════════
--  0019_missing_view_and_function_hardening.sql
--  สร้าง view ที่แอปเรียกแต่ไม่เคยมีจริง + ปิดช่องโหว่ search_path + รวมแหล่ง role ให้ครบ
-- ════════════════════════════════════════════════════════════════════════
--
-- ทั้งหมดนี้พบ 2026-09-06 หลัง generate types จากฐานข้อมูล production แล้วให้ TypeScript
-- ตรวจโค้ดจริงเป็นครั้งแรก (ก่อนหน้านี้ทั้งโปรเจกต์ใช้ `as any` ทับไว้ จึงมองไม่เห็นอะไรเลย)
-- บวกกับรายการเตือนจาก Supabase Security Advisor

-- ── 1. v_stock_transactions — view ที่หน้า /adjustments เรียกแต่ไม่เคยถูกสร้าง ──
--
-- 🔴 ผลกระทบ: หน้า "อนุมัติรายการปรับปรุงสต๊อก" ของ Admin query ไปที่ `v_stock_transactions`
-- ซึ่ง **ไม่มีอยู่ในฐานข้อมูล** ⇒ รายการที่รออนุมัติไม่เคยขึ้นให้เห็นเลย
-- ประกอบกับ approveAdjustment() เรียก RPC ผิดชื่อ (แก้ไปแล้วใน app/actions/stock.ts)
-- ⇒ **กฎธุรกิจข้อ 3 ใน CLAUDE.md ("Adjustment ของ Co-Admin ต้องรอ Admin อนุมัติ")
--    ไม่เคยทำงานได้จริงทั้งเส้น**
--
-- migration 0003 นิยาม view นี้ไว้แล้ว แต่เขียนด้วยชื่อตารางแบบไม่มี prefix (stock_transactions,
-- items, branches) ซึ่งบน production เป็นแค่ view alias ที่สร้างทีหลังโดย
-- scripts/apply-aliases-and-unified-schema.sql — ตัว 0003 เองไม่เคยถูก apply ที่นี่
--
-- ⚠️ ต่างจาก 0003 ตรงที่ใช้ `security_invoker = on` (0003 ใช้ false แล้วเขียน WHERE เช็ค role เอง)
-- เพราะ RLS ของ inv_stock_transactions ทำหน้าที่นั้นอยู่แล้ว (admin เห็นทุกสาขา / co-admin
-- เห็นเฉพาะสาขาตัวเอง / staff ไม่เห็น) การพึ่ง RLS ที่เดียวปลอดภัยกว่าการมีตรรกะสิทธิ์ 2 ที่
-- ที่อาจไม่ตรงกัน — และเป็นบทเรียนจากช่องโหว่ SECURITY DEFINER view ที่เพิ่งแก้ไปใน 0016
--
-- view นี้ **ไม่มีคอลัมน์ต้นทุน** (unit_cost_snapshot / total_cost) โดยเจตนา ตามกฎข้อ 5
drop view if exists public.v_stock_transactions;
create view public.v_stock_transactions
with (security_invoker = on) as
select
  st.id,
  st.item_id,
  st.branch_id,
  st.txn_type,
  st.status,
  st.quantity_delta,
  st.reference_type,
  st.reference_note,
  st.corrects_txn_id,
  st.reason,
  st.performed_by,
  st.approved_by,
  st.created_at,
  st.transaction_date,
  i.name as item_name,
  b.name as branch_name,
  p.display_name as performed_by_name
from public.inv_stock_transactions st
join public.inv_items i on i.id = st.item_id
join public.inv_branches b on b.id = st.branch_id
-- left join เพราะ performed_by อาจเป็นบัญชีที่ไม่มีแถวใน profiles (เช่นบัญชีทดสอบเก่า)
-- ถ้าใช้ join ธรรมดา รายการเหล่านั้นจะหายไปจากหน้าอนุมัติเงียบๆ
left join public.profiles p on p.id = st.performed_by;

grant select on public.v_stock_transactions to authenticated;

-- ── 2. รวมแหล่งตัดสิน role ของฝั่งคลังสินค้าให้เป็น profiles เหมือนกัน ────
--
-- `inv_fn_current_role()` ยังอ่านจาก `sc_users` อยู่ ซึ่งเป็นตารางที่ให้คำตอบไม่ตรงกับ `profiles`
-- (milo = admin ใน profiles แต่ co-admin ใน sc_users · บัญชีทดสอบที่ค้างอยู่ยังถือ co-admin
-- ทั้งที่ไม่มีแถวใน profiles จึงเข้าแอปไม่ได้) — migration 0017 ย้าย sc_get_my_role() ไปแล้ว
-- ตัวนี้คือครึ่งที่เหลือ ทำให้ทั้งระบบตัดสินสิทธิ์จากแหล่งเดียวกันจริงๆ
--
-- คืนค่าเป็น 'admin' / 'co-admin' / 'staff' (hyphen) ให้ตรงกับที่ policy ของ inv_* ใช้อยู่
-- โดยแปลงจากฝั่งแอปที่เก็บเป็น 'co_admin' (underscore) — สองฝั่งสะกดต่างกันมาแต่ไหนแต่ไร
create or replace function public.inv_fn_current_role()
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select case lower(replace(coalesce(p.role, ''), '_', '-'))
           when 'admin'    then 'admin'
           when 'co-admin' then 'co-admin'
           when 'staff'    then 'staff'
           else null
         end
  from profiles p
  where p.id = auth.uid()
    and coalesce(p.is_active, true)
$fn$;

-- ── 3. ปิดช่องโหว่ search_path ของฟังก์ชัน SECURITY DEFINER ──────────────
--
-- Supabase Security Advisor: "Function Search Path Mutable"
-- ฟังก์ชัน SECURITY DEFINER ที่ไม่ตั้ง search_path ตายตัว เปิดช่องให้ผู้เรียกสร้าง schema
-- ของตัวเองแล้วดักชื่อตาราง/ฟังก์ชันที่โค้ดข้างในอ้างถึง = รันโค้ดด้วยสิทธิ์เจ้าของฟังก์ชันได้
-- ฟังก์ชันอื่นในระบบตั้งไว้ถูกหมดแล้ว เหลือ 2 ตัวนี้ที่ตกสำรวจ
do $$
declare
  f record;
begin
  for f in
    select n.nspname as schema_name, p.proname,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef
      and n.nspname in ('public', 'extension_layer')
      and (p.proconfig is null
           or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    execute format('alter function %I.%I(%s) set search_path to %L, %L',
                   f.schema_name, f.proname, f.args, f.schema_name, 'pg_temp');
    raise notice '0019: ตั้ง search_path ให้ %.%(%)', f.schema_name, f.proname, f.args;
  end loop;
end $$;
