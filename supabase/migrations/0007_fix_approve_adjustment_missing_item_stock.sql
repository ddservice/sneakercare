-- fn_approve_adjustment (0006) ทำ UPDATE item_stock ตรงๆ โดยไม่เช็คว่ามีแถวอยู่ก่อนหรือไม่
-- ถ้า item นั้นไม่เคยมี item_stock ที่สาขานี้มาก่อน (เช่น สินค้าที่เพิ่งเพิ่มเข้าแคตตาล็อกกลาง ยังไม่เคย
-- stock_in ที่สาขานี้เลย) แล้ว Co-Admin ยื่นปรับปรุงสต๊อก (pending_approval ผ่านเงื่อนไขนี้ได้ เพราะ trigger
-- หลักข้าม check ตอน insert แถว pending) พอ Admin กด "อนุมัติ" ทีหลัง UPDATE จะจับคู่ 0 แถว (WHERE ไม่ match)
-- แต่ function ไม่ raise error อะไรเลย — ธุรกรรมถูกตั้ง status = 'approved' ทั้งที่สต๊อกจริงไม่ขยับเลยสักหน่วย
--
-- แก้: ปรับเพิ่ม (adjustment_increase) ใช้ upsert เหมือน stock_in ปกติ (สร้างแถวใหม่ได้ถ้ายังไม่มี)
-- ปรับลด (adjustment_decrease) ถ้าไม่มีแถวอยู่ก่อนถือเป็นข้อมูลผิดปกติ (จะลดจากอะไรที่ไม่เคยมี) ให้ raise
-- exception แทนการเงียบผ่าน เหมือน trigger หลักทำกับ stock_out/waste

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
      insert into item_stock (item_id, branch_id, current_qty, updated_at)
      values (v_txn.item_id, v_txn.branch_id, v_txn.quantity_delta, now())
      on conflict (item_id, branch_id) do update
        set current_qty = item_stock.current_qty + v_txn.quantity_delta, updated_at = now();
    else
      update item_stock set current_qty = greatest(0, current_qty + v_txn.quantity_delta), updated_at = now()
        where item_id = v_txn.item_id and branch_id = v_txn.branch_id;
      if not found then
        raise exception 'ไม่มีสต๊อกของสินค้านี้ในสาขานี้ ไม่สามารถอนุมัติปรับลดได้';
      end if;
    end if;
  else
    update stock_transactions set status = 'rejected', approved_by = auth.uid() where id = p_txn_id;
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
