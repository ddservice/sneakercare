-- ต่อจาก migration 0013: พบรายการที่ 2 ที่ตกหล่นจากบั๊กเดียวกัน (ฟีเจอร์ "ลบรายการซื้อเข้า" ก่อนแก้โค้ด
-- ไม่เคย sync การหักลบไปที่ sc_stock_status/sc_stock_transactions) — เคสนี้คือ Co-Admin (Milo) ซื้อเข้า
-- "ค่าน้ำยาซักรองเท้าหนังกลับ" 3 ชิ้น @237 บาท (711 บาท) แล้วลบรายการนั้นออกทันที (กรอกซ้ำ) ฝั่ง inv_*
-- ถูกต้องแล้ว (current_qty กลับไปเป็น 3 เท่าของก่อนซื้อ) แต่ตารางเก่ายังค้างยอดซื้อ 711 บาทไว้เต็มๆ ไม่เคย
-- ถูกหักออก ทำให้ "ต้นทุนวัสดุคลัง" เดือน ก.ค. 2026 สูงเกินจริงไป 711 บาท และ sc_stock_status.quantity
-- ค้างเป็น 6 (ที่ถูกคือ 3)

update sc_stock_status
set quantity = 3, updated_at = now()
where item_name = 'ค่าน้ำยาซักรองเท้าหนังกลับ';

insert into sc_stock_transactions (date, type, item_name, quantity, price_per_unit, total, pay_method, recorded_by, last_updated)
values (current_date, 'ซื้อเข้า', 'ค่าน้ำยาซักรองเท้าหนังกลับ', -3, 237.00, -711.00, 'ระบบคลังสินค้าใหม่ (แก้ไขข้อมูลค้าง)', 'system', now());
