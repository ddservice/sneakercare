-- เปลี่ยน cron แจ้งเตือนสต๊อกต่ำจากทุก 30 นาที เป็นวันละครั้งตอน 9 โมงเช้า (เวลาไทย) ตามที่ user ขอ
-- Postgres/pg_cron ของ Supabase ใช้ UTC เป็นค่าเริ่มต้นเสมอ — 9:00 เวลาไทย (UTC+7) = 02:00 UTC
--
-- เหตุผลที่ทำแบบนี้แทนที่จะปล่อยทุก 30 นาทีไว้: edge function เดิมมี logic กันแจ้งซ้ำอยู่แล้ว (เช็ค
-- inv_notification_log ว่าแจ้งไปแล้ววันนี้หรือยัง) ทำให้จริงๆ ก็ส่งได้อย่างมาก 1 ครั้ง/วัน/สาขาอยู่แล้ว
-- แต่เวลาที่ส่งจริงคือ "รอบ 30 นาทีแรกหลังเที่ยงคืน UTC (07:00 เวลาไทย) ที่เจอของใกล้หมด" ซึ่งไม่แน่นอน
-- และเร็วกว่าเวลาทำงานจริงของร้าน — เปลี่ยนเป็นยิงครั้งเดียวตรงเวลาที่ต้องการเลยตรงกว่า ไม่ต้องพึ่ง
-- dedup logic ในการควบคุมเวลา (ยังเก็บ dedup ไว้ในโค้ด edge function เป็น safety net เผื่อ cron ยิงซ้ำ)
--
-- ข้อควรรู้: ถ้าอยากให้จับสต๊อกที่เพิ่งตกลงต่ำระหว่างวันได้เร็วขึ้น (ไม่ต้องรอถึง 9 โมงของวันถัดไป) ต้องกลับไป
-- ใช้ความถี่สูงกว่านี้แทน — คุยกับทีมงานก่อนว่าจำเป็นแค่ไหน เพราะแลกกับข้อความ Telegram ที่ (อาจ) เยอะขึ้น

select cron.unschedule('inv-low-stock-alert-30min');

select cron.schedule(
  'inv-low-stock-alert-daily-9am-th',
  '0 2 * * *',
  $$
  select net.http_post(
    url := 'https://mdlxogfkpwejnqpzhmoy.supabase.co/functions/v1/inv-low-stock-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'inv_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
