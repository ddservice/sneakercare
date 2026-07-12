-- เปลี่ยนโมเดลสิทธิ์: Co-Admin มีสิทธิ์เท่า Admin ในทุกเรื่อง ยกเว้น 2 อย่างที่ยังสงวนไว้เฉพาะ Admin:
--   1. การจัดการบัญชีผู้ใช้งานระบบ (sc_users_admin_all — สร้าง/แก้ไข/ลบ user, เปลี่ยน role, Edge Function
--      create-user) — ไม่แตะ policy นี้เด็ดขาด
--   2. หน้า "สิทธิ์การมองเห็นเมนู" (ui_permissions_write, card_ui_permissions ใน UI) — ยังคุมได้เฉพาะ Admin
--      เพราะถ้าให้ Co-Admin แก้ ui_permissions เองได้ จะเปิดสิทธิ์ตัวเองเพิ่มแบบไม่มีการตรวจสอบ
--
-- ทุกอย่างอื่นที่เคย admin-only ปรับให้ co-admin ทำได้เท่ากันหมด

-- 1. การอนุมัติปรับปรุงสต๊อก — Co-Admin อนุมัติได้เอง (ไม่ต้องรอ Admin คนที่ 2 อีกต่อไป)
create or replace function inv_fn_approve_adjustment(p_txn_id uuid, p_approve boolean)
returns void as $$
declare
  v_txn inv_stock_transactions%rowtype;
begin
  if inv_fn_current_role() not in ('admin', 'co-admin') then
    raise exception 'เฉพาะ Admin และ Co-Admin เท่านั้นที่อนุมัติการปรับปรุงสต๊อกได้';
  end if;

  select * into v_txn from inv_stock_transactions where id = p_txn_id and status = 'pending_approval';
  if not found then
    raise exception 'ไม่พบรายการที่รออนุมัติ';
  end if;

  if inv_fn_current_role() = 'co-admin' and v_txn.branch_id != inv_fn_current_branch() then
    raise exception 'ไม่มีสิทธิ์อนุมัติรายการของสาขาอื่น';
  end if;

  if p_approve then
    update inv_stock_transactions set status = 'approved', approved_by = auth.uid() where id = p_txn_id;
    if v_txn.txn_type = 'adjustment_increase' then
      update inv_item_stock set current_qty = current_qty + v_txn.quantity_delta, updated_at = now()
        where item_id = v_txn.item_id and branch_id = v_txn.branch_id;
    else
      update inv_item_stock set current_qty = greatest(0, current_qty + v_txn.quantity_delta), updated_at = now()
        where item_id = v_txn.item_id and branch_id = v_txn.branch_id;
    end if;
  else
    update inv_stock_transactions set status = 'rejected', approved_by = auth.uid() where id = p_txn_id;
  end if;
end;
$$ language plpgsql security definer;

-- 2. รายการปรับสต๊อกที่ Co-Admin สร้างเอง ไม่ต้องรออนุมัติอีกต่อไป (เข้า approved ทันทีเหมือน Admin)
drop policy if exists inv_p_stock_txn_insert_co_admin on inv_stock_transactions;
create policy inv_p_stock_txn_insert_co_admin on inv_stock_transactions for insert with check (
  inv_fn_current_role() = 'co-admin' and txn_type in ('stock_in','stock_out','adjustment_increase','adjustment_decrease','waste')
  and performed_by = auth.uid() and branch_id = inv_fn_current_branch()
);

-- 3. จัดการสาขา (inv_branches) — Co-Admin ทำได้เท่า Admin
drop policy if exists inv_p_branches_write on inv_branches;
create policy inv_p_branches_write on inv_branches for all using (
  inv_fn_current_role() in ('admin', 'co-admin')
) with check (
  inv_fn_current_role() in ('admin', 'co-admin')
);

-- 4. ตั้งค่า Telegram Bot Token
create or replace function inv_fn_set_integration_secret(p_key text, p_value text)
returns void as $$
begin
  if inv_fn_current_role() not in ('admin', 'co-admin') then
    raise exception 'เฉพาะ Admin และ Co-Admin เท่านั้นที่ตั้งค่า integration secret ได้';
  end if;
  if p_value is null or length(trim(p_value)) = 0 then
    raise exception 'ค่า secret ห้ามว่าง';
  end if;

  insert into inv_integration_secrets(key, value, updated_by, updated_at)
  values (p_key, p_value, auth.uid(), now())
  on conflict (key) do update set value = p_value, updated_by = auth.uid(), updated_at = now();
end;
$$ language plpgsql security definer;

create or replace function inv_fn_integration_secret_status(p_key text)
returns table (is_set boolean, value_suffix text, updated_at timestamptz) as $$
begin
  if inv_fn_current_role() not in ('admin', 'co-admin') then
    raise exception 'เฉพาะ Admin และ Co-Admin เท่านั้นที่ดูสถานะ integration secret ได้';
  end if;

  return query
  select true, right(s.value, 4), s.updated_at
  from inv_integration_secrets s where s.key = p_key
  union all
  select false, null::text, null::timestamptz
  where not exists (select 1 from inv_integration_secrets where key = p_key)
  limit 1;
end;
$$ language plpgsql security definer;

-- 5. โลโก้ร้าน (branding storage bucket)
drop policy if exists branding_admin_write on storage.objects;
create policy branding_admin_write on storage.objects for insert with check (
  bucket_id = 'branding' and sc_get_my_role() in ('admin', 'co-admin')
);
drop policy if exists branding_admin_update on storage.objects;
create policy branding_admin_update on storage.objects for update using (
  bucket_id = 'branding' and sc_get_my_role() in ('admin', 'co-admin')
);
drop policy if exists branding_admin_delete on storage.objects;
create policy branding_admin_delete on storage.objects for delete using (
  bucket_id = 'branding' and sc_get_my_role() in ('admin', 'co-admin')
);

-- 6. ทำความสะอาดข้อมูล (Data Purge) — sc_opex / sc_sales bulk delete
drop policy if exists sc_opex_delete_admin on sc_opex;
create policy sc_opex_delete_admin on sc_opex for delete using (
  sc_get_my_role() in ('admin', 'co-admin')
);
drop policy if exists sc_sales_delete_admin on sc_sales;
create policy sc_sales_delete_admin on sc_sales for delete using (
  sc_get_my_role() in ('admin', 'co-admin')
);

-- 7. เปิด ui_permissions ให้ Co-Admin เห็นทุกเมนูเท่า Admin ยกเว้น "จัดการบัญชีผู้ใช้งานระบบ"
--    (หน้า "สิทธิ์การมองเห็นเมนู" เองไม่ได้อยู่ในตาราง ui_permissions — คุมด้วย _auth.role === 'admin' ตรงๆ
--    ในโค้ด ไม่ต้องแก้อะไรเพิ่ม ยังเป็น Admin-only เหมือนเดิม)
update ui_permissions set visible = true
where role = 'co-admin' and feature_key != 'card_user_mgmt';
