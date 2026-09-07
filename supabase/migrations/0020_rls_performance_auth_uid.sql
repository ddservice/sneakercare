-- ════════════════════════════════════════════════════════════════════════
--  0020_rls_performance_auth_uid.sql
--  ประสิทธิภาพ RLS: ไม่ให้ auth.uid() ถูกเรียกซ้ำทุกแถว
-- ════════════════════════════════════════════════════════════════════════
--
-- ที่มา: Supabase Performance Advisor "Auth RLS Initialization Plan"
--
-- ปัญหา: policy ที่เขียน `auth.uid()` ตรงๆ ทำให้ Postgres มองว่าเป็น volatile ต่อแถว จึงเรียก
-- ฟังก์ชันใหม่ **ทุกแถวที่สแกน** ตารางเล็กยังไม่รู้สึก แต่พอ inv_stock_transactions หรือ
-- sc_sales โตขึ้นเรื่อยๆ ทุกวัน จะกลายเป็นช้าแบบค่อยๆ แย่ลงจนหาสาเหตุยาก
--
-- ทางแก้มาตรฐานของ Supabase: ครอบด้วย `(select auth.uid())` — Postgres จะประเมินครั้งเดียว
-- แล้วใช้ค่าเดิมทั้ง query (InitPlan) **ความหมายของ policy ไม่เปลี่ยนแม้แต่นิดเดียว**
--
-- ⚠️ ตั้งใจเขียนทุก policy ออกมาเต็มๆ ทีละตัว ไม่ใช้ regex ไล่แทนอัตโนมัติ เพราะนี่คือโค้ด
-- ความปลอดภัย — พลาดตัวเดียวคือเปิดช่องหรือปิดกั้นผู้ใช้จริง ต้องอ่านทวนได้ด้วยตาทั้งหมด
--
-- ⚠️ สิ่งที่ **ไม่** ทำในไฟล์นี้: Advisor ยังเตือน "Multiple Permissive Policies" ที่
-- inv_stock_transactions (INSERT มี 3 policy: admin / co-admin / staff) ซึ่งยุบรวมเป็นอันเดียว
-- ด้วย OR ได้ทางเทคนิค แต่จงใจไม่ยุบ เพราะแยกไว้แบบนี้อ่านแล้วเข้าใจทันทีว่าแต่ละ role ทำอะไรได้
-- (staff ทำได้แค่ stock_out ในสาขาตัวเอง · co-admin เพิ่ม adjustment/waste ได้) การยุบเป็น
-- เงื่อนไขยาวก้อนเดียวทำให้ตรวจทานยากขึ้นมาก แลกกับความเร็วที่ตารางขนาด ~110 แถวไม่รู้สึกเลย
-- — ถ้าวันหนึ่งตารางโตถึงหลักแสนแถวค่อยกลับมาพิจารณาใหม่

-- ── inv_stock_transactions (3 policy) ────────────────────────────────────
drop policy if exists inv_p_stock_txn_insert_admin on public.inv_stock_transactions;
create policy inv_p_stock_txn_insert_admin on public.inv_stock_transactions
  for insert
  with check (
    inv_fn_current_role() = 'admin'
    and performed_by = (select auth.uid())
  );

drop policy if exists inv_p_stock_txn_insert_co_admin on public.inv_stock_transactions;
create policy inv_p_stock_txn_insert_co_admin on public.inv_stock_transactions
  for insert
  with check (
    inv_fn_current_role() = 'co-admin'
    and txn_type = any (array[
      'stock_in'::inv_txn_type, 'stock_out'::inv_txn_type,
      'adjustment_increase'::inv_txn_type, 'adjustment_decrease'::inv_txn_type,
      'waste'::inv_txn_type
    ])
    and performed_by = (select auth.uid())
    and branch_id = inv_fn_current_branch()
  );

drop policy if exists inv_p_stock_txn_insert_staff on public.inv_stock_transactions;
create policy inv_p_stock_txn_insert_staff on public.inv_stock_transactions
  for insert
  with check (
    inv_fn_current_role() = any (array['staff', 'manager'])
    and txn_type = 'stock_out'::inv_txn_type
    and performed_by = (select auth.uid())
    and branch_id = inv_fn_current_branch()
  );

-- ── profiles ─────────────────────────────────────────────────────────────
-- นอกจากครอบ auth.uid() แล้ว ยังเปลี่ยนเงื่อนไข "เป็น admin หรือไม่" จาก EXISTS ที่ query
-- ตาราง profiles ซ้อนตัวเอง มาใช้ sc_get_my_role() ซึ่งเป็น SECURITY DEFINER
--
-- ทำไมดีกว่า: (1) เร็วกว่ามาก ไม่ต้อง subquery ต่อแถว (2) ไม่เสี่ยง RLS ซ้อนตัวเองซึ่งเป็น
-- ต้นเหตุ error "infinite recursion detected in policy" คลาสสิกของ Postgres
-- (3) ใช้แหล่งตัดสิน role เดียวกับทั้งระบบตาม migration 0017/0019 — เดิมตรงนี้อ่าน
-- profiles.role ดิบๆ ซึ่งเก็บเป็น 'co_admin' (underscore) จึงเทียบกับ 'admin' ได้อย่างเดียว
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    id = (select auth.uid())
    or public.sc_get_my_role() = 'admin'
  );

-- ── sc_users ─────────────────────────────────────────────────────────────
drop policy if exists sc_users_read on public.sc_users;
create policy sc_users_read on public.sc_users
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.sc_get_my_role() = 'admin'
  );

drop policy if exists sc_users_update_own on public.sc_users;
create policy sc_users_update_own on public.sc_users
  for update to authenticated
  using (user_id = (select auth.uid()))
  -- with check เดิมบังคับว่า role ใหม่ต้องเท่ากับ role ปัจจุบัน = แก้ role ตัวเองไม่ได้ คงไว้เหมือนเดิม
  with check (
    user_id = (select auth.uid())
    and role = public.sc_get_my_role()
  );
