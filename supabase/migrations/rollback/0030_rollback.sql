-- ย้อน 0030 กลับสู่สภาพเดิม
--
-- ⚠️ ต้องแน่ใจว่าไม่มีบัญชี super_admin ที่ branch_id/tenant_id เป็น null อยู่ก่อนรันไฟล์นี้
-- (เช็ค `select id, role from profiles where role = 'super_admin' and (branch_id is null or tenant_id is null)`
-- ต้องได้ 0 แถวก่อนเสมอ) ไม่งั้น constraint ใหม่ (แบบเดิม) จะปฏิเสธแถวที่มีอยู่ทันที
--
-- ⚠️ constraint ของ branch_id (`chk_branch_required_for_non_admin`) **ไม่เคยมีอยู่บน production
-- มาก่อน 0030 เลย** (ตรวจกับของจริงแล้ว 2026-09-16 — มีแค่ใน local/CI ที่มาจาก 0001_init.sql)
-- rollback นี้จึงแค่ "ลบทิ้ง" ให้กลับไปสภาพเดิมจริงๆ ไม่ใช่สร้างกลับแบบแคบกว่าเดิม
-- (ถ้าเป็น local/CI ที่ต้องการคืนตัวแคบเดิม ให้รัน migrations 0001-0028 ใหม่จากศูนย์แทน)

alter table public.profiles drop constraint if exists chk_tenant_required_for_non_super_admin;
alter table public.profiles alter column tenant_id set not null;

alter table public.profiles drop constraint if exists chk_branch_required_for_non_admin;

-- role: คืน profiles_role_check ให้เหลือ 5 ค่าเดิมตาม 0022 (เฉพาะกรณี production ที่มี
-- constraint นี้จริง — local/CI ใช้ enum ไม่มี constraint นี้ ข้ามไปเฉยๆ)
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles drop constraint profiles_role_check;
    alter table public.profiles add constraint profiles_role_check
      check (role = any (array['admin', 'co-admin', 'co_admin', 'staff', 'manager']));
  end if;
end $$;
