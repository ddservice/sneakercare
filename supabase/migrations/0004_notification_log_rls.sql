-- notification_log ถูกสร้างใน 0001_init.sql แต่หลุดไม่ได้ enable RLS ไว้ (ต่างจากตารางอื่นทุกตัว)
-- Supabase Security Advisor เตือนเป็น "RLS Disabled in Public" — แก้ตรงนี้
--
-- การใช้งานจริงตอนนี้: มีแค่ Edge Function `low-stock-alert` ที่ insert/select ผ่าน service_role key
-- (bypass RLS อยู่แล้วตามดีไซน์) ยังไม่มีหน้าเว็บไหนใน /app query ตารางนี้ตรง ๆ
-- เลยล็อกแบบเดียวกับ integration_secrets ไปก่อน (deny-all จาก authenticated/anon) — ถ้าในอนาคตจะทำหน้า
-- "ประวัติการแจ้งเตือน" ให้ Admin ดู ค่อยเพิ่ม select policy ทีหลัง อย่าเปิดกว้างไว้ล่วงหน้าโดยไม่มีคนใช้จริง

alter table notification_log enable row level security;

revoke select, insert, update, delete on notification_log from authenticated, anon;
