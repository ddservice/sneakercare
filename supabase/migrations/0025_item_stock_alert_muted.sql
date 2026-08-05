-- เพิ่มปุ่ม "ไม่ต้องแจ้งเตือน" ต่อสินค้า/ต่อสาขา — บางรายการ (เช่น ของที่ใกล้เลิกใช้ หรือของที่ยังไม่ได้กำหนด
-- จุดสั่งซื้อขั้นต่ำที่เหมาะสม) ทำให้ขึ้นแจ้งเตือนซ้ำๆ ทั้งที่ไม่ต้องการให้แจ้ง — คนละกรณีกับการตั้งจุดสั่งซื้อ
-- ขั้นต่ำเป็น 0 เพราะ current_qty <= 0 ก็ยังถือว่า "ใกล้หมด" ตามเงื่อนไขเดิมอยู่ดี
alter table inv_item_stock add column alert_muted boolean not null default false;

-- ตัดรายการที่ถูกปิดแจ้งเตือนออกจาก view นี้ — ทั้งแจ้งเตือน Telegram (inv-low-stock-alert edge function)
-- และหน้าจอที่อ่านจาก view เดียวกัน
drop view if exists inv_v_low_stock;
create view inv_v_low_stock as
select
  s.branch_id, b.name as branch_name,
  i.id as item_id, i.name, i.item_type, i.category,
  s.current_qty, s.min_stock_level, i.base_unit
from inv_item_stock s
join inv_items i on i.id = s.item_id
join inv_branches b on b.id = s.branch_id
where i.is_active = true and s.current_qty <= s.min_stock_level and s.alert_muted = false;

-- ════════════════════════════════════════════════════════════════════════
--  RPC: เปิด/ปิดแจ้งเตือนสต๊อกต่ำต่อสินค้า/ต่อสาขา (สิทธิ์เดียวกับ inv_fn_set_min_stock_level)
-- ════════════════════════════════════════════════════════════════════════
create or replace function inv_fn_set_alert_muted(p_item_id uuid, p_branch_id uuid, p_muted boolean)
returns void as $$
begin
  if not (inv_fn_current_role() = 'admin' or (inv_fn_current_role() = 'co-admin' and p_branch_id = inv_fn_current_branch())) then
    raise exception 'ไม่มีสิทธิ์แก้ไขการแจ้งเตือนของสาขานี้';
  end if;

  update inv_item_stock set alert_muted = p_muted, updated_at = now()
    where item_id = p_item_id and branch_id = p_branch_id;

  if not found then
    insert into inv_item_stock (item_id, branch_id, alert_muted)
    values (p_item_id, p_branch_id, p_muted);
  end if;
end;
$$ language plpgsql security definer;

grant execute on function inv_fn_set_alert_muted(uuid, uuid, boolean) to authenticated;
