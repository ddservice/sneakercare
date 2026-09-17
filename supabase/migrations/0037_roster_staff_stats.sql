-- ════════════════════════════════════════════════════════════════════════
--  0037_roster_staff_stats.sql
--  แก้ /roster ให้ดึงพนักงานจากฐานข้อมูลจริง (เดิม hardcode ชื่อ 3 คนของ tenant #1
--  ไว้ตรงในโค้ด — เปิดให้ tenant อื่นใช้ /roster ไม่ได้เลย) + บันทึกขาด/ลา/มาสาย/OT รายวัน/
--  จำนวนคู่รองเท้าต่อวัน (ลูกค้า LUXSU ขอมา — ดู CLAUDE.md หัวข้อ "งานที่ขอเพิ่ม")
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'sc_employees') then
    raise notice '[0037] ไม่พบตาราง sc_employees — ข้ามทั้งไฟล์';
    return;
  end if;

  -- ── sc_employees: ค่ากะ/วันหยุดมาตรฐานต่อคน (แทนที่ WEEKLY_SHIFTS ที่ hardcode ชื่อไว้ในโค้ด) ──
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'sc_employees' and column_name = 'default_shift') then
    alter table public.sc_employees add column default_shift text not null default 'morning';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sc_employees_default_shift_check') then
    alter table public.sc_employees
      add constraint sc_employees_default_shift_check check (default_shift in ('morning', 'late'));
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'sc_employees' and column_name = 'default_day_off') then
    alter table public.sc_employees add column default_day_off smallint;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sc_employees_default_day_off_check') then
    alter table public.sc_employees
      add constraint sc_employees_default_day_off_check check (default_day_off is null or default_day_off between 0 and 6);
  end if;

  -- ── สำรองข้อมูลจริงของ tenant #1 ไว้ก่อนเปลี่ยนพฤติกรรม (เชียง หยุดพุธ, เจ หยุดศุกร์,
  -- มิ้ว หยุดอาทิตย์ ตามที่ hardcode ไว้เดิมใน roster-client.tsx) — ไม่งั้นพอ deploy โค้ดใหม่ที่
  -- อ่านจากคอลัมน์นี้ วันหยุดของพนักงานจริงจะหายไปเงียบๆ (default_day_off เป็น null ทุกคน)
  --
  -- ⚠️ [แก้ตัวเอง — เจอตอนตรวจกับ production จริงก่อน apply] ชื่อเล่นเก็บอยู่ในคอลัมน์ `nickname`
  -- แยกต่างหาก ไม่ได้ฝังอยู่ใน `name` แบบที่ roster-client.tsx เขียนไว้ (เช่น name จริงคือ
  -- "นายธีรภัทร ทาแผ" nickname "เชียง" ไม่ใช่ "เชียง (นายธีรภัทร ทาแผ)") ต้อง match ที่ nickname
  update public.sc_employees set default_day_off = 3 where nickname = 'เชียง' and default_day_off is null;
  update public.sc_employees set default_day_off = 0 where nickname = 'มิ้ว' and default_day_off is null;

  -- ⚠️ "เจ" (พนักงานทดลองงาน 350฿/วัน ที่อ้างถึงทั่วทั้งระบบ payroll) ไม่เคยมีแถวใน sc_employees
  -- เลยสักแถว (ตรวจกับ production แล้ว — มีแค่ 3 แถว: มิ้ว/เชียง/ไมโล ไม่มีเจ) เธอถูกจัดการผ่าน
  -- sc_opex free-text key เท่านั้นมาตลอด (fallback path ใน fetchAllExpensesData()) — สร้างแถวให้
  -- เพื่อให้ /roster มีที่เก็บ default_shift/default_day_off ของเธอด้วย เหมือนพนักงานคนอื่น
  -- (ไม่กระทบยอดเงินเดือนเดิม — payroll ยังคำนวณจาก sc_opex เหมือนเดิมทุกประการ ไม่ได้เปลี่ยน
  -- แหล่งข้อมูลเงิน แค่เพิ่ม "ที่อยู่" ให้ค่ากะ/วันหยุดของเธอมีที่เก็บถาวรแทนที่จะ hardcode)
  if not exists (select 1 from public.sc_employees where nickname = 'เจ') then
    insert into public.sc_employees (name, nickname, position, salary, status, default_shift, default_day_off, tenant_id)
    values ('เจ (พนักงานทดลองงาน)', 'เจ', 'ทดลองงาน', 350, 'Active', 'morning', 5, '00000000-0000-0000-0000-000000000001');
  end if;

  -- ── โบนัสต่อคู่รองเท้า (บาท/คู่) — 0 = ปิดใช้งาน ไม่มีผลต่อยอดเงินเดือนเดิมเลย ──
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'sc_employees' and column_name = 'bonus_per_pair') then
    alter table public.sc_employees add column bonus_per_pair numeric not null default 0;
  end if;
end $$;

-- ── บันทึกรายวันต่อพนักงาน: ขาด/ลา/มาสาย + OT รายวัน + จำนวนคู่ที่ทำ ──
create table if not exists public.sc_staff_daily_stats (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id),
  employee_name text not null,
  stat_date date not null,
  attendance_status text not null default 'normal',
  late_minutes int,
  ot_hours numeric,
  pairs_handled int,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sc_staff_daily_stats_attendance_status_check') then
    alter table public.sc_staff_daily_stats
      add constraint sc_staff_daily_stats_attendance_status_check
      check (attendance_status in ('normal', 'absent', 'leave', 'late'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sc_staff_daily_stats_tenant_emp_date_key') then
    alter table public.sc_staff_daily_stats
      add constraint sc_staff_daily_stats_tenant_emp_date_key unique (tenant_id, employee_name, stat_date);
  end if;
end $$;

create index if not exists idx_sc_staff_daily_stats_tenant_date on public.sc_staff_daily_stats (tenant_id, stat_date);

alter table public.sc_staff_daily_stats enable row level security;

drop policy if exists sc_staff_daily_stats_select on public.sc_staff_daily_stats;
create policy sc_staff_daily_stats_select on public.sc_staff_daily_stats for select to authenticated
  using (
    (public.inv_fn_current_role() = 'super_admin')
    or (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any (array['admin', 'co-admin', 'staff']))
  );

drop policy if exists sc_staff_daily_stats_write on public.sc_staff_daily_stats;
create policy sc_staff_daily_stats_write on public.sc_staff_daily_stats for insert to authenticated
  with check (
    (public.inv_fn_current_role() = 'super_admin')
    or (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any (array['admin', 'co-admin']))
  );

drop policy if exists sc_staff_daily_stats_update on public.sc_staff_daily_stats;
create policy sc_staff_daily_stats_update on public.sc_staff_daily_stats for update to authenticated
  using (
    (public.inv_fn_current_role() = 'super_admin')
    or (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any (array['admin', 'co-admin']))
  )
  with check (
    (public.inv_fn_current_role() = 'super_admin')
    or (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any (array['admin', 'co-admin']))
  );

drop policy if exists sc_staff_daily_stats_delete on public.sc_staff_daily_stats;
create policy sc_staff_daily_stats_delete on public.sc_staff_daily_stats for delete to authenticated
  using (
    (public.inv_fn_current_role() = 'super_admin')
    or (tenant_id = public.fn_current_tenant() and public.inv_fn_current_role() = any (array['admin', 'co-admin']))
  );
