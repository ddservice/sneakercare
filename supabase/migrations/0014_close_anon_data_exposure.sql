-- ════════════════════════════════════════════════════════════════════════
--  0014_close_anon_data_exposure.sql
--  ปิดช่องโหว่: ข้อมูลจริงอ่านได้โดยไม่ต้องล็อกอิน (role anon)
-- ════════════════════════════════════════════════════════════════════════
--
-- 🔴 ที่มา (ตรวจพบ 2026-09-06 โดยยิง REST API จริงด้วย publishable key ที่ฝังอยู่ในหน้าเว็บ
--    ซึ่งใครก็เปิดดูได้จาก DevTools):
--
--    curl 'https://<ref>.supabase.co/rest/v1/sc_payments?select=*' -H "apikey: sb_publishable_..."
--    → คืนข้อมูลการรับชำระเงินจริงทั้งหมด โดยไม่ต้องล็อกอิน
--
--    ตารางที่รั่วแบบเดียวกัน: customers (ชื่อ+เบอร์โทรลูกค้า), profiles (รายชื่อ/สิทธิ์ผู้ใช้),
--    inv_branches (มี telegram_chat_id ของกลุ่มพนักงานอยู่ในนั้น), inv_items, ui_permissions
--
-- สาเหตุ 2 ชั้นที่ซ้อนกัน:
--   (1) policy ที่ไม่ระบุ `TO authenticated` จะมีผลกับ role `public` ซึ่ง **รวม anon ด้วย**
--       เช่น `create policy sc_payments_select on sc_payments for select using (true)`
--       อ่านดูเหมือนจำกัดแล้ว แต่จริงๆ คือเปิดให้ทุกคนบนอินเทอร์เน็ต
--   (2) role anon มี GRANT ระดับตารางครบทุกอย่าง (SELECT/INSERT/UPDATE/DELETE) บนแทบทุกตาราง
--       เหลือ RLS เป็นด่านเดียวที่กั้นอยู่ — พลาด policy เดียวคือข้อมูลหลุดทันที
--
-- ⚠️ ทำไมปลอดภัยที่จะปิด: ตรวจแล้วว่า **ไม่มีไฟล์ใดในแอป import `lib/supabase/client.ts` เลย**
--    (grep ทั้ง app/ components/ lib/) ทุก query วิ่งผ่านฝั่งเซิร์ฟเวอร์ด้วย session ของผู้ใช้
--    หรือ service_role ทั้งหมด — anon จึงไม่เคยถูกใช้อ่าน/เขียนข้อมูลจริงเลยแม้แต่ที่เดียว
--    (service_role ข้าม RLS อยู่แล้ว migration นี้จึงไม่กระทบการทำงานของแอปและ Edge Function)
--
-- ⚠️⚠️ สิ่งที่ยังไม่ได้ยืนยัน ณ วันที่เขียน — ต้องเช็คก่อนรันส่วนที่ 3:
--    ระบบเดิม (Google Apps Script ที่หน้า legacy/sneakercare_dashboard.html เรียก) **อาจ**
--    เขียน sc_payments/sc_opex เข้ามาโดยใช้ anon key — ซอร์สจริงของ GAS ไม่ได้อยู่ใน repo นี้
--    (ไฟล์ใน legacy/ ล้าสมัยและอ่านจาก Google Sheets เท่านั้น) policy `using (true)` แบบ public
--    บน sc_payments มีรูปแบบที่ "เหมือนถูกเปิดไว้ให้ระบบภายนอกเขียน" จึงต้องเปิดโปรเจกต์
--    Apps Script ดูก่อนว่าใช้ key ตัวไหน ถ้าใช้ anon จริงต้องเปลี่ยนไปใช้ service key ก่อน
--    ไม่งั้นหน้าการเงินของระบบเดิมจะเขียนข้อมูลไม่ได้ทันทีที่รัน migration นี้

-- ── 1. เปิด RLS ให้ตารางที่ยังไม่ได้เปิดเลย ──────────────────────────────
-- customers ไม่มี RLS เลยแม้แต่นิดเดียว = ชื่อและเบอร์โทรลูกค้าทุกคนเปิดให้อ่านสาธารณะ
alter table if exists public.customers enable row level security;

do $$
begin
  if to_regclass('public.customers') is not null
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customers') then
    execute 'create policy customers_authenticated_all on public.customers to authenticated using (true) with check (true)';
  end if;
end $$;

-- ── 2. บีบ policy ที่เผลอเปิดถึง anon ให้เหลือเฉพาะผู้ที่ล็อกอินแล้ว ─────
-- Postgres เปลี่ยน role ของ policy ที่มีอยู่ไม่ได้ ต้อง drop แล้วสร้างใหม่
-- ทำในทรานแซกชันเดียวกับที่ migration รันอยู่ จึงไม่มีช่วงที่ตารางเปิดโล่งให้ใครแทรกเข้ามา
do $$
declare
  p record;
