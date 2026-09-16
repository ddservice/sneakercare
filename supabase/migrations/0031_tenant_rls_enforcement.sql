-- ════════════════════════════════════════════════════════════════════════
--  0031_tenant_rls_enforcement.sql
--  เฟส 2 ของแผน multi-tenant: บังคับ RLS ด้วย tenant_id จริงทุกตาราง
-- ════════════════════════════════════════════════════════════════════════
--
-- ⚠️ ก่อน apply ไฟล์นี้ ตรวจ `pg_policies` กับ production จริงแล้ว (2026-09-16) ไม่ได้เดา
-- จากไฟล์ migration เก่า (บทเรียนจาก 0029/0030 ที่เดาผิดสองรอบ) — ทุก policy ในไฟล์นี้
-- copy USING/CHECK เดิมของจริงมาแล้วเติมเงื่อนไข tenant เพิ่มเข้าไปเท่านั้น ไม่ได้เขียนใหม่หมด
--
-- ⚠️ ปลอดภัยที่จะ apply ตอนนี้ (มี tenant เดียวในระบบจริง — SneakerCare) เพราะทุกบัญชีที่มีอยู่
-- (admin, milo) มี tenant_id เดียวกัน ⇒ `tenant_id = fn_current_tenant()` เป็นจริงเสมอสำหรับ
-- การใช้งานปกติทุกกรณี พฤติกรรมของระบบวันนี้จะไม่เปลี่ยนแม้แต่นิดเดียว — มีผลก็ต่อเมื่อมี
-- tenant ที่สองเกิดขึ้นจริงเท่านั้น
--
-- ⚠️ สูตรที่ใช้ทุกจุด (ที่ policy เดิมมีเงื่อนไข role อยู่แล้ว ไม่ใช่แค่ `true`):
--   `(<role_fn>() = 'super_admin') OR (tenant_id = fn_current_tenant() AND <เงื่อนไขเดิม>)`
-- **ห้ามเขียนเป็น `(tenant OR super_admin) AND <เงื่อนไขเดิม>`** — เจอบั๊กจริงจากการเทสต์:
-- รอบแรกเขียนผิดแบบนั้น ทำให้ super_admin ยังต้องผ่านเงื่อนไขเดิม (เช่น
-- `role = any(['admin','co-admin'])`) ด้วย ทั้งที่ role จริงของ super_admin คือ 'super_admin'
-- ไม่ใช่ 'admin'/'co-admin' ⇒ super_admin กลับเห็น 0 แถวในตารางที่มีเงื่อนไข role นอกเหนือจาก
-- `true` เฉยๆ (sc_opex, sc_employees, sc_payslips, ฯลฯ) — ส่วนตารางที่เดิมเป็น `true` ล้วน
-- (sc_payments, sc_sales, profiles select) ใช้สูตรง่ายกว่า:
--   `tenant_id = fn_current_tenant() OR <role_fn>() = 'super_admin'` (ไม่มี AND ให้ผิดพลาด)
--
-- ⚠️ ตารางที่ *ไม่* แตะในไฟล์นี้ (บันทึกเหตุผลกันงง):
--   • sc_users — deprecated ตาม 0023 ห้ามใช้ตัดสินสิทธิ์ ไม่เกี่ยวกับ tenant
--   • sc_expense_categories — enum กลางใช้ร่วมกันได้ทุก tenant (เหตุผลเดียวกับ 0028)
--   • ui_permissions — ตารางแสดงผลอย่างเดียว ไม่ใช่ด่านบังคับสิทธิ์จริง
--   • ext_* (โมดูล SmartAcc บิล/ภาษี) — ยังไม่มี tenant_id เลย (เลื่อนไว้ตาม 0028)
--     ห้ามเปิดให้ tenant ที่สองใช้ /invoicing หรือ /tax-filing ก่อนจะกลับมาทำส่วนนี้

-- ── 1. เพิ่ม tenant_id ให้ `expenses` (ตารางที่ 0028 พลาดไป — ตรวจ app code เจอว่า
--    ยังมีการใช้งานจริงใน app/actions/smartacc-documents.ts) ──────────────
-- guard ด้วย pg_tables เหมือน 0028 เผื่อสภาพแวดล้อมที่ไม่มีตารางนี้ (เช่นเทสต์ที่จำลอง
-- เฉพาะบางตาราง) จะได้ไม่ทำให้ทั้ง migration ล้มเพราะตารางเดียว
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'expenses') then
    alter table public.expenses
      add column if not exists tenant_id uuid not null
        default '00000000-0000-0000-0000-000000000001'::uuid
        references public.tenants(id);
    create index if not exists idx_expenses_tenant on public.expenses(tenant_id);
  else
    raise notice '[0031] ไม่พบตาราง expenses ในฐานข้อมูลนี้ — ข้ามขั้นตอนนี้';
  end if;
