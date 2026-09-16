-- ย้อน 0028 (โครงพื้นฐาน tenants) กลับสู่สภาพเดิม
--
-- ปลอดภัยตราบใดที่ยังไม่ได้รัน migration เฟส 2 (บังคับ RLS ด้วย tenant_id) และยังไม่มี
-- ผู้ใช้ tenant ที่สองเข้าระบบจริง — เฟสนี้เป็นแค่คอลัมน์เพิ่มเข้ามาเฉยๆ ไม่มีอะไรอ่าน/เขียน
-- ตามคอลัมน์นี้เลย ลบทิ้งได้โดยของเดิมไม่กระทบ
--
-- ⚠️ ถ้ารัน migration เฟส 2 ไปแล้ว **ห้ามรันไฟล์นี้** จนกว่าจะย้อน RLS policy กลับไปเป็น
-- แบบเดิม (ไม่กรองด้วย tenant_id) ก่อน ไม่งั้น policy จะอ้างถึงคอลัมน์ที่ถูกลบไปแล้ว
-- แล้วทุก query บนตารางนั้นจะพังทั้งหมด

do $$
declare
  v_logical    text;
  v_actual     text;
  v_had_view   boolean;
  group_a constant text[] := array[
    'items', 'branches', 'suppliers', 'integration_secrets',
    'notification_log', 'audit_logs', 'item_stock', 'stock_transactions'
  ];
  group_b constant text[] := array[
    'customers', 'services', 'service_orders', 'service_order_items',
    'sc_sales', 'sc_opex', 'sc_opex_history', 'sc_payments', 'sc_employees',
    'sc_expenses', 'sc_payslip_deductions', 'sc_payslips', 'sc_rental_records',
    'sc_expense_entries', 'sc_settings', 'sc_audit_logs', 'profiles'
  ];
begin
  foreach v_logical in array group_a loop
    v_actual := null;
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'inv_' || v_logical) then
      v_actual := 'inv_' || v_logical;
    elsif exists (select 1 from pg_tables where schemaname = 'public' and tablename = v_logical) then
      v_actual := v_logical;
    end if;

    continue when v_actual is null;

    -- ถ้ามี view ชื่อเปล่า alias ตารางนี้อยู่ (production) ต้องลบ view ทิ้งก่อนเสมอ ไม่งั้น
    -- `drop column` จะถูกปฏิเสธเพราะ view ยังอ้างถึงคอลัมน์นี้อยู่ (0028 ทำ `create or replace
    -- view` ให้เห็น tenant_id ไปแล้ว) แล้วค่อยสร้าง view กลับด้วยรายชื่อคอลัมน์ปัจจุบัน
    -- (ซึ่งจะไม่มี tenant_id แล้วเพราะเพิ่งลบออกจากตารางจริง) พร้อมตั้ง security_invoker ซ้ำ
    v_had_view := v_actual = 'inv_' || v_logical
      and exists (select 1 from pg_views where schemaname = 'public' and viewname = v_logical);

    if v_had_view then
      execute format('drop view public.%I', v_logical);
    end if;

    execute format('drop index if exists public.%I', 'idx_' || v_actual || '_tenant');
    execute format('alter table public.%I drop column if exists tenant_id', v_actual);

    if v_had_view then
      execute format('create view public.%I as select * from public.%I', v_logical, v_actual);
      execute format('alter view public.%I set (security_invoker = on)', v_logical);
    end if;
  end loop;

  foreach v_logical in array group_b loop
    continue when not exists (select 1 from pg_tables where schemaname = 'public' and tablename = v_logical);

    execute format('drop index if exists public.%I', 'idx_' || v_logical || '_tenant');
    execute format('alter table public.%I drop column if exists tenant_id', v_logical);
  end loop;
end $$;

drop function if exists public.fn_current_tenant();
drop table if exists public.tenants;
