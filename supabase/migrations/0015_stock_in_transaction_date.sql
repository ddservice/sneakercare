-- เพิ่มวันที่ "รับของเข้าจริง" แยกจาก created_at (audit timestamp ของตอนกดบันทึกในระบบ) เพื่อให้กรอก
-- ย้อนหลังได้ (เช่น ซื้อของมาหลายวันแล้วเพิ่งมีเวลาบันทึกเข้าระบบ) โดยไม่กระทบ audit trail จริงว่าบันทึก
-- เมื่อไหร่ — ค่าเริ่มต้น = วันที่ปัจจุบัน เพื่อไม่กระทบข้อมูลเดิมที่มีอยู่แล้ว
alter table inv_stock_transactions add column transaction_date date not null default current_date;
