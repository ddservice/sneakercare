-- ย้อน 0037 กลับสู่สภาพเดิม (ลบตาราง/คอลัมน์ใหม่ทั้งหมด)
-- ⚠️ ลบ sc_staff_daily_stats ทิ้งถาวร — ข้อมูลขาด/ลา/มาสาย/OT/จำนวนคู่ที่บันทึกไว้จะหายหมด
-- เช็คก่อนว่ามีข้อมูลจริงอยู่หรือยังด้วย `select count(*) from sc_staff_daily_stats`

drop table if exists public.sc_staff_daily_stats;

do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'sc_employees') then
    raise notice '[0037 rollback] ไม่พบตาราง sc_employees — ข้าม';
    return;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'sc_employees' and column_name = 'default_shift') then
    alter table public.sc_employees drop column default_shift;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'sc_employees' and column_name = 'default_day_off') then
    alter table public.sc_employees drop column default_day_off;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'sc_employees' and column_name = 'bonus_per_pair') then
    alter table public.sc_employees drop column bonus_per_pair;
  end if;
end $$;
