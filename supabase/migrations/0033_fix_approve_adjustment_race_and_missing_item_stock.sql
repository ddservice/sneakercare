-- พบระหว่างเขียน pgTAP test ให้ inv_fn_approve_adjustment (2026-08-26) — ฟังก์ชันนี้ (0012) มีบั๊กเดียวกัน
-- เป๊ะกับที่เจอและแก้ไปแล้วในโปรเจกต์ RRS (Next.js rewrite ที่ทำคู่ขนานกันช่วงเช้าของวันนี้) 2 จุด:
--
-- 1. ไม่ lock แถวก่อน update (`select ... where status='pending_approval'` เฉยๆ ไม่มี `for update`) — ถ้า
--    admin/co-admin สองคนกด approve/reject รายการเดียวกันพร้อมกัน ทั้งคู่ผ่านเช็ค "status=pending_approval"
--    ได้พร้อมกันก่อนใครจะ commit ทำให้ inv_item_stock.current_qty ถูกบวก/ลบซ้ำสองครั้ง
-- 2. UPDATE inv_item_stock ตรงๆ โดยไม่เช็คว่ามีแถวอยู่ก่อนหรือไม่ — ถ้า item นั้นไม่เคยมี inv_item_stock ที่
--    สาขานี้มาก่อนเลย (เช่น สินค้าที่เพิ่งเพิ่มเข้าแคตตาล็อก ยังไม่เคย stock_in ที่สาขานี้) แล้วมีคนยื่นปรับปรุง
--    สต๊อกแบบ pending_approval ไว้ พอมีคนกด "อนุมัติ" ทีหลัง UPDATE จะจับคู่ 0 แถว แต่ function ไม่ raise
--    error อะไรเลย — ธุรกรรมถูกตั้ง status='approved' ทั้งที่สต๊อกจริงไม่ขยับเลยสักหน่วย

create or replace function inv_fn_approve_adjustment(p_txn_id uuid, p_approve boolean)
returns void as $$
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
$$ language plpgsql security definer set search_path = public, pg_temp;
