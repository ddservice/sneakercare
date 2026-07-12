-- ต่อจาก migration 0009: เจอสินค้าอีก 5 รายการที่มีประวัติการซื้อใน sc_stock_transactions (ตาราง ledger เก่า)
-- แต่ไม่เคยมีแถวใน sc_stock_status เลย (ซื้อครั้งเดียวเมื่อพ.ค. 2026 ไม่เคยมีรายการเบิกใช้งาน จึงไม่เคยถูก
-- ตรวจพบตอนเทียบกับ sc_stock_status ใน migration 0009) — ยอดคงเหลือ = ยอดที่ซื้อครั้งเดียวนั้นเลย เพราะไม่มี
-- รายการตัดออกเลยตั้งแต่ซื้อมา
--
-- แปรงทองเหลือง/ถุงมือยาง จัดเป็น 'inventory' (ใช้ซ้ำได้ สึกหรอตามเวลา) ตามหลักการแบ่งประเภทที่เคยแนะนำไว้
-- ส่วนสีทารองเท้า/ไฮเตอร์มาเล เป็นของเหลวใช้แล้วหมดไป จัดเป็น 'consumable'

do $$
declare
  v_branch_id uuid := 'cb8dcf5d-7e5e-4671-be42-aca79469a19b';
  v_admin_id  uuid := '7649a97a-2c79-41cd-9c35-27398ea73c28';
  v_item_id   uuid;
  v_rec record;
begin
  for v_rec in (
    select * from (values
      ('ถุงมือยาง ไซส์ L', 'อุปกรณ์ทำความสะอาด', 'inventory',  15.000, 17.0400),
      ('ถุงมือยาง ไซส์ S', 'อุปกรณ์ทำความสะอาด', 'inventory',  10.000, 17.0400),
      ('แปรงทองเหลือง',    'อุปกรณ์ทำความสะอาด', 'inventory',  12.000, 28.8333),
      ('สีทารองเท้า',      'น้ำยาทำความสะอาด',   'consumable', 2.000,  333.5000),
      ('ไฮเตอร์มาเล',      'น้ำยาทำความสะอาด',   'consumable', 12.000, 28.2500)
    ) as t(name, category, item_type, qty, price)
  )
  loop
    insert into inv_items (name, item_type, category, base_unit, purchase_unit, purchase_unit_qty, default_min_stock_level)
    values (v_rec.name, v_rec.item_type::inv_item_type, v_rec.category, 'ชิ้น', 'ชิ้น', 1, 1)
    returning id into v_item_id;

    insert into inv_stock_transactions (item_id, branch_id, txn_type, quantity_delta, unit_cost_snapshot,
      reference_type, reference_note, performed_by)
    values (v_item_id, v_branch_id, 'stock_in', v_rec.qty, v_rec.price,
      'purchase', 'นำเข้าข้อมูลจากประวัติ sc_stock_transactions เดิม (ซื้อ พ.ค. 2026) ที่ตกหล่นตอนสร้างระบบคลังสินค้าใหม่', v_admin_id);
  end loop;
end $$;
