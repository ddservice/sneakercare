-- ════════════════════════════════════════════════════════════════════════
--  0029_super_admin_role.sql
--  เพิ่มค่า enum 'super_admin' ให้ user_role — เตรียมพื้นที่สำหรับ role ที่เห็นได้ทุก tenant
-- ════════════════════════════════════════════════════════════════════════
--
-- บริบท: `admin` ปัจจุบัน (branch_id=null) เห็นได้ "ทุกสาขาภายในนิติบุคคลเดียวกัน" เท่านั้น
-- ตามที่ 0028 ออกแบบไว้ (tenant_id แยกชั้นจาก branch_id โดยตั้งใจ) — งานนี้เพิ่ม role ใหม่
-- `super_admin` สำหรับผู้ดูแลแพลตฟอร์ม (เช่นเจ้าของ DD Service) ที่ต้องเห็น**ข้ามทุก tenant**
-- ได้ ไม่ใช่แค่ทุกสาขาของ tenant ตัวเอง
--
-- ⚠️ migration นี้ **แค่เพิ่มชื่อ enum เฉยๆ** ยังไม่มีที่ไหนในฐานข้อมูลรู้จักมันเลย (RLS/ฟังก์ชัน
-- ที่เช็ค `fn_current_role() = 'admin'` ทั้งหมด ~30 จุด ยังจะปฏิเสธ super_admin เหมือน role
-- อื่นที่ไม่ใช่ admin) — ต้องรอ migration ถัดไป (เฟส 2 ของแผน multi-tenant ใน CLAUDE.md)
-- ที่จะไล่แก้ทุกจุดพร้อมกัน **ห้ามสร้างบัญชี super_admin จริงแล้วคาดหวังว่าจะข้าม tenant ได้
-- จนกว่าจะถึงตอนนั้น** — ตอนนี้ super_admin จะทำงานเหมือน "staff ที่ทำอะไรไม่ได้เลย" เพราะ
-- ไม่ตรงกับ 'admin' ในทุกเงื่อนไขที่มีอยู่
--
-- ⚠️ ทำไมแยกเป็นไฟล์เดี่ยว ไม่รวมกับ constraint ที่ใช้ค่านี้ (0030): Postgres ห้ามใช้ค่า enum
-- ใหม่ในทรานแซกชันเดียวกับที่เพิ่งเพิ่มมัน (ALTER TYPE ... ADD VALUE ต้อง commit ก่อน) —
-- Supabase SQL Editor รันทั้งไฟล์เป็นทรานแซกชันเดียว ถ้ารวมไว้ไฟล์เดียวกันจะได้ error
-- "unsafe use of new value of enum type" ทันที ต้องแยก apply เป็นคนละครั้ง (คนละไฟล์)
--
-- 🔴 [แก้ข้อผิดพลาดของตัวเอง 2026-09-16 — พบตอนเจ้าของรันจริงแล้ว error]
-- เขียนไฟล์นี้ครั้งแรกโดยเชื่อ `0001_init.sql` (`create type user_role as enum (...)`) ว่าคือ
-- ของจริงบน production — **ผิด** production คืออันเดียวกับที่ `0022_allow_staff_role.sql`
-- เจอมาก่อนแล้วและเขียนอธิบายไว้ในคอมเมนต์ของตัวเองชัดเจน: `profiles.role` บน production
-- เป็น **`text` ธรรมดา + CHECK constraint** (`profiles_role_check`) ไม่ใช่ enum จริงเลย
-- ตั้งแต่แรก (ย้อนอ่าน CI ยังคงยืนยันแบบนี้) `create type user_role as enum` ใน 0001 คือ
-- ของโลก local/CI ที่สร้างจาก migrations ล้วนๆ เท่านั้น — **นี่คือ prod/local divergence
-- แบบเดียวกับที่ 0012 เจอกับตาราง inv_* พอดี ลืมเช็คให้ครบ**
--
-- แก้เป็นตรวจก่อนว่า `public.user_role` เป็น enum type จริงไหม ถ้าใช่ (local/CI) ค่อย
-- ALTER TYPE ถ้าไม่ใช่ (production) ข้ามไปเงียบๆ แล้วให้ 0030 ไปแก้ CHECK constraint แทน
do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'user_role' and t.typtype = 'e'
  ) then
    -- ALTER TYPE ... ADD VALUE เรียกจากใน DO block ผ่าน EXECUTE ได้ตั้งแต่ Postgres 12
    -- ตราบใดที่ไม่มีการใช้ค่าใหม่ในทรานแซกชันเดียวกัน (0030 เป็นคนละไฟล์/คนละรอบ Run จึงปลอดภัย)
    execute $sql$alter type public.user_role add value if not exists 'super_admin'$sql$;
    raise notice '[0029] เพิ่มค่า enum super_admin ให้ public.user_role แล้ว (local/CI)';
  else
    raise notice '[0029] ไม่พบ public.user_role แบบ enum จริง (ปกติสำหรับ production ที่ role '
      'เป็น text + CHECK constraint) — ข้ามขั้นตอนนี้ ไปแก้ที่ 0030 แทน';
  end if;
end $$;
