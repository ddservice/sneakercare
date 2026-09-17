-- ════════════════════════════════════════════════════════════════════════
--  0034_retire_sc_users_fk_dependency.sql
--  เลิกให้ FK สำคัญชี้ไปที่ sc_users (deprecated) — ชี้ profiles(id) แทน
-- ════════════════════════════════════════════════════════════════════════
--
-- 🔴 [เจอระหว่างทดสอบ 0033 กับ production จริง 2026-09-17] ตอนแรกคิดว่าแก้แค่
-- inv_integration_secrets.updated_by พอ แต่พอทดสอบเขียนจริงด้วยบัญชีทดสอบใหม่ (ไม่มีแถวใน
-- sc_users — เหมือนทุกบัญชีที่จะเชิญเข้าระบบใหม่ในอนาคต ทั้ง tenant 1 เพิ่มคนและ tenant 2
-- ทั้งหมด) กลับชน FK ใหม่อีกตัวทันที: `inv_audit_logs_performed_by_fkey` — DB trigger
-- (`inv_fn_write_audit_log`) เขียน audit log ทุกครั้งที่มีการ insert/update บนตารางที่ผูก
-- trigger ไว้ (inv_item_stock, inv_stock_transactions, inv_integration_secrets) และ
-- performed_by ที่ trigger ใส่ให้ (auth.uid()) ต้องผ่าน FK ไปหา sc_users(user_id) ด้วย
--
-- ตรวจกับ production จริงแล้วพบ FK ที่ชี้ไป sc_users ทั้งหมด 4 จุด:
--   inv_audit_logs.performed_by · inv_stock_transactions.performed_by ·
--   inv_stock_transactions.approved_by · ui_permissions.updated_by
--
-- **ผลกระทบจริงถ้าไม่แก้:** บัญชีใดก็ตามที่ไม่มีแถวใน sc_users (คือทุกบัญชีที่เชิญเข้าระบบใหม่
-- ตั้งแต่ 0023 เป็นต้นมา — sc_users เลิกถูกเขียนแล้ว) จะรับ-เบิก-ปรับสต๊อกไม่ได้เลยสักครั้งเดียว
-- ทันทีที่ trigger audit พยายามเขียน log แล้วชน FK — ยังไม่เคยมีใครเจอเพราะปัจจุบันมีแค่ 2 บัญชี
-- จริง (admin, milo) ที่ทั้งคู่เป็นบัญชีเก่าที่มีแถวใน sc_users อยู่แล้ว แต่จะระเบิดทันทีที่เชิญ
-- พนักงานคนแรกของ tenant ที่สอง (หรือพนักงานคนใหม่ของ tenant 1 เอง) แล้วให้เขาทำงานจริง
--
-- ⚠️ inv_audit_logs มีข้อมูลจริง 853 แถว โดย 2 แถว (id 354, 355 — บัญชีทดสอบ rlsverify35...
-- ที่ไม่เคยมี profiles row ตามที่ CLAUDE.md บันทึกไว้) ไม่มี id ตรงกับ profiles เลย
-- ⚠️ ตามกฎข้อ 1 (audit_logs ห้าม UPDATE เด็ดขาด แม้แต่แถวเก่า) จึงเพิ่ม FK นี้แบบ `NOT VALID`
-- (บังคับเฉพาะแถวใหม่ที่จะ insert ต่อจากนี้ ไม่ไปเช็คย้อนหลัง 853 แถวเดิม) — inv_stock_transactions
-- และ ui_permissions ไม่มีแถวไหนหลุดเลย (ตรวจแล้ว) จึงใช้ FK แบบ validate เต็มได้ตามปกติ

do $$
begin
  -- 1) inv_audit_logs.performed_by → profiles(id), NOT VALID (มีแถวเก่า 2 แถวที่แก้ไม่ได้ตามกฎข้อ 1)
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'inv_audit_logs') then
    if exists (select 1 from pg_constraint where conname = 'inv_audit_logs_performed_by_fkey') then
      alter table public.inv_audit_logs drop constraint inv_audit_logs_performed_by_fkey;
    end if;
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'profiles')
       and not exists (select 1 from pg_constraint where conname = 'inv_audit_logs_performed_by_profiles_fkey') then
      alter table public.inv_audit_logs
        add constraint inv_audit_logs_performed_by_profiles_fkey
        foreign key (performed_by) references public.profiles(id) not valid;
    end if;
  end if;

  -- 2) inv_stock_transactions.performed_by / approved_by → profiles(id), validate เต็ม (0 แถวหลุด)
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'inv_stock_transactions') then
    if exists (select 1 from pg_constraint where conname = 'inv_stock_transactions_performed_by_fkey') then
      alter table public.inv_stock_transactions drop constraint inv_stock_transactions_performed_by_fkey;
    end if;
    if exists (select 1 from pg_constraint where conname = 'inv_stock_transactions_approved_by_fkey') then
      alter table public.inv_stock_transactions drop constraint inv_stock_transactions_approved_by_fkey;
    end if;
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'profiles') then
      if not exists (select 1 from pg_constraint where conname = 'inv_stock_transactions_performed_by_profiles_fkey') then
        alter table public.inv_stock_transactions
          add constraint inv_stock_transactions_performed_by_profiles_fkey
          foreign key (performed_by) references public.profiles(id);
      end if;
      if not exists (select 1 from pg_constraint where conname = 'inv_stock_transactions_approved_by_profiles_fkey') then
        alter table public.inv_stock_transactions
          add constraint inv_stock_transactions_approved_by_profiles_fkey
          foreign key (approved_by) references public.profiles(id);
      end if;
    end if;
  end if;

  -- 3) ui_permissions.updated_by → profiles(id), validate เต็ม (0 แถวหลุด)
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'ui_permissions') then
    if exists (select 1 from pg_constraint where conname = 'ui_permissions_updated_by_fkey') then
      alter table public.ui_permissions drop constraint ui_permissions_updated_by_fkey;
    end if;
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'profiles')
       and not exists (select 1 from pg_constraint where conname = 'ui_permissions_updated_by_profiles_fkey') then
      alter table public.ui_permissions
        add constraint ui_permissions_updated_by_profiles_fkey
        foreign key (updated_by) references public.profiles(id);
    end if;
  end if;
end $$;
