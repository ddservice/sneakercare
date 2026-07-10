-- ตั้ง cron ให้เรียก Edge Function inv-low-stock-alert ทุก 30 นาที
-- ใช้ pg_net ยิง HTTP POST โดยดึง service_role key จาก Vault ตอนรันจริง (เก็บผ่าน
-- `select vault.create_secret(...)` แบบ ad-hoc ไม่ commit ลง git — ไฟล์นี้ไม่มี secret อยู่เลย)

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'inv-low-stock-alert-30min',
  '*/30 * * * *',
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
