-- เพิ่มวันที่ "รับเงินจริง" แยกจาก sale_date (วันที่ของยอดขาย) และ created_at (เวลาบันทึกแถว) เพื่อให้
-- คำนวณกำไรสุทธิแบบเงินสด (cash basis) ได้ถูกต้องตามเดือนที่รับเงินจริง ไม่ใช่เดือนที่เกิดยอดขาย
-- (ก่อนหน้านี้หน้าเว็บมีช่องให้เลือกวันที่รับเงินอยู่แล้ว แต่ไม่เคยถูกส่งเข้า Supabase เลย เก็บไว้แค่
-- localStorage ทำให้ข้อมูลหายถ้าเปลี่ยนเครื่อง/เคลียร์เบราว์เซอร์)
alter table sc_payments add column received_date date;
update sc_payments set received_date = created_at::date where received_date is null;
alter table sc_payments alter column received_date set default current_date;
alter table sc_payments alter column received_date set not null;

create index idx_sc_payments_received_date on sc_payments(received_date);
