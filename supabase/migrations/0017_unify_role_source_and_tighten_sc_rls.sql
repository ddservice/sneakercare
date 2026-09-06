-- ════════════════════════════════════════════════════════════════════════
--  0017_unify_role_source_and_tighten_sc_rls.sql
--  รวมแหล่งตัดสินสิทธิ์ให้เหลือชุดเดียว + บังคับ RBAC ที่ RLS ตามกฎข้อ 4
-- ════════════════════════════════════════════════════════════════════════
--
-- ── ปัญหาที่ 1: user directory สองชุดที่ให้คำตอบไม่ตรงกัน ────────────────
-- ระบบมีตารางผู้ใช้ 2 ชุดที่เกิดจากประวัติการพัฒนา และ "role" ของคนเดียวกันไม่ตรงกันจริง:
--
--   profiles  (แอปใหม่ใช้ตัวนี้ตัดสินสิทธิ์ ผ่าน lib/auth.ts → requireModuleView)
--     admin = admin   ·   milo = admin
--   sc_users  (RLS policy ของตาราง sc_* ใช้ตัวนี้ ผ่าน sc_get_my_role())
--     admin = admin   ·   milo = **co-admin**   ·   rlsverify35_coadmin = co-admin
--
-- ผลคือ milo เห็นเมนูและเข้าหน้าได้ในฐานะ admin แต่ฐานข้อมูลมองว่าเป็น co-admin — เป็นกับดัก
-- ที่จะโผล่มาเป็นบั๊ก "กดได้แต่ข้อมูลไม่ขึ้น / บันทึกแล้วเงียบ" ซึ่งหาสาเหตุยากมาก
-- ยิ่งกว่านั้น `rlsverify35_coadmin` เป็นบัญชีทดสอบที่ค้างจาก pgTAP RLS test ปี 2026-08-27
-- (ลบไม่ได้เพราะติด FK กับ inv_audit_logs ตามที่บันทึกไว้ใน CLAUDE.md) แต่ **ยังถือ role
-- co-admin ในสายตาของ RLS อยู่** ทั้งที่ไม่มีแถวใน profiles จึงเข้าแอปไม่ได้
--
-- แก้โดยให้ `sc_get_my_role()` อ่านจาก `profiles` แหล่งเดียว — แหล่งเดียวกับที่แอปบังคับใช้จริง
-- ผลพลอยได้: บัญชีทดสอบที่ไม่มีแถวใน profiles จะได้ role = null ทันที = ไม่มีสิทธิ์อะไรเลย
-- โดยไม่ต้องไปแตะ inv_audit_logs (ซึ่งห้ามแก้ตามกฎข้อ 1)
--
-- ⚠️ ปลอดภัยเพราะพิสูจน์ครบทุกกรณีแล้ว:
--   • แอปไม่เคยอ่าน `sc_users` เลยแม้แต่ที่เดียว (grep ทั้ง app/ และ lib/) ใช้ `profiles` ล้วน
--   • ระบบทั้งหมดมี auth user แค่ 3 คน: admin, milo (ทั้งคู่ role=admin ใน profiles)
--     และบัญชีทดสอบที่ใช้งานไม่ได้ ⇒ ไม่ว่า Google Apps Script จะล็อกอินเป็นใคร ก็ได้ admin
--   • ถ้า GAS ใช้ service_role → ข้าม RLS อยู่แล้ว ไม่กระทบ
--   • ถ้า GAS ใช้ anon → พังไปตั้งแต่ 0016 (revoke all from anon) แล้ว migration นี้ไม่เปลี่ยนอะไร
--
-- ── ปัญหาที่ 2: RBAC ยังไม่ถูกบังคับที่ RLS (ผิดกฎข้อ 4 และ 5) ──────────
-- `sc_opex` (ค่าใช้จ่าย + ยอดเงินเดือนรายคน) และ `sc_opex_history` เปิด SELECT/INSERT/UPDATE
-- ให้ `authenticated` ทุกคนแบบ `using (true)` ⇒ พนักงานที่ล็อกอินอ่านเงินเดือนเพื่อนร่วมงาน
-- และแก้ค่าใช้จ่ายร้านได้ ถ้ายิง REST API ตรงๆ (การ์ดหน้าเว็บที่เพิ่งเติมกันได้แค่ผ่าน UI)
--
-- ⚠️ ตั้งใจ **ไม่** แตะ sc_sales / sc_payments: พนักงานหน้าร้านต้องบันทึกยอดขายรายวันและ
-- รับชำระย้อนหลังได้เป็นงานประจำ (ดู viewRoles ของโมดูล "pos" ที่ให้ staff เข้าได้)
-- ยอดขายไม่ใช่ข้อมูลต้นทุนตามกฎข้อ 5 — ที่ต้องกันคือต้นทุน/เงินเดือน ซึ่งอยู่ใน sc_opex
--
-- ⚠️ ตั้งใจ **ไม่** แตะ sc_settings: `fetchShopProfile()` อ่านผ่าน service_role อยู่แล้ว
-- และค่าในนั้นคือหัวเอกสารร้าน (ชื่อ/ที่อยู่/เลขผู้เสียภาษี) ไม่ใช่ความลับ

