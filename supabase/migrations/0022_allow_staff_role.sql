-- ════════════════════════════════════════════════════════════════════════
--  0022_allow_staff_role.sql
--  🔴 เชิญพนักงาน (staff) เข้าระบบไม่ได้เลย เพราะ CHECK constraint ไม่รับค่านี้
-- ════════════════════════════════════════════════════════════════════════
--
-- พบ 2026-09-07 ตอนสร้างบัญชี staff ชั่วคราวเพื่อทดสอบว่า staff-safe view ทำงานจริงหรือไม่
-- — สร้างไม่ได้ตั้งแต่แถวแรก:
--     new row for relation "profiles" violates check constraint "profiles_role_check"
--
-- constraint เดิม: role ต้องเป็น 'admin' | 'co-admin' | 'manager' เท่านั้น
-- แต่ฝั่งแอปส่งค่าอะไรมา:
--   • ฟอร์มเชิญผู้ใช้ (`app/(app)/admin/users/user-forms.tsx`) มีตัวเลือก **`co_admin`** และ **`staff`**
--   • `lib/permissions.ts` นิยาม Role = 'admin' | 'co_admin' | 'staff' (underscore ไม่มี staff ใน DB)
-- ⇒ **การเชิญผู้ใช้ทุก role ยกเว้น admin ล้มเหลวมาตลอด** และไม่มีใครเจอเพราะร้านมีแต่ admin 2 คน
-- ⇒ กฎข้อ 13 ("เชิญผู้ใช้ทำได้ทางหน้า /admin/users") ใช้งานจริงไม่ได้เลยสำหรับพนักงาน
--
-- ── ทำไมแก้ที่ constraint ไม่ใช่ที่โค้ด ────────────────────────────────
-- ระบบนี้สะกด role สองแบบมาตั้งแต่ต้น และ **ทั้งสองฝั่งแปลงให้กันอยู่แล้ว**:
--   • `lib/auth.ts` อ่านจาก DB แล้วแปลง '-' เป็น '_'  ('co-admin' → 'co_admin')
--   • `sc_get_my_role()` / `inv_fn_current_role()` (migration 0017/0019) แปลง '_' เป็น '-'
--     ก่อนเทียบกับ policy ที่ใช้ 'co-admin'
-- การไล่แก้ให้เหลือสะกดเดียวต้องแตะทั้ง policy, ข้อมูลเดิม และโค้ดพร้อมกัน = เสี่ยงล็อกตัวเอง
-- ออกจากระบบถ้าพลาด จึงเลือกวิธีที่ปลอดภัยกว่า: **ยอมรับทั้งสองแบบที่ระดับ constraint**
-- แล้วปล่อยให้ตัวแปลงที่มีอยู่แล้วทำงานตามเดิม
--
-- 'manager' คงไว้เพราะยังมี policy อ้างถึงอยู่จริง (`inv_p_stock_txn_insert_staff` ให้สิทธิ์
-- staff และ manager เท่ากัน) แม้ตอนนี้จะยังไม่มีใครใช้ role นี้
--
-- ⚠️ งานที่ควรทำต่อในอนาคต (ไม่ทำในไฟล์นี้): เลือกสะกดแบบเดียวทั้งระบบแล้วเลิกแปลงไปมา
--    ต้องทำพร้อมกันทั้ง policy + ข้อมูล + โค้ด และทดสอบด้วยบัญชีจริงทุก role ก่อน apply

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['admin', 'co-admin', 'co_admin', 'staff', 'manager']));

-- ui_permissions ก็เจอปัญหาเดียวกัน: หน้า /settings แสดงตารางสิทธิ์ต่อ role แต่ constraint
-- รับแค่ 'co-admin' และ 'manager' ⇒ บันทึกแถวของ staff ไม่ได้เลย
alter table public.ui_permissions drop constraint if exists chk_ui_permissions_role;
alter table public.ui_permissions add constraint chk_ui_permissions_role
  check (role = any (array['co-admin', 'co_admin', 'staff', 'manager']));
