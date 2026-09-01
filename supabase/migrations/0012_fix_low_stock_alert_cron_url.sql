-- ════════════════════════════════════════════════════════════════════════
--  0012_fix_low_stock_alert_cron_url.sql
--  แก้ URL ของ pg_cron job ที่เรียก Edge Function low-stock-alert
-- ════════════════════════════════════════════════════════════════════════
--
-- ⚠️ ยังไม่ apply — และก่อนรันไฟล์นี้ต้อง deploy Edge Function low-stock-alert
--    ไปที่ project SneakerCareDB (ref mdlxogfkpwejnqpzhmoy) ก่อน ไม่งั้น cron
--    จะยิงไปหา URL ที่ยังไม่มีฟังก์ชันรออยู่ (จะได้ 404 เหมือนเดิม แค่คนละสาเหตุ)
--    คำสั่ง: supabase functions deploy low-stock-alert --project-ref mdlxogfkpwejnqpzhmoy
--
-- สาเหตุ: migration 0002_schedule_low_stock_alert.sql (apply ไปแล้ว ห้ามแก้ไฟล์นั้น)
-- ตั้ง cron ให้ยิงไปที่ https://tecrcoienazmtbynuqpg.supabase.co/... ซึ่งเป็นโปรเจกต์
-- Supabase ที่ตอนนี้ "ไม่มีอยู่จริงแล้ว" (ยืนยันด้วย `supabase projects list` — บัญชีนี้มี
-- โปรเจกต์เดียวคือ SneakerCareDB เท่านั้น และ DNS ของโดเมนนั้น resolve ไม่ได้แล้ว)
--
-- ผลคือ pg_cron ยิง HTTP POST ไปยัง host ที่ไม่มีอยู่ทุก 30 นาทีมาโดยตลอด แล้วเงียบ
-- ล้มเหลวไปเรื่อยๆ — ตรวจพบว่า inv_notification_log ไม่มีแถวใหม่เข้ามาเลยตั้งแต่
-- 2026-08-27 (5 วันก่อนพบปัญหานี้ในวันที่ 2026-09-01) แปลว่าแจ้งเตือนสต๊อกต่ำผ่าน
-- Telegram หยุดทำงานเงียบๆ มา 5 วัน โดยไม่มีใครรู้ — เข้าข่ายเดียวกับปัญหา audit log
-- ที่เจอในวันเดียวกัน (ระบบล้มเหลวแบบเงียบ ไม่มี error ที่ใครเห็น)

-- ต้อง unschedule ของเดิมก่อน ไม่งั้น cron.schedule() ด้วยชื่อเดิมจะแก้ command ของ job
-- เดิมในที่ (upsert อยู่แล้วโดยพฤติกรรมของ pg_cron) แต่เขียนแบบ unschedule/schedule
-- ให้เห็นชัดเจนว่าเจตนาคือ "แทนที่ job เดิมทั้งก้อน" ไม่ใช่แก้บางส่วน
select cron.unschedule('low-stock-alert-30min')
where exists (select 1 from cron.job where jobname = 'low-stock-alert-30min');

select cron.schedule(
  'low-stock-alert-30min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://mdlxogfkpwejnqpzhmoy.supabase.co/functions/v1/low-stock-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ตรวจหลังรัน: ต้องเห็น job เดียวชื่อ low-stock-alert-30min ที่ url ใหม่
--   select jobname, schedule, command from cron.job where jobname = 'low-stock-alert-30min';
--
-- ถ้า vault ไม่มี secret ชื่อ 'service_role_key' (เช็คได้จาก
--   select name from vault.decrypted_secrets where name = 'service_role_key';
-- ถ้าไม่มีแถว ต้องสร้างก่อนด้วย (รันแยก ไม่ commit ค่า key ลง git):
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
