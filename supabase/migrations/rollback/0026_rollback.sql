-- ย้อน 0026 (sc_payslips / sc_payslip_deductions / sc_rental_records)
--
-- ปลอดภัยเต็มที่ตราบใดที่ยังไม่มีหน้าไหนอ่านตารางเหล่านี้ — ข้อมูลเงินเดือนและห้องเช่า
-- ตัวจริงยังอยู่ที่ `sc_opex` ครบทุกแถว และ 0026 ไม่ได้แตะ `sc_opex` เลย
--
-- ⚠️ ถ้าสลับการอ่านไปใช้ตารางเหล่านี้แล้ว **ห้ามรันไฟล์นี้** จนกว่าจะสลับกลับก่อน
-- ⚠️ ข้อมูลที่ backfill ไว้จะหายทั้งหมด แต่ backfill ใหม่ได้เสมอจาก `sc_opex`

drop trigger if exists sc_rental_records_touch on public.sc_rental_records;
drop trigger if exists sc_payslips_touch on public.sc_payslips;

drop table if exists public.sc_payslip_deductions;   -- ต้องลบก่อน มี FK ไป sc_payslips
drop table if exists public.sc_payslips;
drop table if exists public.sc_rental_records;

-- ไม่ drop public.sc_touch_updated_at() ทิ้ง — 0024 สร้างไว้และ sc_expense_entries ยังใช้อยู่
