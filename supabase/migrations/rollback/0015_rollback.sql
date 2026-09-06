-- ย้อน 0015 กลับสู่สภาพเดิม — ใช้เฉพาะกรณีที่หน้าการเงินของระบบเดิม (Google Apps Script)
-- บันทึกข้อมูลไม่ได้หลังรัน 0015 ซึ่งแปลว่า GAS ยิงเข้ามาด้วย anon key จริง
--
-- ⚠️ การรันไฟล์นี้ = เปิดช่องให้คนนอกอ่าน/เพิ่ม/แก้รายการรับชำระเงินได้อีกครั้ง
-- ให้ใช้เป็นทางออกชั่วคราวเท่านั้น แล้วรีบแก้ GAS ให้ใช้ service_role key แทน anon โดยเร็วที่สุด
drop policy if exists sc_payments_select on public.sc_payments;
drop policy if exists sc_payments_insert on public.sc_payments;
drop policy if exists sc_payments_update on public.sc_payments;
create policy sc_payments_select on public.sc_payments for select using (true);
create policy sc_payments_insert on public.sc_payments for insert with check (true);
create policy sc_payments_update on public.sc_payments for update using (true) with check (true);
