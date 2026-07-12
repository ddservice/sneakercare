-- กู้คืนข้อมูลสินค้าคงคลังที่ผู้ใช้เคยบันทึกไว้จริงเมื่อ 2026-07-10 แต่ไม่เคยถูกย้ายเข้าตาราง inv_items
-- ตอนสร้างระบบคลังสินค้าใหม่ (มีแค่ "กระดาษปริ้นบิล 80*80mm" ตัวเดียวที่ถูกสร้างในระบบใหม่ ส่วนอีก 4 รายการ
-- ยังค้างอยู่ในตารางเดิม sc_stock_status เท่านั้น จึงไม่เคยโชว์ในหน้า "คลังสินค้า" ใหม่เลย)
--
-- Insert ผ่าน inv_stock_transactions ตามปกติ (ไม่ใช่เขียน avg_unit_cost ตรงๆ) เพื่อให้ trigger
-- inv_fn_apply_stock_transaction คำนวณ moving-average cost ให้ถูกต้องตามกฎ #6 ใน CLAUDE.md

do $$
declare
  v_branch_id uuid := 'cb8dcf5d-7e5e-4671-be42-aca79469a19b';
  v_admin_id  uuid := '7649a97a-2c79-41cd-9c35-27398ea73c28';
  v_item_id   uuid;
  v_rec record;
begin
  for v_rec in (
    select * from (values
      ('ถุงใส่รองเท้า',              'น้ำยาทำความสะอาด', 300.000, 2.4967,   10),
      ('น้ำหอมฉีดรองเท้า',           'น้ำยาทำความสะอาด', 2.000,   219.0000, 1),
      ('ค่าน้ำยาซักรองเท้าหนังกลับ', 'น้ำยาทำความสะอาด', 3.000,   237.0000, 1),
      ('หมึกเครื่องปริ้น',           'น้ำยาทำความสะอาด', 5.000,   200.0000, 1)
    ) as t(name, category, qty, price, min_alert)
  )
  loop
    insert into inv_items (name, item_type, category, base_unit, purchase_unit, purchase_unit_qty, default_min_stock_level)
    values (v_rec.name, 'consumable', v_rec.category, 'ชิ้น', 'ชิ้น', 1, v_rec.min_alert)
    returning id into v_item_id;

    insert into inv_stock_transactions (item_id, branch_id, txn_type, quantity_delta, unit_cost_snapshot,
      reference_type, reference_note, performed_by)
    values (v_item_id, v_branch_id, 'stock_in', v_rec.qty, v_rec.price,
      'purchase', 'นำเข้าข้อมูลจากระบบเดิม (sc_stock_status) ที่ตกหล่นตอนสร้างระบบคลังสินค้าใหม่', v_admin_id);
  end loop;
end $$;
