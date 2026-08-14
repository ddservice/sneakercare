-- ตั้ง cron ให้เรียก Edge Function low-stock-alert ทุก 30 นาที
-- ใช้ pg_net ยิง HTTP POST ไปที่ Edge Function โดยดึง service_role key จาก Vault ตอนรันจริง
-- (ค่า key จริงถูกเก็บใน supabase.vault ผ่าน `select vault.create_secret(...)` แบบ ad-hoc ไม่ commit ลง
-- git — ไฟล์นี้จึงไม่มี secret อยู่เลย ปลอดภัยที่จะเก็บใน version control)

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'low-stock-alert-30min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://tecrcoienazmtbynuqpg.supabase.co/functions/v1/low-stock-alert',
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