-- ── 1. ให้ profiles เป็นแหล่งตัดสิน role แหล่งเดียว ──────────────────────
-- คืนค่าเป็นรูปแบบที่ policy เดิมใช้อยู่ ('admin' / 'co-admin' / 'staff') โดยแปลง underscore
-- ของฝั่งแอป ('co_admin') ให้เป็น hyphen ('co-admin') — สองฝั่งสะกดไม่เหมือนกันมาแต่ไหนแต่ไร
-- ผู้ใช้ที่ถูกปิดการใช้งาน (is_active = false) ได้ null = ไม่มีสิทธิ์ใดๆ ทันทีที่ระดับฐานข้อมูล
create or replace function public.sc_get_my_role()
returns text
language sql
stable
security definer
set search_path to 'public'
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

-- ── 2. sc_opex / sc_opex_history: เหลือเฉพาะ admin + co-admin ───────────
do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('sc_opex', 'sc_opex_read_insert', 'select',
       'create policy sc_opex_read_insert on public.sc_opex for select to authenticated using (public.sc_get_my_role() = any (array[''admin'',''co-admin'']))'),
      ('sc_opex', 'sc_opex_insert', 'insert',
       'create policy sc_opex_insert on public.sc_opex for insert to authenticated with check (public.sc_get_my_role() = any (array[''admin'',''co-admin'']))'),
      ('sc_opex', 'sc_opex_update', 'update',
       'create policy sc_opex_update on public.sc_opex for update to authenticated using (public.sc_get_my_role() = any (array[''admin'',''co-admin''])) with check (public.sc_get_my_role() = any (array[''admin'',''co-admin'']))'),
      ('sc_opex_history', 'opex_history_read', 'select',
       'create policy opex_history_read on public.sc_opex_history for select to authenticated using (public.sc_get_my_role() = any (array[''admin'',''co-admin'']))')
    ) as v(tbl, pol, cmd, ddl)
  loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.pol) then
      execute format('drop policy %I on public.%I', p.pol, p.tbl);
    end if;
    execute p.ddl;
  end loop;
end $$;

-- ── 3. sc_users: อ่านได้เฉพาะแถวของตัวเอง (หรือ admin เห็นทั้งหมด) ───────
-- เดิม `using (true)` ⇒ ใครล็อกอินก็เห็นรายชื่อผู้ใช้และ role ของทุกคน
do $$
begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='sc_users' and policyname='sc_users_read') then
    drop policy sc_users_read on public.sc_users;
  end if;
  create policy sc_users_read on public.sc_users
    for select to authenticated
    using (user_id = auth.uid() or public.sc_get_my_role() = 'admin');
end $$;
