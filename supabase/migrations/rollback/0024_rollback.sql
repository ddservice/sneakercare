-- ย้อน 0024 (ตาราง sc_expense_entries / sc_expense_categories) กลับสู่สภาพเดิม
--
-- ปลอดภัยเต็มที่ **ตราบใดที่ยังอยู่ในขั้นที่ 1–3 ของ docs/sc-opex-refactor-plan.md**
-- เพราะช่วงนั้นยังไม่มีหน้าไหนอ่านตารางนี้ ข้อมูลจริงทั้งหมดยังอยู่ที่ `sc_opex` เหมือนเดิม
-- และ 0024 ไม่ได้แตะ `sc_opex` เลยแม้แต่แถวเดียว
--
-- ⚠️ ถ้าไปถึงขั้นที่ 4 แล้ว (หน้าเว็บอ่านจาก sc_expense_entries) **ห้ามรันไฟล์นี้**
-- จนกว่าจะสลับการอ่านกลับไปที่ sc_opex ก่อน ไม่งั้นหน้าค่าใช้จ่ายจะพังทั้งหน้า
--
-- ⚠️ ข้อมูลที่ backfill ไว้ในตารางนี้จะหายทั้งหมด — แต่ backfill ใหม่ได้เสมอจาก `sc_opex`
-- ซึ่งยังเป็นแหล่งข้อมูลจริงอยู่ตลอดช่วงเปลี่ยนผ่าน

drop trigger if exists sc_expense_entries_touch on public.sc_expense_entries;
drop table if exists public.sc_expense_entries;
drop table if exists public.sc_expense_categories;

-- ไม่ drop public.sc_touch_updated_at() ทิ้ง เผื่อมี trigger อื่นเริ่มใช้ไปแล้ว
-- ถ้าแน่ใจว่าไม่มีใครใช้: drop function if exists public.sc_touch_updated_at();
