-- Staff-safe views: ตัดคอลัมน์ต้นทุนออกจากสิ่งที่ authenticated เลือกได้ตรง
-- ตาม CLAUDE.md ข้อ 5 และ docs/architecture.md §3.4
--
-- แนวทาง: view เป็น SECURITY DEFINER (security_invoker = false) เพื่อให้ตัดคอลัมน์ได้จริง
-- แล้วใส่ WHERE กรองบทบาท/สาขาเอง เพราะ view แบบนี้ข้าม RLS ของตารางฐาน
-- จากนั้น REVOKE SELECT บน item_stock / stock_transactions จาก authenticated
-- การเขียน ledger ยัง insert ตรงที่ stock_transactions ได้ (trigger เป็น SECURITY DEFINER อยู่แล้ว)

drop view if exists v_top_consumed_items_30d;
drop view if exists v_inventory_value;
drop view if exists v_monthly_cogs;
drop view if exists v_low_stock;

-- ยอดคงเหลือต่อสาขา — ไม่มี avg_unit_cost
create view v_item_stock
with (security_invoker = false) as
select
  s.item_id,
  s.branch_id,
  s.current_qty,
  s.min_stock_level,
  s.updated_at,
  i.name,
  i.item_type,
  i.category,
  i.base_unit,
  i.is_active,
  b.name as branch_name
from item_stock s
join items i on i.id = s.item_id
join branches b on b.id = s.branch_id
where fn_current_role() = 'admin' or s.branch_id = fn_current_branch();

-- ยอดคงเหลือพร้อมต้นทุน — Admin / Co-Admin เท่านั้น
create view v_item_stock_cost
with (security_invoker = false) as
select
  s.item_id,
  s.branch_id,
  s.current_qty,
  s.avg_unit_cost,
  s.min_stock_level,
  s.updated_at,
  i.name,
  i.item_type,
  i.category,
  i.base_unit,
  i.is_active,
  b.name as branch_name
from item_stock s
join items i on i.id = s.item_id
join branches b on b.id = s.branch_id
where fn_current_role() in ('admin', 'co_admin')
  and (fn_current_role() = 'admin' or s.branch_id = fn_current_branch());

-- ประวัติรายการสต๊อก — ไม่มี unit_cost_snapshot / total_cost
create view v_stock_transactions
with (security_invoker = false) as
select
  st.id,
  st.item_id,
  st.branch_id,
  st.txn_type,
  st.status,
  st.quantity_delta,
  st.reference_type,
  st.reference_note,
  st.corrects_txn_id,
  st.reason,
  st.performed_by,
  st.approved_by,
  st.created_at,
  i.name as item_name,
  b.name as branch_name,
  p.display_name as performed_by_name
from stock_transactions st
join items i on i.id = st.item_id
join branches b on b.id = st.branch_id
join profiles p on p.id = st.performed_by
where fn_current_role() = 'admin' or st.branch_id = fn_current_branch();

-- ประวัติพร้อมต้นทุน — Admin / Co-Admin เท่านั้น
create view v_stock_transactions_cost
with (security_invoker = false) as
select
  st.id,
  st.item_id,
  st.branch_id,
  st.txn_type,
  st.status,
  st.quantity_delta,
  st.unit_cost_snapshot,
  st.total_cost,
  st.reference_type,
  st.reference_note,
  st.corrects_txn_id,
  st.reason,
  st.performed_by,
  st.approved_by,
  st.created_at,
  i.name as item_name,
  b.name as branch_name,
  p.display_name as performed_by_name
from stock_transactions st
join items i on i.id = st.item_id
join branches b on b.id = st.branch_id
join profiles p on p.id = st.performed_by
where fn_current_role() in ('admin', 'co_admin')
  and (fn_current_role() = 'admin' or st.branch_id = fn_current_branch());

create view v_low_stock
with (security_invoker = false) as
select
  s.branch_id, b.name as branch_name,
  i.id as item_id, i.name, i.item_type, i.category,
  s.current_qty, s.min_stock_level, i.base_unit
from item_stock s
join items i on i.id = s.item_id
join branches b on b.id = s.branch_id
where i.is_active = true
  and s.current_qty <= s.min_stock_level
  and (fn_current_role() = 'admin' or s.branch_id = fn_current_branch());

-- มุมมองที่มีต้นทุน: Staff ได้ 0 แถวแม้จะเดาชื่อ view
create view v_inventory_value
with (security_invoker = false) as
select
  s.branch_id, b.name as branch_name,
  i.item_type,
  sum(s.current_qty * s.avg_unit_cost) as total_value
from item_stock s
join items i on i.id = s.item_id
join branches b on b.id = s.branch_id
where i.is_active = true
  and fn_current_role() in ('admin', 'co_admin')
  and (fn_current_role() = 'admin' or s.branch_id = fn_current_branch())
group by s.branch_id, b.name, i.item_type;

create view v_top_consumed_qty_30d
with (security_invoker = false) as
select branch_id, item_id, name, base_unit, total_qty_used from (
  select
    st.branch_id, i.id as item_id, i.name, i.base_unit,
    sum(abs(st.quantity_delta)) as total_qty_used,
    row_number() over (partition by st.branch_id order by sum(abs(st.quantity_delta)) desc) as rn
  from stock_transactions st
  join items i on i.id = st.item_id
  where st.txn_type = 'stock_out'
    and st.status = 'approved'
    and st.created_at >= now() - interval '30 days'
    and (fn_current_role() = 'admin' or st.branch_id = fn_current_branch())
  group by st.branch_id, i.id, i.name, i.base_unit
) ranked
where rn <= 3;

create view v_top_consumed_items_30d
with (security_invoker = false) as
select branch_id, item_id, name, base_unit, total_qty_used, total_cost_used from (
  select
    st.branch_id, i.id as item_id, i.name, i.base_unit,
    sum(abs(st.quantity_delta)) as total_qty_used,
    sum(st.total_cost) as total_cost_used,
    row_number() over (partition by st.branch_id order by sum(abs(st.quantity_delta)) desc) as rn
  from stock_transactions st
  join items i on i.id = st.item_id
  where st.txn_type = 'stock_out'
    and st.status = 'approved'
    and st.created_at >= now() - interval '30 days'
    and fn_current_role() in ('admin', 'co_admin')
    and (fn_current_role() = 'admin' or st.branch_id = fn_current_branch())
  group by st.branch_id, i.id, i.name, i.base_unit
) ranked
where rn <= 3;

create view v_monthly_cogs
with (security_invoker = false) as
select
  branch_id,
  date_trunc('month', created_at) as month,
  sum(total_cost) as cogs
from stock_transactions
where txn_type in ('stock_out','waste')
  and status = 'approved'
  and fn_current_role() in ('admin', 'co_admin')
  and (fn_current_role() = 'admin' or branch_id = fn_current_branch())
group by 1, 2
order by 2 desc;

revoke select on item_stock from authenticated, anon;
revoke select on stock_transactions from authenticated, anon;

grant select on v_item_stock to authenticated;
grant select on v_item_stock_cost to authenticated;
grant select on v_stock_transactions to authenticated;
grant select on v_stock_transactions_cost to authenticated;
grant select on v_low_stock to authenticated;
grant select on v_inventory_value to authenticated;
grant select on v_top_consumed_qty_30d to authenticated;
grant select on v_top_consumed_items_30d to authenticated;
grant select on v_monthly_cogs to authenticated;