end $$;

-- ── 2. อัปเดตฟังก์ชันเช็ค role ให้รู้จัก super_admin ──────────────────────
-- (มิฉะนั้น super_admin จะได้ผลลัพธ์ null จาก CASE ที่ไม่รู้จักค่านี้ = ไม่มีสิทธิ์อะไรเลย
--  แม้ policy ข้างล่างจะเขียนรองรับ super_admin ไว้แล้วก็ตาม)
create or replace function public.sc_get_my_role()
returns text
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select case lower(replace(coalesce(p.role, ''), '_', '-'))
           when 'admin'       then 'admin'
           when 'co-admin'    then 'co-admin'
           when 'staff'       then 'staff'
           when 'super-admin' then 'super_admin'
           else null
         end
  from profiles p
  where p.id = auth.uid()
    and coalesce(p.is_active, true)
$fn$;

create or replace function public.inv_fn_current_role()
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select case lower(replace(coalesce(p.role, ''), '_', '-'))
           when 'admin'       then 'admin'
           when 'co-admin'    then 'co-admin'
           when 'staff'       then 'staff'
           when 'super-admin' then 'super_admin'
           else null
         end
  from profiles p
  where p.id = auth.uid()
    and coalesce(p.is_active, true)
$fn$;

create or replace function public.fn_sc_is_admin() returns boolean as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role::text in ('admin', 'super_admin')
  );
$$ language sql stable security definer set search_path = public, pg_temp;

-- ── 3. Rewrite RLS ทุก policy ให้ AND ด้วยเงื่อนไข tenant ─────────────────
-- ใช้ pattern เดียวกับ 0012/0017: drop เดิมถ้ามี แล้วสร้างใหม่ — รันซ้ำได้ (idempotent)
do $$
declare
  p record;
