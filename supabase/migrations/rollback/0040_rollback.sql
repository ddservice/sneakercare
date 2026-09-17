-- rollback 0040: เอาคอลัมน์บริบท request ออก (ไม่แตะแถว log เดิม)

drop index if exists public.idx_sc_audit_logs_ip;

alter table public.sc_audit_logs drop column if exists ip_address;
alter table public.sc_audit_logs drop column if exists user_agent;
alter table public.sc_audit_logs drop column if exists browser;
alter table public.sc_audit_logs drop column if exists device;
alter table public.sc_audit_logs drop column if exists page_path;
