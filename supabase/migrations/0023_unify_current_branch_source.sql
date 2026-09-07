-- ════════════════════════════════════════════════════════════════════════
--  0023_unify_current_branch_source.sql
--  ชิ้นสุดท้ายของการรวมแหล่งข้อมูลผู้ใช้: inv_fn_current_branch() ต้องอ่าน profiles
-- ════════════════════════════════════════════════════════════════════════
--
-- migration 0017 ย้าย `sc_get_my_role()` และ 0019 ย้าย `inv_fn_current_role()` มาอ่าน
-- `profiles` แล้ว แต่ **ลืม `inv_fn_current_branch()` ซึ่งยังอ่านจาก `sc_users` อยู่**
--
-- เจอตอนทดสอบด้วยบัญชี staff จริง (2026-09-07): พนักงานอ่าน `v_item_stock` ได้ 0 แถว
-- ทั้งที่ควรเห็นสต๊อกของสาขาตัวเอง เพราะ staff-safe view กรองด้วย
--     inv_fn_current_role() = 'admin' or branch_id = inv_fn_current_branch()
-- พนักงานไม่ใช่ admin และ `inv_fn_current_branch()` คืน null (ไม่มีแถวใน sc_users)
-- ⇒ `branch_id = null` เป็น false เสมอ ⇒ ไม่เห็นอะไรเลย
--
-- ⚠️ นี่คือรูปแบบความผิดพลาดที่อันตรายเป็นพิเศษ: **ไม่มี error ให้เห็น** ผู้ใช้แค่เห็นหน้าจอว่าง
-- หรือจำนวนเป็น 0 ซึ่งดูเหมือน "ยังไม่มีข้อมูล" มากกว่า "สิทธิ์ผิด" — ถ้าไม่ได้ทดสอบด้วยบัญชี
-- staff จริงจะไม่มีวันเจอ (admin ผ่านเงื่อนไขแรกเสมอจึงไม่เคยแตะโค้ดส่วนนี้)
--
-- ตั้งแต่นี้ไป **ตารางผู้ใช้ที่ใช้ตัดสินสิทธิ์คือ `profiles` เท่านั้น** ทั้ง role และ branch
-- `sc_users` เหลือไว้เพื่อความเข้ากันได้กับระบบเดิม (Google Apps Script) และ FK ของ
-- `inv_audit_logs.performed_by` ที่ลบไม่ได้ตามกฎข้อ 1 เท่านั้น — ห้ามเอามาใช้ตัดสินสิทธิ์อีก

create or replace function public.inv_fn_current_branch()
returns uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select p.branch_id
  from profiles p
  where p.id = auth.uid()
    and coalesce(p.is_active, true)
$fn$;
