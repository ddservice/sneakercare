-- ย้อน 0025 (คอลัมน์ legacy_ref) กลับสู่สภาพเดิม
--
-- ⚠️ ถ้ารันหลังจาก backfill ขั้นที่ 3 ไปแล้ว จะเสียตัวกันการ backfill ซ้ำไป
-- (แถวที่ backfill ไว้ยังอยู่ครบ แต่รันสคริปต์ backfill อีกครั้งจะได้ข้อมูลซ้ำทันที)
-- ให้ลบแถวที่ backfill ไว้ก่อนเสมอ ถ้าจะย้อน migration นี้จริงๆ:
--   delete from public.sc_expense_entries where legacy_ref like '%-misc-%';

drop trigger if exists sc_expense_entries_fill_ref on public.sc_expense_entries;
drop function if exists public.sc_expense_entries_fill_legacy_ref();
drop index if exists public.sc_expense_entries_legacy_ref_uidx;
alter table public.sc_expense_entries drop column if exists legacy_ref;
