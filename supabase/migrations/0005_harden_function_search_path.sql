-- ทุกฟังก์ชันด้านล่างเป็น SECURITY DEFINER แต่ไม่เคย pin search_path ไว้
-- ทำให้เสี่ยง search_path hijacking (caller ตั้ง search_path ให้ชี้ไป schema อื่นที่มีชื่อฟังก์ชัน/ตารางชนกัน
-- แล้วหลอกให้ SECURITY DEFINER ไปเรียก object ปลอมแทน) — Supabase Security Advisor เตือนเป็น
-- "Function Search Path Mutable" ต่อฟังก์ชัน ไม่เปลี่ยน logic ข้างในเลย แค่ fix search_path ให้ชัดเจน

alter function fn_set_integration_secret(text, text) set search_path = public, pg_temp;
alter function fn_integration_secret_status(text) set search_path = public, pg_temp;
alter function fn_apply_stock_transaction() set search_path = public, pg_temp;
alter function fn_write_audit_log() set search_path = public, pg_temp;
alter function fn_current_role() set search_path = public, pg_temp;
alter function fn_current_branch() set search_path = public, pg_temp;
alter function fn_approve_adjustment(uuid, boolean) set search_path = public, pg_temp;
alter function fn_set_min_stock_level(uuid, uuid, numeric) set search_path = public, pg_temp;
