-- แก้ข้อมูลค้างที่เกิดจากบั๊ก: ฟีเจอร์ "ลบรายการซื้อเข้า" (void) ก่อนหน้านี้ไม่ได้ sync การหักลบไปที่ตาราง
-- เดิม sc_stock_status / sc_stock_transactions เลย (แก้โค้ดแล้วใน sneakercare_dashboard.html แต่ข้อมูลที่
-- เกิดขึ้นไปแล้วก่อนแก้โค้ดต้องแก้มือครั้งเดียว) — เคสนี้คือ Co-Admin (Milo) ลบรายการซื้อ "น้ำยาซักผ้า"
-- 3 ชิ้น @37 บาท (รวม 111 บาท) ออกจากระบบใหม่แล้ว แต่ตารางเก่ายังค้างยอด 111 บาทอยู่ ทำให้ "ต้นทุนวัสดุคลัง"
-- ในแท็บภาพรวมเดือน ก.ค. 2026 สูงเกินจริงไป 111 บาท และ sc_stock_status.quantity ค้างเป็น 6 (ที่ถูกคือ 3)

update sc_stock_status
set quantity = 3, updated_at = now()
where item_name = 'น้ำยาซักผ้า';

insert into sc_stock_transactions (date, type, item_name, quantity, price_per_unit, total, pay_method, recorded_by, last_updated)
values (current_date, 'ซื้อเข้า', 'น้ำยาซักผ้า', -3, 37.00, -111.00, 'ระบบคลังสินค้าใหม่ (แก้ไขข้อมูลค้าง)', 'system', now());
