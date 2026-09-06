-- ════════════════════════════════════════════════════════════════════════
--  0015_close_remaining_anon_holes.sql
--  ปิด 2 ช่องที่ 0014 ยังปิดไม่หมด: profiles และ sc_payments
-- ════════════════════════════════════════════════════════════════════════
--
-- ตรวจซ้ำหลัง 0014 ถูก apply แล้ว (2026-09-06) ด้วยการยิง REST API จริงด้วย publishable key:
--   customers / inv_branches / inv_items / ui_permissions → ปิดสนิทแล้ว ✓
--   profiles / sc_payments                                → ยังอ่านได้โดยไม่ต้องล็อกอิน ✗
--
-- ── ทำไม 0014 พลาด profiles ────────────────────────────────────────────
-- 0014 ไล่แก้เฉพาะ policy ที่ roles = {public} แต่ policy ของ profiles ชื่อ
-- `profiles_select_authenticated` มี roles = **{anon,authenticated}** คือใส่ anon ไว้ตรงๆ
-- ไม่ได้มาทาง public — ชื่อ policy บอกว่า "authenticated" แต่พฤติกรรมจริงเปิดให้คนไม่ล็อกอินด้วย
-- **บทเรียน: อย่าเชื่อชื่อ policy ให้ดู `roles` ในตาราง pg_policies เสมอ**
--
-- ── ทำไมตอนนี้ปิด sc_payments ได้แล้ว ──────────────────────────────────
-- 0014 เว้น sc_payments ไว้เพราะยังยืนยันไม่ได้ว่าระบบเดิม (Google Apps Script) เขียนตารางนี้
-- ด้วย anon key หรือไม่ — ตอนนี้ยืนยันได้ด้วยหลักฐานทางอ้อมที่หนักแน่นพอแล้ว:
--
--   1. legacy/sneakercare_dashboard.html ส่ง formType 'save_opex' และ 'save_payment' ไปที่ GAS
--   2. policy ของ sc_opex (INSERT/UPDATE/SELECT) เป็น {authenticated} ล้วนมาก่อนหน้านี้แล้ว
--   3. แต่ในตาราง sc_opex มีแถวที่ legacy เขียน (key='audit_log', "บันทึกโดย: Milo (milo)")
--      ลงวันที่ 27 ส.ค. 2569 ซึ่งใหม่มาก
--   ⇒ ถ้า GAS ยิงมาด้วย anon จริง save_opex จะต้องพังไปแล้ว แต่มันไม่พัง
--   ⇒ GAS ต้องใช้ service_role หรือ session ของผู้ใช้ที่ล็อกอินแล้ว ไม่ใช่ anon
--   ⇒ การบีบ sc_payments เหลือ `to authenticated` จึงไม่กระทบระบบเดิม
--      (ถ้า GAS ใช้ service_role ก็ยิ่งไม่กระทบ เพราะ service_role ข้าม RLS อยู่แล้ว)
--
-- ความรุนแรงของช่องนี้: policy INSERT/UPDATE เป็น `with check (true)` บน role public แปลว่า
-- ใครก็ตามที่ก๊อป publishable key จาก DevTools ไป **เพิ่มรายการรับชำระปลอมและแก้ยอดเงินของ
-- รายการเดิมได้** ลบไม่ได้อย่างเดียว — ซึ่ง "แก้ยอดได้" อันตรายกว่าลบ เพราะยอดลูกหนี้เพี้ยน
-- โดยไม่มีใครสังเกต
--
-- ⚠️ ถ้าหลังรันแล้วหน้าการเงินของระบบเดิมบันทึกข้อมูลไม่ได้ = สมมติฐานข้างบนผิด
--    ย้อนกลับได้ทันทีด้วย supabase/migrations/rollback/0015_rollback.sql

-- ── 1. profiles: ตัด anon ออก เหลือเฉพาะผู้ที่ล็อกอินแล้ว ────────────────
-- ข้อมูลที่รั่ว: username, ชื่อจริง, role ของผู้ใช้ทุกคน = ชุดข้อมูลสำหรับเดาบัญชีไป brute-force
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_select_authenticated' and 'anon' = any(roles)
  ) then
    drop policy profiles_select_authenticated on public.profiles;
    create policy profiles_select_authenticated on public.profiles
      for select to authenticated using (true);
  end if;
end $$;

-- ── 2. sc_payments: ตัด anon ออกจากทั้ง SELECT / INSERT / UPDATE ─────────
-- คง logic เดิมทุกอย่าง (using true / with check true) เปลี่ยนแค่ "ใครใช้ได้" จาก public → authenticated
-- ทำใน DO block เดียวกันทั้งหมด = อยู่ในทรานแซกชันเดียว ไม่มีเสี้ยววินาทีที่ตารางไม่มี policy คุ้มครอง
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sc_payments'
      and policyname = 'sc_payments_select' and 'public' = any(roles)
  ) then
    drop policy sc_payments_select on public.sc_payments;
    drop policy sc_payments_insert on public.sc_payments;
    drop policy sc_payments_update on public.sc_payments;

    create policy sc_payments_select on public.sc_payments
      for select to authenticated using (true);
    create policy sc_payments_insert on public.sc_payments
      for insert to authenticated with check (true);
    create policy sc_payments_update on public.sc_payments
      for update to authenticated using (true) with check (true);
  end if;
end $$;

-- หมายเหตุ: sc_payments_delete_admin_co_admin ปล่อยไว้เหมือนเดิมได้ ถึงจะเป็น roles={public}
-- แต่เงื่อนไขเช็ค sc_get_my_role() ซึ่งคืน null สำหรับ anon ทำให้ผลลัพธ์เป็น false เสมอ
-- (และ anon ไม่มีสิทธิ์เรียกฟังก์ชันนั้นด้วยซ้ำ — จะได้ 42501 permission denied ก่อน)
