-- ═══════════════════════════════════════════════════════════════════════════
-- 0025 — เพิ่ม `legacy_ref` ให้ sc_expense_entries (เตรียม backfill ขั้นที่ 3)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ทำไม: `legacy_opex_id` (bigint) จับคู่ได้แค่ "หนึ่งแถว sc_opex ต่อหนึ่งค่าใช้จ่าย" ซึ่งพอ
-- สำหรับรายการที่กรอกผ่านฟอร์ม แต่ **ไม่พอสำหรับรายจ่ายเบ็ดเตล็ด**: ทั้งเดือนถูกยัดเป็น
-- JSON array ก้อนเดียวในแถว `key='misc_items_json'` แถวเดียว ⇒ ค่าใช้จ่าย N รายการ
-- ต้องชี้กลับไปที่ sc_opex แถวเดียวกันหมด ซึ่งชน unique index ของ `legacy_opex_id`
--
-- แก้ด้วยการเพิ่มคีย์อ้างอิงแบบข้อความที่รองรับทั้งสองแบบ:
--   • แถวปกติ        → `"<opexId>"`                เช่น "2087"
--   • รายการย่อยใน JSON → `"<opexId>-misc-<index>"`  เช่น "2003-misc-4"
-- รูปแบบหลังเป็นตัวเดียวกับ id สังเคราะห์ที่หน้า /expenses ใช้อยู่แล้ว จึงตามรอยกันได้ตรงๆ
--
-- ⚠️ ทำไมต้องมี unique index: สคริปต์ backfill จะถูกรันซ้ำแน่นอน (dry-run → จริง → ตรวจ →
-- รันซ้ำหลังแก้) ถ้าไม่มีตัวกันที่ระดับฐานข้อมูล การรันซ้ำครั้งเดียวจะทำให้ค่าใช้จ่ายทั้งเดือน
-- ถูกนับสองรอบเงียบๆ — ซึ่งเป็นบั๊กแบบเดียวกับที่ระบบนี้เจอมาแล้วหลายครั้ง
--
-- additive ล้วน · ไม่แตะ `sc_opex` · rollback: rollback/0025_rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.sc_expense_entries
  add column if not exists legacy_ref text;

-- เติมค่าให้แถวที่มีอยู่แล้ว (แถวจาก dual-write ที่มีแต่ legacy_opex_id)
update public.sc_expense_entries
   set legacy_ref = legacy_opex_id::text
 where legacy_ref is null
   and legacy_opex_id is not null;

create unique index if not exists sc_expense_entries_legacy_ref_uidx
  on public.sc_expense_entries (legacy_ref)
  where legacy_ref is not null;

comment on column public.sc_expense_entries.legacy_ref is
  'คีย์อ้างอิงกลับไปยัง sc_opex — "<id>" สำหรับแถวปกติ หรือ "<id>-misc-<index>" สำหรับ '
  'รายการย่อยใน misc_items_json · unique เพื่อกันสคริปต์ backfill รันซ้ำแล้วนับเงินสองรอบ';

-- ── เติม legacy_ref ให้อัตโนมัติ ───────────────────────────────────────────
--
-- ทำไมเป็น trigger ไม่ใช่ให้โค้ดฝั่งแอปส่งมา: ถ้าพึ่งโค้ด วันหนึ่งจะมีคนเขียน insert
-- ที่ลืมใส่ `legacy_ref` แล้วแถวนั้นจะหลุดจากการตรวจซ้ำของ unique index ไปเงียบๆ
-- (บทเรียนซ้ำๆ ของโปรเจกต์นี้: กติกาที่บังคับได้ที่ฐานข้อมูล อย่าปล่อยให้เป็นหน้าที่ของโค้ด)
create or replace function public.sc_expense_entries_fill_legacy_ref()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp   -- ตามบทเรียน migration 0019
as $$
begin
  if new.legacy_ref is null and new.legacy_opex_id is not null then
    new.legacy_ref := new.legacy_opex_id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists sc_expense_entries_fill_ref on public.sc_expense_entries;
create trigger sc_expense_entries_fill_ref
  before insert or update on public.sc_expense_entries
  for each row execute function public.sc_expense_entries_fill_legacy_ref();
