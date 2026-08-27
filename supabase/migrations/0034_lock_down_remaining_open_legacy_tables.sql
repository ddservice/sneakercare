-- พบระหว่างไล่ pg_policies ทั้ง public schema (2026-08-26/27): 4 ตารางยังใช้ pattern เดิมที่เคยพบเป็น
-- ปัญหาแล้วครั้งหนึ่งใน sc_stock_transactions เมื่อ 2026-07-10 (`auth_all` / `xxx_all` = FOR ALL
-- USING(true) — เปิดให้ authenticated ทุกคนทำได้ทุกอย่าง ไม่เช็ค role เลย) ตอนนั้นแก้แค่
-- sc_stock_transactions (migration 0004) ไม่เคยไล่เช็คตารางอื่นที่เหลือให้ครบ:
--
-- 1. sc_employees — เก็บ salary/bank/account (ข้อมูลเงินเดือน+เลขบัญชีธนาคารพนักงานทุกคน!) แอปมีแค่
--    หน้าเดียวที่ใช้ (useEmployees/useSaveEmployees/useToggleSsoExempt) และ useSaveEmployees ทำ
--    "ลบทั้งตารางแล้ว insert ใหม่ทั้งชุด" ทุกครั้งที่บันทึก — ชัดเจนว่าเป็นฟีเจอร์ระดับ admin/co-admin
--    เท่านั้น (หน้าตั้งค่าเงินเดือน) แต่ RLS เดิมเปิดให้ manager/staff อ่าน/แก้/ลบเงินเดือน+เลขบัญชีของ
--    ทุกคนได้ตรงๆ ผ่าน API — ล็อกทั้งตาราง (select/insert/update/delete) เหลือแค่ admin/co-admin
--
-- 2. sc_payments — ต่างจาก sc_employees เพราะ staff ต้องกดรับชำระเงินจริงระหว่างทำงาน (ดู
--    CollectPaymentModal.tsx, useCreatePayment) เลย "ล็อกแบบเดียวกับ sc_sales/sc_opex" ที่ทำไปแล้วใน
--    0012: select/insert/update เปิดเหมือนเดิม (staff ยังบันทึกรับเงินได้) ล็อกแค่ DELETE ให้เหลือ
--    admin/co-admin เท่านั้น (ไม่งั้นใครก็ลบประวัติรับเงินทิ้งเพื่อซ่อนเงินขาดได้)
--
-- 3. sc_expenses, 4. profiles — grep ทั้ง app/src แล้วไม่มีที่ไหนอ้างถึงเลยสักจุด (profiles ถูกบันทึกไว้ใน
--    CLAUDE.md เองแล้วว่าเป็นตารางเก่าที่เลิกใช้ตั้งแต่ก่อนย้ายมา sc_users, sc_expenses ก็ไม่มีการอ้างอิงจาก
--    โค้ดปัจจุบันเลย) ไม่มีเหตุผลอะไรต้องเปิดให้ authenticated เข้าถึงได้ — ล็อก deny-all ไปก่อน
--    (ยังไม่ลบตารางทิ้ง เผื่อมีข้อมูลประวัติศาสตร์อ้างอิงในอนาคต)

drop policy sc_employees_all on sc_employees;
create policy sc_employees_admin_co_admin on sc_employees for all using (
  sc_get_my_role() in ('admin', 'co-admin')
) with check (
  sc_get_my_role() in ('admin', 'co-admin')
);

drop policy auth_all on sc_payments;
create policy sc_payments_select on sc_payments for select using (true);
create policy sc_payments_insert on sc_payments for insert with check (true);
create policy sc_payments_update on sc_payments for update using (true) with check (true);
create policy sc_payments_delete_admin_co_admin on sc_payments for delete using (
  sc_get_my_role() in ('admin', 'co-admin')
);

drop policy auth_all on sc_expenses;
drop policy auth_all on profiles;
