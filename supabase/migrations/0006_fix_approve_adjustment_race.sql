-- fn_approve_adjustment (0001_init.sql) select แถว pending_approval แบบไม่ lock ก่อน update
-- ถ้า Admin สองคนกด approve/reject รายการเดียวกันพร้อมกัน ทั้งคู่ผ่านเช็ค "status = pending_approval"
-- ได้พร้อมกันก่อนใครจะ commit ทำให้ item_stock.current_qty ถูกบวก/ลบยอดซ้ำสองครั้ง (ละเมิดกฎ ledger
-- ไม่ให้นับซ้ำ) — ใส่ `for update` ให้ transaction ที่มาทีหลังต้องรอ lock แล้วจะเจอ status ที่เปลี่ยนไปแล้ว
-- (ไม่ใช่ pending_approval) จึง raise exception ตามปกติแทนที่จะ apply ซ้ำ

create or replace function fn_approve_adjustment(p_txn_id uuid, p_approve boolean)
returns void as $$
declare
  v_txn stock_transactions%rowtype;
begin
  if fn_current_role() != 'admin' then
    raise exception 'เฉพาะ Admin เท่านั้นที่อนุมัติการปรับปรุงสต๊อกได้';
  end if;

  select * into v_txn from stock_transactions
    where id = p_txn_id and status = 'pending_approval'
    for update;
  if not found then
    raise exception 'ไม่พบรายการที่รออนุมัติ';
  end if;

  if p_approve then
    update stock_transactions set status = 'approved', approved_by = auth.uid() where id = p_txn_id;
    if v_txn.txn_type = 'adjustment_increase' then
      update item_stock set current_qty = current_qty + v_txn.quantity_delta, updated_at = now()
        where item_id = v_txn.item_id and branch_id = v_txn.branch_id;
    else
      update item_stock set current_qty = greatest(0, current_qty + v_txn.quantity_delta), updated_at = now()
        where item_id = v_txn.item_id and branch_id = v_txn.branch_id;
    end if;
  else
    update stock_transactions set status = 'rejected', approved_by = auth.uid() where id = p_txn_id;
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
