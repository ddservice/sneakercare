-- ════════════════════════════════════════════════════════════════════════
--  0040_sc_audit_request_context.sql
--  เก็บบริบทมาตรฐานของ audit ฝั่งแอป: IP, User-Agent, เบราว์เซอร์, อุปกรณ์, หน้า
--  (append-only — เพิ่มคอลัมน์อย่างเดียว ไม่ UPDATE/DELETE แถวเดิม ตามกฎข้อ 1)
-- ════════════════════════════════════════════════════════════════════════

alter table public.sc_audit_logs add column if not exists ip_address text;
alter table public.sc_audit_logs add column if not exists user_agent text;
alter table public.sc_audit_logs add column if not exists browser text;
alter table public.sc_audit_logs add column if not exists device text;
alter table public.sc_audit_logs add column if not exists page_path text;

comment on column public.sc_audit_logs.ip_address is
  'IP ของผู้เรียก (X-Forwarded-For / CF-Connecting-IP) ณ ตอนเขียน log';
comment on column public.sc_audit_logs.user_agent is
  'User-Agent ดิบของเบราว์เซอร์ ตัดยาวไม่เกินที่แอปส่งมา';
comment on column public.sc_audit_logs.browser is
  'ชื่อเบราว์เซอร์ที่แยกจาก User-Agent (Chrome/Safari/…)';
comment on column public.sc_audit_logs.device is
  'ชนิดอุปกรณ์ที่แยกจาก User-Agent (Windows/iPhone/…)';
comment on column public.sc_audit_logs.page_path is
  'path ของหน้าในแอปที่เกิดการกระทำ (จาก Referer)';

create index if not exists idx_sc_audit_logs_ip
  on public.sc_audit_logs (ip_address, created_at desc);
