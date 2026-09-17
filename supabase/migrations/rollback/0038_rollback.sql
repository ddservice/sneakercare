-- rollback ของ 0038_approve_adjustment_super_admin.sql — คืน inv_fn_approve_adjustment()
-- ให้กลับไปเช็คแค่ ('admin', 'co-admin') เหมือนก่อนแก้

create or replace function public.inv_fn_approve_adjustment(p_txn_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_txn inv_stock_transactions%rowtype;
begin
  if inv_fn_current_role() not in ('admin', 'co-admin') then
    raise exception 'เฉพาะ Admin และ Co-Admin เท่านั้นที่อนุมัติการปรับปรุงสต๊อกได้';
  end if;

  select * into v_txn from inv_stock_transactions
    where id = p_txn_id and status = 'pending_approval'
    for update;
  if not found then
    raise exception 'ไม่พบรายการที่รออนุมัติ';
  end if;

  if inv_fn_current_role() = 'co-admin' and v_txn.branch_id != inv_fn_current_branch() then
    raise exception 'ไม่มีสิทธิ์อนุมัติรายการของสาขาอื่น';
  end if;

  if p_approve then
    update inv_stock_transactions set status = 'approved', approved_by = auth.uid() where id = p_txn_id;

    if v_txn.txn_type = 'adjustment_increase' then
      insert into inv_item_stock (item_id, branch_id, current_qty, updated_at)
      values (v_txn.item_id, v_txn.branch_id, v_txn.quantity_delta, now())
      on conflict (item_id, branch_id) do update
        set current_qty = inv_item_stock.current_qty + v_txn.quantity_delta, updated_at = now();
    else
      update inv_item_stock set current_qty = greatest(0, current_qty + v_txn.quantity_delta), updated_at = now()
        where item_id = v_txn.item_id and branch_id = v_txn.branch_id;
      if not found then
        raise exception 'ไม่มีสต๊อกของสินค้านี้ในสาขานี้ ไม่สามารถอนุมัติปรับลดได้';
      end if;
    end if;
  else
    update inv_stock_transactions set status = 'rejected', approved_by = auth.uid() where id = p_txn_id;
  end if;
end;
$function$;