begin
  for p in
    select * from (values
      -- ── inv_audit_logs ──────────────────────────────────────────────
      ('inv_audit_logs', 'inv_p_audit_logs_select',
       $ddl$create policy inv_p_audit_logs_select on public.inv_audit_logs for select to public
         using ((public.inv_fn_current_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (inv_fn_current_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),

      -- ── inv_branches ─────────────────────────────────────────────────
      ('inv_branches', 'inv_p_branches_select',
       $ddl$create policy inv_p_branches_select on public.inv_branches for select to authenticated
         using (tenant_id = public.fn_current_tenant() or public.inv_fn_current_role() = 'super_admin')$ddl$),
      ('inv_branches', 'inv_p_branches_write',
       $ddl$create policy inv_p_branches_write on public.inv_branches for all to public
         using ((public.inv_fn_current_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (inv_fn_current_role() = any (array['admin'::text, 'co-admin'::text]))))
         with check ((public.inv_fn_current_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (inv_fn_current_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),

      -- ── inv_item_stock ───────────────────────────────────────────────
      ('inv_item_stock', 'inv_p_item_stock_select',
       $ddl$create policy inv_p_item_stock_select on public.inv_item_stock for select to public
         using ((public.inv_fn_current_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and ((inv_fn_current_role() = 'admin'::text)
             or ((inv_fn_current_role() = 'co-admin'::text) and (branch_id = inv_fn_current_branch())))))$ddl$),

      -- ── inv_items ────────────────────────────────────────────────────
      ('inv_items', 'inv_p_items_select',
       $ddl$create policy inv_p_items_select on public.inv_items for select to authenticated
         using (tenant_id = public.fn_current_tenant() or public.inv_fn_current_role() = 'super_admin')$ddl$),
      ('inv_items', 'inv_p_items_write_admin_co_admin',
       $ddl$create policy inv_p_items_write_admin_co_admin on public.inv_items for all to public
         using ((public.inv_fn_current_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (inv_fn_current_role() = any (array['admin'::text, 'co-admin'::text]))))
         with check ((public.inv_fn_current_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (inv_fn_current_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),

      -- ── inv_stock_transactions ───────────────────────────────────────
      ('inv_stock_transactions', 'inv_p_stock_txn_insert_admin',
       $ddl$create policy inv_p_stock_txn_insert_admin on public.inv_stock_transactions for insert to public
         with check ((public.inv_fn_current_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (inv_fn_current_role() = 'admin'::text)) and (performed_by = (select auth.uid())))$ddl$),
      ('inv_stock_transactions', 'inv_p_stock_txn_insert_co_admin',
       $ddl$create policy inv_p_stock_txn_insert_co_admin on public.inv_stock_transactions for insert to public
         with check ((public.inv_fn_current_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (inv_fn_current_role() = 'co-admin'::text))
           and (txn_type = any (array['stock_in'::inv_txn_type, 'stock_out'::inv_txn_type,
                'adjustment_increase'::inv_txn_type, 'adjustment_decrease'::inv_txn_type, 'waste'::inv_txn_type]))
           and (performed_by = (select auth.uid())) and (branch_id = inv_fn_current_branch()))$ddl$),
      ('inv_stock_transactions', 'inv_p_stock_txn_insert_staff',
       $ddl$create policy inv_p_stock_txn_insert_staff on public.inv_stock_transactions for insert to public
         with check ((public.inv_fn_current_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (inv_fn_current_role() = any (array['staff'::text, 'manager'::text])))
           and (txn_type = 'stock_out'::inv_txn_type)
           and (performed_by = (select auth.uid())) and (branch_id = inv_fn_current_branch()))$ddl$),
      ('inv_stock_transactions', 'inv_p_stock_txn_select',
       $ddl$create policy inv_p_stock_txn_select on public.inv_stock_transactions for select to public
         using ((public.inv_fn_current_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and ((inv_fn_current_role() = 'admin'::text)
             or ((inv_fn_current_role() = 'co-admin'::text) and (branch_id = inv_fn_current_branch())))))$ddl$),

      -- ── inv_suppliers ────────────────────────────────────────────────
      ('inv_suppliers', 'inv_p_suppliers_select',
       $ddl$create policy inv_p_suppliers_select on public.inv_suppliers for select to public
         using ((public.inv_fn_current_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (inv_fn_current_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),
      ('inv_suppliers', 'inv_p_suppliers_write',
       $ddl$create policy inv_p_suppliers_write on public.inv_suppliers for all to public
         using ((public.inv_fn_current_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (inv_fn_current_role() = any (array['admin'::text, 'co-admin'::text]))))
         with check ((public.inv_fn_current_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (inv_fn_current_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),

      -- ── profiles (พิเศษ: อยู่บนเส้นทาง login ทุกครั้ง — ต้องถูกต้อง 100%) ──
      ('profiles', 'profiles_select_authenticated',
       $ddl$create policy profiles_select_authenticated on public.profiles for select to authenticated
         using (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')$ddl$),
      ('profiles', 'profiles_update',
       $ddl$create policy profiles_update on public.profiles for update to authenticated
         using ((id = (select auth.uid()))
           or (public.sc_get_my_role() = 'super_admin')
           or (sc_get_my_role() = 'admin'::text and tenant_id = public.fn_current_tenant()))$ddl$),

      -- ── sc_audit_logs ────────────────────────────────────────────────
      ('sc_audit_logs', 'p_sc_audit_logs_read_admin',
       $ddl$create policy p_sc_audit_logs_read_admin on public.sc_audit_logs for select to authenticated
         using ((tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin') and fn_sc_is_admin())$ddl$),

      -- ── sc_employees ─────────────────────────────────────────────────
      ('sc_employees', 'sc_employees_admin_co_admin',
       $ddl$create policy sc_employees_admin_co_admin on public.sc_employees for all to public
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))
         with check ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),

      -- ── sc_expense_entries ───────────────────────────────────────────
      ('sc_expense_entries', 'sc_expense_entries_delete',
       $ddl$create policy sc_expense_entries_delete on public.sc_expense_entries for delete to authenticated
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = 'admin'::text)))$ddl$),
      ('sc_expense_entries', 'sc_expense_entries_insert',
       $ddl$create policy sc_expense_entries_insert on public.sc_expense_entries for insert to authenticated
         with check ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),
      ('sc_expense_entries', 'sc_expense_entries_read',
       $ddl$create policy sc_expense_entries_read on public.sc_expense_entries for select to authenticated
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),
      ('sc_expense_entries', 'sc_expense_entries_update',
       $ddl$create policy sc_expense_entries_update on public.sc_expense_entries for update to authenticated
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))
         with check ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),

      -- ── sc_opex ──────────────────────────────────────────────────────
      ('sc_opex', 'sc_opex_delete_admin',
       $ddl$create policy sc_opex_delete_admin on public.sc_opex for delete to public
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),
      ('sc_opex', 'sc_opex_insert',
       $ddl$create policy sc_opex_insert on public.sc_opex for insert to authenticated
         with check ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),
      ('sc_opex', 'sc_opex_read_insert',
       $ddl$create policy sc_opex_read_insert on public.sc_opex for select to authenticated
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),
      ('sc_opex', 'sc_opex_update',
       $ddl$create policy sc_opex_update on public.sc_opex for update to authenticated
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))
         with check ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),

      -- ── sc_opex_history ──────────────────────────────────────────────
      ('sc_opex_history', 'opex_history_delete',
       $ddl$create policy opex_history_delete on public.sc_opex_history for delete to authenticated
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = 'admin'::text)))$ddl$),
      ('sc_opex_history', 'opex_history_read',
       $ddl$create policy opex_history_read on public.sc_opex_history for select to authenticated
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),
      ('sc_opex_history', 'opex_history_write',
       $ddl$create policy opex_history_write on public.sc_opex_history for insert to authenticated
         with check ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),

      -- ── sc_payments (เดิมเปิด true ล้วน — ตั้งใจไม่แตะ role ตาม 0017 แต่ต้องมี tenant) ──
      ('sc_payments', 'sc_payments_delete_admin_co_admin',
       $ddl$create policy sc_payments_delete_admin_co_admin on public.sc_payments for delete to public
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),
      ('sc_payments', 'sc_payments_insert',
       $ddl$create policy sc_payments_insert on public.sc_payments for insert to authenticated
         with check (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')$ddl$),
      ('sc_payments', 'sc_payments_select',
       $ddl$create policy sc_payments_select on public.sc_payments for select to authenticated
         using (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')$ddl$),
      ('sc_payments', 'sc_payments_update',
       $ddl$create policy sc_payments_update on public.sc_payments for update to authenticated
         using (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')
         with check (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')$ddl$),

      -- ── sc_payslip_deductions ────────────────────────────────────────
      ('sc_payslip_deductions', 'sc_payslip_deductions_delete',
       $ddl$create policy sc_payslip_deductions_delete on public.sc_payslip_deductions for delete to authenticated
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = 'admin'::text)))$ddl$),
      ('sc_payslip_deductions', 'sc_payslip_deductions_insert',
       $ddl$create policy sc_payslip_deductions_insert on public.sc_payslip_deductions for insert to authenticated
         with check ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),
      ('sc_payslip_deductions', 'sc_payslip_deductions_read',
       $ddl$create policy sc_payslip_deductions_read on public.sc_payslip_deductions for select to authenticated
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),
      ('sc_payslip_deductions', 'sc_payslip_deductions_update',
       $ddl$create policy sc_payslip_deductions_update on public.sc_payslip_deductions for update to authenticated
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))
         with check ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),

      -- ── sc_payslips ──────────────────────────────────────────────────
      ('sc_payslips', 'sc_payslips_delete',
       $ddl$create policy sc_payslips_delete on public.sc_payslips for delete to authenticated
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = 'admin'::text)))$ddl$),
      ('sc_payslips', 'sc_payslips_insert',
       $ddl$create policy sc_payslips_insert on public.sc_payslips for insert to authenticated
         with check ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),
      ('sc_payslips', 'sc_payslips_read',
       $ddl$create policy sc_payslips_read on public.sc_payslips for select to authenticated
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),
      ('sc_payslips', 'sc_payslips_update',
       $ddl$create policy sc_payslips_update on public.sc_payslips for update to authenticated
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))
         with check ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),

      -- ── sc_rental_records ────────────────────────────────────────────
      ('sc_rental_records', 'sc_rental_records_delete',
       $ddl$create policy sc_rental_records_delete on public.sc_rental_records for delete to authenticated
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = 'admin'::text)))$ddl$),
      ('sc_rental_records', 'sc_rental_records_insert',
       $ddl$create policy sc_rental_records_insert on public.sc_rental_records for insert to authenticated
         with check ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),
      ('sc_rental_records', 'sc_rental_records_read',
       $ddl$create policy sc_rental_records_read on public.sc_rental_records for select to authenticated
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),
      ('sc_rental_records', 'sc_rental_records_update',
       $ddl$create policy sc_rental_records_update on public.sc_rental_records for update to authenticated
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))
         with check ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),

      -- ── sc_sales (เดิมเปิด true ล้วน เหมือน sc_payments) ───────────────
      ('sc_sales', 'sc_sales_delete_admin',
       $ddl$create policy sc_sales_delete_admin on public.sc_sales for delete to public
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),
      ('sc_sales', 'sc_sales_insert',
       $ddl$create policy sc_sales_insert on public.sc_sales for insert to authenticated
         with check (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')$ddl$),
      ('sc_sales', 'sc_sales_read_insert',
       $ddl$create policy sc_sales_read_insert on public.sc_sales for select to authenticated
         using (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')$ddl$),
      ('sc_sales', 'sc_sales_update',
       $ddl$create policy sc_sales_update on public.sc_sales for update to authenticated
         using (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')
         with check (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')$ddl$),

      -- ── sc_settings ──────────────────────────────────────────────────
      ('sc_settings', 'sc_settings_read',
       $ddl$create policy sc_settings_read on public.sc_settings for select to authenticated
         using (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')$ddl$),
      ('sc_settings', 'sc_settings_write_admin',
       $ddl$create policy sc_settings_write_admin on public.sc_settings for all to authenticated
         using ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))
         with check ((public.sc_get_my_role() = 'super_admin')
           or (tenant_id = public.fn_current_tenant() and (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))))$ddl$),

      -- ── customers / services / service_orders / service_order_items / expenses
      --    (เดิมเปิด true ล้วนให้ authenticated ทุกคน — เพิ่มแค่ tenant boundary) ────
      ('customers', 'customers_authenticated_all',
       $ddl$create policy customers_authenticated_all on public.customers for all to authenticated
         using (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')
         with check (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')$ddl$),
      ('services', 'services_authenticated_all',
       $ddl$create policy services_authenticated_all on public.services for all to authenticated
         using (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')
         with check (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')$ddl$),
      ('service_orders', 'service_orders_authenticated_all',
       $ddl$create policy service_orders_authenticated_all on public.service_orders for all to authenticated
         using (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')
         with check (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')$ddl$),
      ('service_order_items', 'service_order_items_authenticated_all',
       $ddl$create policy service_order_items_authenticated_all on public.service_order_items for all to authenticated
         using (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')
         with check (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')$ddl$),
      ('expenses', 'expenses_authenticated_all',
       $ddl$create policy expenses_authenticated_all on public.expenses for all to authenticated
         using (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')
         with check (tenant_id = public.fn_current_tenant() or public.sc_get_my_role() = 'super_admin')$ddl$)

    ) as v(tbl, pol, ddl)
  loop
    -- ข้ามตารางที่ไม่มีอยู่จริงในสภาพแวดล้อมนี้ (กันเผื่อ เทสต์/สภาพแวดล้อมที่ตารางไม่ครบ
    -- ไม่ควรทำให้ทั้ง migration ล้มเพราะตารางเดียว — production มีครบทุกตัวในลิสต์นี้แล้ว
    -- ตามที่ตรวจกับ pg_policies จริงเมื่อ 2026-09-16)
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = p.tbl) then
      raise notice '[0031] ข้ามตาราง % — ไม่พบในฐานข้อมูลนี้', p.tbl;
      continue;
    end if;

    -- กันพลาดซ้ำแบบเดียวกับที่เจอกับ `expenses` — ถ้าตารางมีอยู่แต่ไม่มีคอลัมน์ tenant_id
    -- (ลืมเพิ่มใน 0028/ขั้นตอนที่ 1 ด้านบน) ต้องข้ามแบบมี notice ชัดเจน ไม่ใช่ error ทั้งไฟล์
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = p.tbl and column_name = 'tenant_id'
    ) then
      raise notice '[0031] ข้ามตาราง % — มีตารางแต่ไม่มีคอลัมน์ tenant_id (ต้องเพิ่มก่อน)', p.tbl;
      continue;
    end if;

    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.pol) then
      execute format('drop policy %I on public.%I', p.pol, p.tbl);
    end if;
    execute p.ddl;
  end loop;
end $$;
