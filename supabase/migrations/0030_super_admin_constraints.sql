-- ════════════════════════════════════════════════════════════════════════
--  0030_super_admin_constraints.sql
--  อนุญาตให้ role='super_admin' ไม่ต้องมี branch_id/tenant_id — ต้องรันหลัง 0029 เท่านั้น
--  (แยกไฟล์เพราะ Postgres ห้ามใช้ค่า enum ใหม่ในทรานแซกชันเดียวกับที่เพิ่งเพิ่มมัน)
-- ════════════════════════════════════════════════════════════════════════
--
-- ⚠️ เหมือนกับ 0029: migration นี้แค่ "อนุญาต" ให้ super_admin ไม่ต้องมี branch_id/tenant_id
-- เท่านั้น **ยังไม่ได้ทำให้ RLS/ฟังก์ชันไหนปฏิบัติกับ super_admin เป็นพิเศษเลย** — ทุกจุดที่เช็ค
-- `fn_current_role() = 'admin'` (~30 จุดทั่วระบบ ไล่ดูแล้วมีทั้งใน RLS policy, fn_set_integration_secret(),
-- fn_approve_adjustment(), staff-safe views ฯลฯ) จะยังปฏิเสธ super_admin เหมือนเดิม
-- จนกว่าจะถึง migration เฟส 2 ของแผน multi-tenant (ดู CLAUDE.md) ที่จะไล่แก้พร้อมกันทีเดียว
--
-- 🔴 [แก้ข้อผิดพลาดของตัวเอง 2026-09-16 — ตรวจกับ production จริงก่อนแล้ว] รอบแรกเขียนไฟล์นี้
-- โดยเชื่อว่า `chk_branch_required_for_non_admin` มีอยู่แล้วบน production (ตาม 0001_init.sql)
-- — **ผิด** ยิง `pg_get_constraintdef` กับ production จริงแล้วพบว่า `profiles` มีแค่ 5
-- constraint (`profiles_id_fkey`, `profiles_pkey`, `profiles_role_check`,
-- `profiles_tenant_id_fkey`, `profiles_username_key`) **ไม่มี `chk_branch_required_for_non_admin`
-- เลย** และ role เป็น `text` + `profiles_role_check` (ไม่ใช่ enum) ตรงกับที่ 0022 เคยบันทึกไว้
-- ⇒ ไฟล์นี้จึงไม่ใช่แค่ "อนุญาตเพิ่ม" แต่เป็นการ**เพิ่ม constraint บังคับใหม่ที่ไม่เคยมีมาก่อน**
-- (ของ branch_id) กับ**แก้ constraint ที่มีอยู่จริง** (ของ role) — ตรวจข้อมูลจริงแล้วก่อน apply:
-- มีแค่ 2 บัญชี (admin, milo) role='admin' ทั้งคู่ และมี branch_id ตั้งไว้แล้วทั้งคู่ ⇒ ไม่มีแถวไหน
-- จะชนกับ constraint ใหม่ ปลอดภัย 100% ที่จะเพิ่ม

-- ── branch_id: ยังไม่เคยมี constraint นี้บน production มาก่อน (ตรวจข้อมูลแล้วว่าปลอดภัย) ──
alter table public.profiles drop constraint if exists chk_branch_required_for_non_admin;
alter table public.profiles
  add constraint chk_branch_required_for_non_admin
  check (role in ('admin', 'super_admin') or branch_id is not null);

-- ── role: กรณี production จริง (text + CHECK, ไม่ใช่ enum) — เพิ่ม 'super_admin' เข้าไปในลิสต์
-- เดิมที่ 0022 ตั้งไว้ (`profiles_role_check`) คงค่าเดิมทุกตัวไว้ครบ ไม่ตัดอะไรทิ้งแม้จะไม่มีใครใช้
-- ('manager') เพื่อไม่ให้กระทบ policy อื่นที่ยังอ้างถึงอยู่ตามที่ 0022 บันทึกไว้
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles drop constraint profiles_role_check;
    alter table public.profiles add constraint profiles_role_check
      check (role = any (array['admin', 'co-admin', 'co_admin', 'staff', 'manager', 'super_admin']));
    raise notice '[0030] เพิ่ม super_admin เข้า profiles_role_check แล้ว (production: role เป็น text)';
  else
    raise notice '[0030] ไม่พบ profiles_role_check (ปกติสำหรับ local/CI ที่ role เป็น enum จริง — 0029 จัดการให้แล้ว)';
  end if;
end $$;

-- ── tenant_id: 0028 ตั้งเป็น not null ตายตัวเพราะตอนนั้นยังไม่มี super_admin ────
alter table public.profiles alter column tenant_id drop not null;
-- `add constraint` ไม่รองรับ `if not exists` ตรงๆ เหมือน `drop constraint` ต้อง drop ก่อนเสมอ
-- ถึงจะรันซ้ำได้แบบ idempotent (เจอจากเทสต์: รันซ้ำแล้ว error "constraint ... already exists")
alter table public.profiles drop constraint if exists chk_tenant_required_for_non_super_admin;
alter table public.profiles
  add constraint chk_tenant_required_for_non_super_admin
  check (role = 'super_admin' or tenant_id is not null);
