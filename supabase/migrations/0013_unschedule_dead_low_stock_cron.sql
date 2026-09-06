-- ════════════════════════════════════════════════════════════════════════
--  0013_unschedule_dead_low_stock_cron.sql
--  ลบ cron 'low-stock-alert-30min' ที่ยิงไปหา Edge Function ที่ไม่มีอยู่แล้ว
-- ════════════════════════════════════════════════════════════════════════
--
-- ที่มา: migration 0002 ตั้ง cron ชื่อ 'low-stock-alert-30min' ให้ยิง Edge Function
-- `low-stock-alert` ทุก 30 นาที ต่อมา (2026-09-01) ฟังก์ชันตัวนั้นถูกลบออกจากโปรเจกต์
-- เพราะเป็นตัวซ้ำที่ไม่เช็ค `alert_muted` — แต่ **ไม่มีใครลบ cron ที่เรียกมัน**
--
-- ผลที่เกิดขึ้นจริง (ตรวจพบ 2026-09-06 จาก `net._http_response` บนฐานข้อมูล production):
--   ยิง HTTP 404 {"code":"NOT_FOUND","message":"Requested function was not found"}
--   วันละ 48 ครั้งติดต่อกันตั้งแต่ 1 ก.ย. โดยไม่มีใครรู้
--
-- ตัวที่แจ้งเตือนสต๊อกต่ำจริงคือ 'inv-low-stock-alert-daily-9am-th' (jobid 3, 9 โมงเช้าไทย
-- เรียก Edge Function `inv-low-stock-alert`) ซึ่งตอบ 200 ปกติทุกวัน — migration นี้ไม่แตะตัวนั้น
--
-- ⚠️ บทเรียนที่ทำให้เรื่องนี้ถูกมองข้ามมาหลายเซสชัน:
--   `cron.job_run_details.status = 'succeeded'` **ไม่ได้แปลว่า HTTP สำเร็จ** — pg_net ทำงาน
--   แบบ async สถานะนั้นบอกแค่ว่า "ยิงคำสั่งออกไปแล้ว" ปลายทางจะตอบ 404/401 ก็ยังขึ้น succeeded
--   เวลาจะสรุปว่า cron ตัวไหนทำงานหรือไม่ ต้องดูตาราง `net._http_response` เสมอ
--
-- รันบน production ด้วยมือไปแล้วเมื่อ 2026-09-06 (`select cron.unschedule(...)`) ไฟล์นี้มีไว้
-- ให้ repo กับของจริงตรงกัน และกันไม่ให้ฐานข้อมูลที่สร้างใหม่จาก migrations ได้ job ตัวนี้กลับมา
-- (0002 จะสร้างมันขึ้นมาก่อน แล้ว 0013 ลบทิ้งทีหลัง — ปล่อยให้ 0002 คงเดิมตามกฎ "ห้ามแก้
--  migration ที่ apply แล้ว")

do $$
begin
  -- ฐานข้อมูลที่ไม่มี pg_cron (local dev / PGlite / CI บางแบบ) ให้ข้ามไปเงียบๆ
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise notice '0013: ข้ามไป — ฐานข้อมูลนี้ไม่มี schema cron (ไม่ได้ติดตั้ง pg_cron)';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'low-stock-alert-30min') then
    perform cron.unschedule('low-stock-alert-30min');
    raise notice '0013: ลบ cron low-stock-alert-30min แล้ว';
  else
    raise notice '0013: ไม่มี cron low-stock-alert-30min อยู่แล้ว ไม่ต้องทำอะไร';
  end if;
end $$;
