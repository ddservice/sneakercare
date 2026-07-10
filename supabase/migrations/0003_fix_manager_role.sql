-- แก้บั๊ก: ระบบผู้ใช้จริง (หน้าตั้งค่า → จัดการบัญชีผู้ใช้งานระบบ) สร้าง/แก้ไขผู้ใช้ระดับล่างสุดด้วย
-- role = 'manager' เสมอ (ดู dropdown ในฟอร์มสร้าง/แก้ไขผู้ใช้) แต่ policy เดิมของ inv_stock_transactions
-- เช็คเฉพาะ role = 'staff' (ค่าที่มีอยู่ในข้อมูลเดิมของ milo ตอนสร้าง schema) ทำให้พนักงานใหม่ที่สร้างผ่าน
-- ฟอร์มนี้ (role='manager') เบิกสินค้าในคลังสินค้าไม่ได้เลยแม้แต่รายการเดียว — แก้ให้ยอมรับทั้งสองค่า

drop policy if exists inv_p_stock_txn_insert_staff on inv_stock_transactions;
create policy inv_p_stock_txn_insert_staff on inv_stock_transactions for insert with check (
  inv_fn_current_role() in ('staff', 'manager') and txn_type = 'stock_out'
  and performed_by = auth.uid() and branch_id = inv_fn_current_branch()
);
