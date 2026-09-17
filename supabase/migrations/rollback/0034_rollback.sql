-- ย้อน 0034 กลับสู่สภาพเดิม (FK ชี้กลับไป sc_users(user_id) ทั้ง 4 จุด)
--
-- ⚠️ ใช้ NOT VALID เหมือนไฟล์ forward (0034) เจตนาเดียวกัน: หลัง apply 0034 ไปแล้ว จะมีบัญชี
-- ที่ทำงานจริงแต่ไม่มีแถวใน sc_users แน่นอน (คือทั้งประเด็นที่ 0034 แก้) การใส่ NOT VALID กัน
-- ไม่ให้ rollback ไปพังกับแถวเหล่านั้น — แต่ผลคือ**หลัง rollback แล้ว FK นี้จะไม่บังคับข้อมูล
-- จริงอีกต่อไป** (เหมือน trust-only ไม่ validate) เพราะ sc_users ไม่ถูกเขียนใหม่แล้วนับแต่ 0023
-- rollback ไฟล์นี้จึงมีไว้ "คืนชื่อ constraint เดิมให้ตรงกับ 0001_init.sql" เป็นหลัก ไม่ใช่คืน
-- การบังคับใช้จริงแบบเดิม — ถ้าจะย้อนจริงต้องคิดใหม่ว่าทำไมถึงอยากย้อน (sc_users ไม่ใช่แหล่งความจริง
-- เรื่องสิทธิ์/ผู้ใช้อีกแล้วตาม CLAUDE.md)

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'inv_audit_logs') then
    if exists (select 1 from pg_constraint where conname = 'inv_audit_logs_performed_by_profiles_fkey') then
      alter table public.inv_audit_logs drop constraint inv_audit_logs_performed_by_profiles_fkey;
    end if;
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'sc_users')
       and not exists (select 1 from pg_constraint where conname = 'inv_audit_logs_performed_by_fkey') then
      alter table public.inv_audit_logs
        add constraint inv_audit_logs_performed_by_fkey foreign key (performed_by) references public.sc_users(user_id) not valid;
    end if;
  end if;

  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'inv_stock_transactions') then
    if exists (select 1 from pg_constraint where conname = 'inv_stock_transactions_performed_by_profiles_fkey') then
      alter table public.inv_stock_transactions drop constraint inv_stock_transactions_performed_by_profiles_fkey;
    end if;
    if exists (select 1 from pg_constraint where conname = 'inv_stock_transactions_approved_by_profiles_fkey') then
      alter table public.inv_stock_transactions drop constraint inv_stock_transactions_approved_by_profiles_fkey;
    end if;
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'sc_users') then
      if not exists (select 1 from pg_constraint where conname = 'inv_stock_transactions_performed_by_fkey') then
        alter table public.inv_stock_transactions
          add constraint inv_stock_transactions_performed_by_fkey foreign key (performed_by) references public.sc_users(user_id) not valid;
      end if;
      if not exists (select 1 from pg_constraint where conname = 'inv_stock_transactions_approved_by_fkey') then
        alter table public.inv_stock_transactions
          add constraint inv_stock_transactions_approved_by_fkey foreign key (approved_by) references public.sc_users(user_id) not valid;
      end if;
    end if;
  end if;

  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'ui_permissions') then
    if exists (select 1 from pg_constraint where conname = 'ui_permissions_updated_by_profiles_fkey') then
      alter table public.ui_permissions drop constraint ui_permissions_updated_by_profiles_fkey;
    end if;
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'sc_users')
       and not exists (select 1 from pg_constraint where conname = 'ui_permissions_updated_by_fkey') then
      alter table public.ui_permissions
        add constraint ui_permissions_updated_by_fkey foreign key (updated_by) references public.sc_users(user_id) not valid;
    end if;
  end if;
end $$;
