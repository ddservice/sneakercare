-- ย้อน 0031 กลับสู่สภาพเดิมทุก policy (ค่าที่ copy จาก pg_policies ของ production จริง
-- ก่อน apply 0031 เมื่อ 2026-09-16) — ไม่ย้อน sc_get_my_role()/inv_fn_current_role()/
-- fn_sc_is_admin() เพราะการรับรู้ 'super_admin' ไม่ทำให้ role อื่นพฤติกรรมเปลี่ยน ปลอดภัย
-- ที่จะปล่อยไว้ และไม่ถอดคอลัมน์ tenant_id ของ expenses ออก (เฟส 1 เป็นเจ้าของคอลัมน์นั้น)

do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('inv_audit_logs', 'inv_p_audit_logs_select',
       $ddl$create policy inv_p_audit_logs_select on public.inv_audit_logs for select to public
         using (inv_fn_current_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),

      ('inv_branches', 'inv_p_branches_select',
       $ddl$create policy inv_p_branches_select on public.inv_branches for select to authenticated using (true)$ddl$),
      ('inv_branches', 'inv_p_branches_write',
       $ddl$create policy inv_p_branches_write on public.inv_branches for all to public
         using (inv_fn_current_role() = any (array['admin'::text, 'co-admin'::text]))
         with check (inv_fn_current_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),

      ('inv_item_stock', 'inv_p_item_stock_select',
       $ddl$create policy inv_p_item_stock_select on public.inv_item_stock for select to public
         using ((inv_fn_current_role() = 'admin'::text)
           or ((inv_fn_current_role() = 'co-admin'::text) and (branch_id = inv_fn_current_branch())))$ddl$),

      ('inv_items', 'inv_p_items_select',
       $ddl$create policy inv_p_items_select on public.inv_items for select to authenticated using (true)$ddl$),
      ('inv_items', 'inv_p_items_write_admin_co_admin',
       $ddl$create policy inv_p_items_write_admin_co_admin on public.inv_items for all to public
         using (inv_fn_current_role() = any (array['admin'::text, 'co-admin'::text]))
         with check (inv_fn_current_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),

      ('inv_stock_transactions', 'inv_p_stock_txn_insert_admin',
       $ddl$create policy inv_p_stock_txn_insert_admin on public.inv_stock_transactions for insert to public
         with check ((inv_fn_current_role() = 'admin'::text) and (performed_by = (select auth.uid())))$ddl$),
      ('inv_stock_transactions', 'inv_p_stock_txn_insert_co_admin',
       $ddl$create policy inv_p_stock_txn_insert_co_admin on public.inv_stock_transactions for insert to public
         with check ((inv_fn_current_role() = 'co-admin'::text)
           and (txn_type = any (array['stock_in'::inv_txn_type, 'stock_out'::inv_txn_type,
                'adjustment_increase'::inv_txn_type, 'adjustment_decrease'::inv_txn_type, 'waste'::inv_txn_type]))
           and (performed_by = (select auth.uid())) and (branch_id = inv_fn_current_branch()))$ddl$),
      ('inv_stock_transactions', 'inv_p_stock_txn_insert_staff',
       $ddl$create policy inv_p_stock_txn_insert_staff on public.inv_stock_transactions for insert to public
         with check ((inv_fn_current_role() = any (array['staff'::text, 'manager'::text]))
           and (txn_type = 'stock_out'::inv_txn_type)
           and (performed_by = (select auth.uid())) and (branch_id = inv_fn_current_branch()))$ddl$),
      ('inv_stock_transactions', 'inv_p_stock_txn_select',
       $ddl$create policy inv_p_stock_txn_select on public.inv_stock_transactions for select to public
         using ((inv_fn_current_role() = 'admin'::text)
           or ((inv_fn_current_role() = 'co-admin'::text) and (branch_id = inv_fn_current_branch())))$ddl$),

      ('inv_suppliers', 'inv_p_suppliers_select',
       $ddl$create policy inv_p_suppliers_select on public.inv_suppliers for select to public
         using (inv_fn_current_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),
      ('inv_suppliers', 'inv_p_suppliers_write',
       $ddl$create policy inv_p_suppliers_write on public.inv_suppliers for all to public
         using (inv_fn_current_role() = any (array['admin'::text, 'co-admin'::text]))
         with check (inv_fn_current_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),

      ('profiles', 'profiles_select_authenticated',
       $ddl$create policy profiles_select_authenticated on public.profiles for select to authenticated using (true)$ddl$),
      ('profiles', 'profiles_update',
       $ddl$create policy profiles_update on public.profiles for update to authenticated
         using ((id = (select auth.uid())) or (sc_get_my_role() = 'admin'::text))$ddl$),

      ('sc_audit_logs', 'p_sc_audit_logs_read_admin',
       $ddl$create policy p_sc_audit_logs_read_admin on public.sc_audit_logs for select to authenticated
         using (fn_sc_is_admin())$ddl$),

      ('sc_employees', 'sc_employees_admin_co_admin',
       $ddl$create policy sc_employees_admin_co_admin on public.sc_employees for all to public
         using (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))
         with check (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),

      ('sc_expense_entries', 'sc_expense_entries_delete',
       $ddl$create policy sc_expense_entries_delete on public.sc_expense_entries for delete to authenticated
         using (sc_get_my_role() = 'admin'::text)$ddl$),
      ('sc_expense_entries', 'sc_expense_entries_insert',
       $ddl$create policy sc_expense_entries_insert on public.sc_expense_entries for insert to authenticated
         with check (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),
      ('sc_expense_entries', 'sc_expense_entries_read',
       $ddl$create policy sc_expense_entries_read on public.sc_expense_entries for select to authenticated
         using (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),
      ('sc_expense_entries', 'sc_expense_entries_update',
       $ddl$create policy sc_expense_entries_update on public.sc_expense_entries for update to authenticated
         using (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))
         with check (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),

      ('sc_opex', 'sc_opex_delete_admin',
       $ddl$create policy sc_opex_delete_admin on public.sc_opex for delete to public
         using (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),
      ('sc_opex', 'sc_opex_insert',
       $ddl$create policy sc_opex_insert on public.sc_opex for insert to authenticated
         with check (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),
      ('sc_opex', 'sc_opex_read_insert',
       $ddl$create policy sc_opex_read_insert on public.sc_opex for select to authenticated
         using (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),
      ('sc_opex', 'sc_opex_update',
       $ddl$create policy sc_opex_update on public.sc_opex for update to authenticated
         using (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))
         with check (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),

      ('sc_opex_history', 'opex_history_delete',
       $ddl$create policy opex_history_delete on public.sc_opex_history for delete to authenticated
         using (sc_get_my_role() = 'admin'::text)$ddl$),
      ('sc_opex_history', 'opex_history_read',
       $ddl$create policy opex_history_read on public.sc_opex_history for select to authenticated
         using (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),
      ('sc_opex_history', 'opex_history_write',
       $ddl$create policy opex_history_write on public.sc_opex_history for insert to authenticated
         with check (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),

      ('sc_payments', 'sc_payments_delete_admin_co_admin',
       $ddl$create policy sc_payments_delete_admin_co_admin on public.sc_payments for delete to public
         using (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),
      ('sc_payments', 'sc_payments_insert',
       $ddl$create policy sc_payments_insert on public.sc_payments for insert to authenticated with check (true)$ddl$),
      ('sc_payments', 'sc_payments_select',
       $ddl$create policy sc_payments_select on public.sc_payments for select to authenticated using (true)$ddl$),
      ('sc_payments', 'sc_payments_update',
       $ddl$create policy sc_payments_update on public.sc_payments for update to authenticated
         using (true) with check (true)$ddl$),

      ('sc_payslip_deductions', 'sc_payslip_deductions_delete',
       $ddl$create policy sc_payslip_deductions_delete on public.sc_payslip_deductions for delete to authenticated
         using (sc_get_my_role() = 'admin'::text)$ddl$),
      ('sc_payslip_deductions', 'sc_payslip_deductions_insert',
       $ddl$create policy sc_payslip_deductions_insert on public.sc_payslip_deductions for insert to authenticated
         with check (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),
      ('sc_payslip_deductions', 'sc_payslip_deductions_read',
       $ddl$create policy sc_payslip_deductions_read on public.sc_payslip_deductions for select to authenticated
         using (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),
      ('sc_payslip_deductions', 'sc_payslip_deductions_update',
       $ddl$create policy sc_payslip_deductions_update on public.sc_payslip_deductions for update to authenticated
         using (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))
         with check (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),

      ('sc_payslips', 'sc_payslips_delete',
       $ddl$create policy sc_payslips_delete on public.sc_payslips for delete to authenticated
         using (sc_get_my_role() = 'admin'::text)$ddl$),
      ('sc_payslips', 'sc_payslips_insert',
       $ddl$create policy sc_payslips_insert on public.sc_payslips for insert to authenticated
         with check (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),
      ('sc_payslips', 'sc_payslips_read',
       $ddl$create policy sc_payslips_read on public.sc_payslips for select to authenticated
         using (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),
      ('sc_payslips', 'sc_payslips_update',
       $ddl$create policy sc_payslips_update on public.sc_payslips for update to authenticated
         using (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))
         with check (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),

      ('sc_rental_records', 'sc_rental_records_delete',
       $ddl$create policy sc_rental_records_delete on public.sc_rental_records for delete to authenticated
         using (sc_get_my_role() = 'admin'::text)$ddl$),
      ('sc_rental_records', 'sc_rental_records_insert',
       $ddl$create policy sc_rental_records_insert on public.sc_rental_records for insert to authenticated
         with check (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),
      ('sc_rental_records', 'sc_rental_records_read',
       $ddl$create policy sc_rental_records_read on public.sc_rental_records for select to authenticated
         using (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),
      ('sc_rental_records', 'sc_rental_records_update',
       $ddl$create policy sc_rental_records_update on public.sc_rental_records for update to authenticated
         using (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))
         with check (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),

      ('sc_sales', 'sc_sales_delete_admin',
       $ddl$create policy sc_sales_delete_admin on public.sc_sales for delete to public
         using (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),
      ('sc_sales', 'sc_sales_insert',
       $ddl$create policy sc_sales_insert on public.sc_sales for insert to authenticated with check (true)$ddl$),
      ('sc_sales', 'sc_sales_read_insert',
       $ddl$create policy sc_sales_read_insert on public.sc_sales for select to authenticated using (true)$ddl$),
      ('sc_sales', 'sc_sales_update',
       $ddl$create policy sc_sales_update on public.sc_sales for update to authenticated
         using (true) with check (true)$ddl$),

      ('sc_settings', 'sc_settings_read',
       $ddl$create policy sc_settings_read on public.sc_settings for select to authenticated using (true)$ddl$),
      ('sc_settings', 'sc_settings_write_admin',
       $ddl$create policy sc_settings_write_admin on public.sc_settings for all to authenticated
         using (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))
         with check (sc_get_my_role() = any (array['admin'::text, 'co-admin'::text]))$ddl$),

      ('customers', 'customers_authenticated_all',
       $ddl$create policy customers_authenticated_all on public.customers for all to authenticated
         using (true) with check (true)$ddl$),
      ('services', 'services_authenticated_all',
       $ddl$create policy services_authenticated_all on public.services for all to authenticated
         using (true) with check (true)$ddl$),
      ('service_orders', 'service_orders_authenticated_all',
       $ddl$create policy service_orders_authenticated_all on public.service_orders for all to authenticated
         using (true) with check (true)$ddl$),
      ('service_order_items', 'service_order_items_authenticated_all',
       $ddl$create policy service_order_items_authenticated_all on public.service_order_items for all to authenticated
         using (true) with check (true)$ddl$),
      ('expenses', 'expenses_authenticated_all',
       $ddl$create policy expenses_authenticated_all on public.expenses for all to authenticated
         using (true) with check (true)$ddl$)

    ) as v(tbl, pol, ddl)
  loop
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = p.tbl) then
      raise notice '[0031 rollback] ข้ามตาราง % — ไม่พบในฐานข้อมูลนี้', p.tbl;
      continue;
    end if;

    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.pol) then
      execute format('drop policy %I on public.%I', p.pol, p.tbl);
    end if;
    execute p.ddl;
  end loop;
end $$;