begin
  for p in
    select * from (values
      -- (ตาราง, ชื่อ policy, คำสั่ง, using, with check)
      ('inv_branches', 'inv_p_branches_select',  'select', 'true', null),
      ('inv_items',    'inv_p_items_select',     'select', 'true', null),
      ('ui_permissions', 'ui_permissions_select', 'select', 'true', null)
    ) as v(tbl, pol, cmd, using_expr, check_expr)
  loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.pol) then
      execute format('drop policy %I on public.%I', p.pol, p.tbl);
      execute format('create policy %I on public.%I for %s to authenticated using (%s)',
                     p.pol, p.tbl, p.cmd, p.using_expr);
    end if;
  end loop;
end $$;

-- profiles: ตรวจแล้วว่า anon อ่านได้จริง (เห็น username/ชื่อจริง/role ของทุกคน = ข้อมูลไว้ใช้เดา
-- บัญชีสำหรับ brute-force) บีบทุก policy ที่เป็น public ให้เหลือ authenticated
do $$
declare
  p record;
begin
  for p in
    select policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and 'public' = any(roles)
  loop
    execute format('drop policy %I on public.profiles', p.policyname);
    execute format(
      'create policy %I on public.profiles for %s to authenticated %s %s',
      p.policyname,
      lower(p.cmd),
      case when p.qual is not null then 'using (' || p.qual || ')' else '' end,
      case when p.with_check is not null then 'with check (' || p.with_check || ')' else '' end
    );
  end loop;
end $$;

-- ── 3. sc_payments — ช่องโหว่ที่หนักที่สุด ───────────────────────────────
-- ⚠️ ส่วนนี้ถูกปิดไว้โดยเจตนา ห้ามเปิดใช้จนกว่าจะยืนยันเรื่อง Apps Script ตามหมายเหตุด้านบน
--
-- ปัจจุบัน anon (= ใครก็ได้ที่เปิดหน้าเว็บแล้วก๊อป publishable key ไป) สามารถ
--   • อ่านประวัติการรับชำระเงินทั้งหมด  (sc_payments_select : using true, role public)
--   • เพิ่มรายการรับชำระปลอม            (sc_payments_insert : with check true, role public)
--   • แก้ไขยอดเงินของรายการที่มีอยู่      (sc_payments_update : using/check true, role public)
-- ลบไม่ได้อย่างเดียว เพราะ policy DELETE เช็ค role — แต่ "แก้ยอดได้" อันตรายกว่าลบเสียอีก
-- เพราะยอดลูกหนี้จะเพี้ยนโดยไม่มีร่องรอยว่าใครทำ
--
-- เมื่อยืนยันแล้วว่าไม่มีระบบภายนอกใช้ anon key เขียนตารางนี้ ให้เอาคอมเมนต์ออกแล้วรัน:
--
-- drop policy if exists sc_payments_select on public.sc_payments;
-- drop policy if exists sc_payments_insert on public.sc_payments;
-- drop policy if exists sc_payments_update on public.sc_payments;
-- create policy sc_payments_select on public.sc_payments for select to authenticated using (true);
-- create policy sc_payments_insert on public.sc_payments for insert to authenticated with check (true);
-- create policy sc_payments_update on public.sc_payments for update to authenticated using (true) with check (true);

-- ── 4. ถอน GRANT ของ anon ออกจากตารางข้อมูลจริง (ด่านที่สอง) ────────────
-- RLS ไม่ควรเป็นด่านเดียว: ถ้าวันหนึ่งมีคนเผลอสร้าง policy ที่ลืมใส่ TO authenticated อีก
-- ข้อมูลจะไม่หลุดทันทีเหมือนคราวนี้ เพราะ anon ไม่มีสิทธิ์แตะตารางตั้งแต่ระดับ GRANT แล้ว
--
-- ⚠️ ส่วนนี้ก็ปิดไว้เช่นกัน — ต้องยืนยันเรื่อง Apps Script ก่อน (ดูหมายเหตุข้อ 3)
-- เมื่อพร้อมให้เอาคอมเมนต์ออก:
--
-- do $$
-- declare t record;
-- begin
--   for t in
--     select tablename from pg_tables
--     where schemaname = 'public'
--       and (tablename like 'sc\_%' or tablename like 'inv\_%' or tablename in ('customers', 'profiles', 'ui_permissions'))
--   loop
--     execute format('revoke all on public.%I from anon', t.tablename);
--   end loop;
-- end $$;
