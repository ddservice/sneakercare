-- ทุกฟังก์ชันด้านล่างเป็น SECURITY DEFINER แต่ไม่เคย pin search_path ไว้เลยตั้งแต่สร้าง — เสี่ยง
-- search_path hijacking (caller ตั้ง search_path ชี้ไป schema อื่นที่มีชื่อ object ชนกัน แล้วหลอกให้
-- SECURITY DEFINER ไปเรียก object ปลอมแทนของจริงใน public) Supabase Security Advisor เตือนเป็น
-- "Function Search Path Mutable" ต่อฟังก์ชัน น่าจะเป็นส่วนใหญ่ของ warnings ที่ยังไม่เคยตรวจละเอียด
-- (เห็นแค่ 5 errors ตอนแรก ไม่เคยเห็นรายละเอียด 39 warnings) — ไม่แก้ logic ข้างในเลยสักบรรทัด แค่ pin
-- schema resolution ให้ชัดเจน ปลอดภัย 100% ไม่กระทบพฤติกรรมเดิม

alter function inv_fn_apply_stock_transaction() set search_path = public, pg_temp;
alter function inv_fn_write_audit_log() set search_path = public, pg_temp;
alter function inv_fn_current_role() set search_path = public, pg_temp;
alter function inv_fn_current_branch() set search_path = public, pg_temp;
alter function inv_fn_approve_adjustment(uuid, boolean) set search_path = public, pg_temp;
alter function inv_fn_set_min_stock_level(uuid, uuid, numeric) set search_path = public, pg_temp;
alter function inv_fn_set_integration_secret(text, text) set search_path = public, pg_temp;
alter function inv_fn_integration_secret_status(text) set search_path = public, pg_temp;
alter function inv_fn_set_alert_muted(uuid, uuid, boolean) set search_path = public, pg_temp;
