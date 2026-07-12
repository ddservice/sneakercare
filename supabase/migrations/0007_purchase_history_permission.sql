-- Feature key ใหม่สำหรับการ์ด "ประวัติการซื้อเข้า" (Purchase History) ที่เพิ่งเพิ่มเข้าไปในหน้าคลังสินค้า
-- เปิดให้ Co-Admin เห็นตามที่ขอไว้ (มีข้อมูลต้นทุน/ราคาซื้อ จึงต้องปิดสำหรับ Manager/Staff เสมอ ตามกฎ
-- "Staff ต้องไม่เห็นข้อมูลต้นทุน/COGS เด็ดขาด" ใน CLAUDE.md)

insert into ui_permissions (role, feature_key, visible) values
  ('co-admin', 'inv_card_purchase_history', true),
  ('manager',  'inv_card_purchase_history', false)
on conflict (role, feature_key) do nothing;
