-- Supabase Security Advisor พบ 2 ประเภทปัญหาจริงในฐานข้อมูลนี้:
--
-- 1. "Security Definer View" x4 (inv_v_low_stock, inv_v_inventory_value,
--    inv_v_top_consumed_items_30d, inv_v_monthly_cogs) — view เหล่านี้ไม่เคยตั้ง security_invoker
--    เลยทำงานแบบ SECURITY DEFINER โดยปริยาย (default ของ Postgres) จึง bypass RLS ของตารางฐานไปเลย
--    ต่างจาก inv_stock_transactions/inv_item_stock ที่มี RLS policy จำกัดสิทธิ์ตาม role/สาขาไว้ถูกต้องแล้ว
--    (ดู inv_p_stock_txn_select ใน 0008_lock_down_stock_txn_select.sql) — ผลคือ manager/staff ที่ถูกกัน
--    ไม่ให้ SELECT inv_stock_transactions ตรงๆ กลับเรียก REST API ของ view พวกนี้ตรงๆ แล้วเห็นต้นทุน/COGS/
--    มูลค่าคลังได้อยู่ดี (หน้าเว็บไม่เคยเรียก view เหล่านี้ก็จริง แต่ API เปิดให้เรียกตรงได้เสมอถ้า role
--    เดายิง REST เอง ไม่ใช่การป้องกันที่ชั้น DB จริง)
--
--    แก้โดยเพิ่ม `security_invoker = true` ให้ view (ไม่แก้ query เลย แค่เปลี่ยนว่าจะรันด้วยสิทธิ์ของใคร) —
--    วิธีนี้ทำให้ view กลับไปเคารพ RLS ของตารางฐานที่ถูกต้องอยู่แล้วทันที ไม่ต้อง copy logic role/branch
--    ซ้ำเข้าไปใน view เอง (ต่างจาก RRS ที่ revoke SELECT ตารางฐานทั้งหมดเลยต้องเขียน logic เองใน view —
--    ระบบนี้ไม่ได้ revoke แบบนั้น จึงใช้วิธีนี้ได้ตรงกว่า)
--
--    ตรวจ live schema ก่อนเขียน migration นี้แล้วพบว่า inv_v_low_stock มี `and s.alert_muted = false`
--    เพิ่มเข้ามาจริงตอน 0025_item_stock_alert_muted.sql (ไม่ได้แก้ comment ไว้ในนั้น) — เก็บเงื่อนไขนี้ไว้
--    ด้วยไม่งั้นฟีเจอร์ mute alert จะหายไปเงียบๆ ตอน apply migration นี้
--
-- 2. "RLS Disabled in Public" — inv_notification_log เป็นตารางเดียวใน 25 migration ที่ไม่เคย
--    `enable row level security` เลย (ตรวจสอบแล้วว่าไม่มีหน้าเว็บไหน SELECT/INSERT/UPDATE ตารางนี้ตรงๆ —
--    เขียนผ่าน Edge Function `inv-low-stock-alert` ด้วย service_role เท่านั้น ซึ่ง bypass RLS อยู่แล้ว)
--    ล็อกแบบ deny-all จาก authenticated/anon เหมือน inv_integration_secrets

create or replace view inv_v_low_stock
with (security_invoker = true) as
select
  s.branch_id, b.name as branch_name,
  i.id as item_id, i.name, i.item_type, i.category,
  s.current_qty, s.min_stock_level, i.base_unit
from inv_item_stock s
join inv_items i on i.id = s.item_id
join inv_branches b on b.id = s.branch_id
where i.is_active = true and s.current_qty <= s.min_stock_level and s.alert_muted = false;

create or replace view inv_v_inventory_value
with (security_invoker = true) as
select
  s.branch_id, b.name as branch_name,
  i.item_type,
  sum(s.current_qty * s.avg_unit_cost) as total_value
from inv_item_stock s
join inv_items i on i.id = s.item_id
join inv_branches b on b.id = s.branch_id
where i.is_active = true
group by s.branch_id, b.name, i.item_type;

create or replace view inv_v_top_consumed_items_30d
with (security_invoker = true) as
select branch_id, item_id, name, base_unit, total_qty_used, total_cost_used from (
  select
    st.branch_id, i.id as item_id, i.name, i.base_unit,
    sum(abs(st.quantity_delta)) as total_qty_used,
    sum(st.total_cost) as total_cost_used,
    row_number() over (partition by st.branch_id order by sum(abs(st.quantity_delta)) desc) as rn
  from inv_stock_transactions st
  join inv_items i on i.id = st.item_id
  where st.txn_type = 'stock_out'
    and st.status = 'approved'
    and st.created_at >= now() - interval '30 days'
  group by st.branch_id, i.id, i.name, i.base_unit
) ranked
where rn <= 3;

create or replace view inv_v_monthly_cogs
with (security_invoker = true) as
select
  branch_id,
  date_trunc('month', created_at) as month,
  sum(total_cost) as cogs
from inv_stock_transactions
where txn_type in ('stock_out','waste') and status = 'approved'
group by 1, 2
order by 2 desc;

alter table inv_notification_log enable row level security;
revoke select, insert, update, delete on inv_notification_log from authenticated, anon;
