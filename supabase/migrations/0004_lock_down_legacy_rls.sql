-- ล็อกสิทธิ์ระดับฐานข้อมูลให้ตรงกับที่ซ่อนไว้แล้วใน UI (การ์ด "ทำความสะอาดข้อมูล" จำกัดเฉพาะ Admin)
-- ก่อนหน้านี้ RLS หลวมกว่า UI ทำให้ Co-Admin/ทุก role เรียก API ตรงๆ ข้าม UI ได้

-- 1. sc_opex: ลบได้เฉพาะ Admin เท่านั้น (เดิมอนุญาต admin+co-admin) ให้ตรงกับ sc_sales ที่ล็อกไว้แล้ว
drop policy if exists sc_opex_delete_admin on sc_opex;
create policy sc_opex_delete_admin on sc_opex for delete using (
  sc_get_my_role() = 'admin'
);

-- 2. sc_stock_transactions: เดิมเป็น policy เดียว "auth_all" เปิดให้ authenticated ทุกคนทำได้ทุกอย่าง
-- (SELECT/INSERT/UPDATE/DELETE) แยกเป็นคนละ policy ตามระดับสิทธิ์จริง — อ่านได้ทุกคน (ใช้แสดงรายงาน
-- ค่าใช้จ่ายในแท็บภาพรวม) แต่แก้ไขข้อมูลได้เฉพาะ Admin/Co-Admin เท่านั้น (คนที่ทำรายการรับของเข้า/เบิกใช้
-- ในระบบคลังสินค้าใหม่ได้)
drop policy if exists auth_all on sc_stock_transactions;

create policy sc_stock_transactions_select on sc_stock_transactions for select using (true);
create policy sc_stock_transactions_insert on sc_stock_transactions for insert with check (
  sc_get_my_role() = ANY (ARRAY['admin', 'co-admin'])
);
create policy sc_stock_transactions_update on sc_stock_transactions for update using (
  sc_get_my_role() = ANY (ARRAY['admin', 'co-admin'])
);
create policy sc_stock_transactions_delete on sc_stock_transactions for delete using (
  sc_get_my_role() = 'admin'
);
