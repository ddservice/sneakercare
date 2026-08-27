-- Security Advisor (2026-08-27): ทุก SECURITY DEFINER function (10 ตัว) ถูก GRANT EXECUTE ให้
-- public/anon/authenticated ทั้งหมดตั้งแต่สร้าง (ค่า default ของ Postgres ที่ไม่มีใคร REVOKE ออก) —
-- แปลว่า**คนที่ไม่ได้ login เลยก็เรียก RPC พวกนี้ตรงๆ ได้** (ฟังก์ชันเองมี role check ภายในอยู่แล้ว
-- ปฏิเสธ anon เสมอเพราะ sc_get_my_role()/inv_fn_current_role() เป็น null สำหรับ anon แต่ไม่ควรเปิดพื้นผิว
-- ให้เรียกได้ตั้งแต่แรกโดยไม่จำเป็น) — revoke จาก public/anon ทั้ง 10 ตัว เหลือแค่ authenticated (และ
-- service_role ที่ต้องมีเสมอสำหรับ Edge Function)
--
-- เพิ่มเติม: inv_fn_apply_stock_transaction() กับ inv_fn_write_audit_log() เป็น trigger function ล้วนๆ
-- (ใช้ NEW/OLD ซึ่งมีความหมายเฉพาะตอนถูกเรียกจาก trigger เท่านั้น) ไม่มีเหตุผลอะไรที่โค้ดไหนต้องเรียกตรง
-- ผ่าน RPC เลย — revoke จาก authenticated ด้วย (trigger ยังทำงานปกติ เพราะ Postgres ไม่เช็ค EXECUTE
-- privilege ตอน trigger ทำงานอัตโนมัติ เช็คแค่ตอนเรียกเป็น function call ตรงๆ เท่านั้น — ยืนยันแล้วด้วย
-- real JWT test ว่า stock_in ปกติยังทำงานถูกต้องหลัง revoke)

revoke execute on function inv_fn_apply_stock_transaction() from public, anon, authenticated;
revoke execute on function inv_fn_write_audit_log() from public, anon, authenticated;

revoke execute on function inv_fn_approve_adjustment(uuid, boolean) from public, anon;
revoke execute on function inv_fn_current_branch() from public, anon;
revoke execute on function inv_fn_current_role() from public, anon;
revoke execute on function inv_fn_integration_secret_status(text) from public, anon;
revoke execute on function inv_fn_set_alert_muted(uuid, uuid, boolean) from public, anon;
revoke execute on function inv_fn_set_integration_secret(text, text) from public, anon;
revoke execute on function inv_fn_set_min_stock_level(uuid, uuid, numeric) from public, anon;
revoke execute on function sc_get_my_role() from public, anon;
