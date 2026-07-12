-- แก้ช่องโหว่ RLS ที่พบระหว่างทำฟีเจอร์ "ประวัติการซื้อเข้า": inv_stock_transactions.select เดิมเปิดให้
-- ทุก role ในสาขาเดียวกัน (รวม manager/staff) query ตรงๆ ได้ ซึ่งมีคอลัมน์ unit_cost_snapshot/total_cost
-- อยู่ในตาราง — ผิดกฎ "Staff ต้องไม่เห็นข้อมูลต้นทุน/COGS เด็ดขาด" ใน CLAUDE.md ข้อ 5
--
-- ตรวจสอบแล้วว่าไม่มีจุดไหนในโค้ดหน้าเว็บที่ manager/staff ต้อง SELECT ตารางนี้ตรงๆ (การ์ด "รออนุมัติ" ก็เป็น
-- admin-only อยู่แล้ว, การ insert ปกติของ stock_out ไม่ต้องใช้สิทธิ์ select เพราะไม่ได้ chain .select() กลับ)
-- จึงล็อกได้โดยไม่กระทบฟีเจอร์ที่มีอยู่

drop policy if exists inv_p_stock_txn_select on inv_stock_transactions;

create policy inv_p_stock_txn_select on inv_stock_transactions for select using (
  inv_fn_current_role() = 'admin'
  or (inv_fn_current_role() = 'co-admin' and branch_id = inv_fn_current_branch())
);
