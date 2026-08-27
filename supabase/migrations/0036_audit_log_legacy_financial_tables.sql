-- ตามที่คุยกันไว้ (2026-08-27): sc_opex/sc_payments/sc_sales เปิด INSERT/UPDATE กว้างให้ authenticated
-- ทุกคนโดยตั้งใจ (staff ต้องกรอกข้อมูลขาย/รับเงิน/ค่าใช้จ่ายระหว่างทำงานปกติ) แต่ไม่มี audit trail เลย
-- แปลว่าแก้ยอดย้อนหลังได้โดยไม่มีร่องรอยว่าใครแก้อะไรจากอะไรเป็นอะไร — เลือกทางที่ไม่กระทบ workflow
-- พนักงานเลย (ไม่ไปจำกัดสิทธิ์ insert/update ที่ใช้งานจริงอยู่) คือเพิ่ม audit log แทน
--
-- ใช้ inv_fn_write_audit_log() ตัวเดิมกับ inv_audit_logs ตัวเดิม (ฟังก์ชันนี้ generic อยู่แล้ว ใช้
-- TG_TABLE_NAME/to_jsonb(new/old) ไม่ผูกกับ inv_* โดยเฉพาะ) ไม่ต้องสร้างตาราง/ฟังก์ชันคู่ขนานใหม่ —
-- SELECT ของ inv_audit_logs จำกัดแค่ admin/co-admin อยู่แล้ว (inv_p_audit_logs_select) เหมาะสมพอดีสำหรับ
-- ดูประวัติการเงินย้อนหลังด้วย ไม่ต้องแก้ policy อะไรเพิ่ม

create trigger sc_trg_audit_opex
after insert or update or delete on sc_opex
for each row execute function inv_fn_write_audit_log();

create trigger sc_trg_audit_payments
after insert or update or delete on sc_payments
for each row execute function inv_fn_write_audit_log();

create trigger sc_trg_audit_sales
after insert or update or delete on sc_sales
for each row execute function inv_fn_write_audit_log();
