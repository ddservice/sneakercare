-- ════════════════════════════════════════════════════════════════════════
--  0011_sc_audit_logs_and_indexes.sql
--  (1) ตาราง audit trail ระดับแอปสำหรับฝั่งการเงิน/ยอดขาย (sc_*)
--  (2) index ที่ขาดบนตาราง sc_* ที่โตขึ้นทุกวัน
-- ════════════════════════════════════════════════════════════════════════
--
-- ⚠️ migration นี้ยังไม่ถูก apply — ต้องเปิด Supabase SQL Editor ของ project
--    SneakerCareDB (ref mdlxogfkpwejnqpzhmoy) แล้ววางทั้งไฟล์นี้รันหนึ่งครั้ง
--    ก่อนหน้านั้นหน้า /admin/audit จะขึ้นแถบเตือนสีเหลืองบอกไว้ให้
--
-- ทำไมต้องมีตารางใหม่ ไม่ใช้ audit_logs เดิม:
--   `audit_logs` ในฐานข้อมูลจริงไม่ใช่ตาราง แต่เป็น VIEW ที่ชี้ไป `inv_audit_logs`
--   (สร้างโดย scripts/apply-aliases-and-unified-schema.sql) และแถวในนั้นถูกเขียนโดย
--   DB trigger ของฝั่งคลังสินค้าเท่านั้น ตามกฎข้อ 1 ใน CLAUDE.md
--   ("การเขียน log เกิดจาก DB trigger เท่านั้น")
--
--   โค้ดแอปฝั่งการเงินต้องบันทึกเหตุการณ์ที่ไม่มี trigger รองรับ เช่น "แอดมินลบยอดขาย
--   รายวันของวันที่ X" ถ้าไปเขียนลง view เดิมจะเป็นการปนเปื้อน ledger ของคลังสินค้า
--   และผิดกฎข้อ 1 — จึงแยกตารางนี้ออกมาโดยเฉพาะ
--
-- ⚠️ ก่อนหน้า migration นี้ lib/audit.ts พยายาม insert ลง `audit_logs` ด้วยคอลัมน์
--    (entity, actor_name, detail, created_at) ซึ่งไม่มีอยู่จริง ทุก insert จึงได้ 400
--    และถูก catch ทิ้งเงียบๆ = ระบบ audit ไม่เคยบันทึกอะไรเลยตั้งแต่ commit e3f025d

-- ── 1. ตาราง audit trail ระดับแอป ────────────────────────────────────────
create table if not exists sc_audit_logs (
  id          bigint generated always as identity primary key,
  action      text not null,
  entity      text not null,
  entity_id   text,
  actor_id    uuid,
  actor_name  text not null default 'ระบบ',
  detail      jsonb,
  created_at  timestamptz not null default now(),

  constraint chk_sc_audit_action check (
    action in ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'IMPORT', 'EXPORT')
  )
);

comment on table sc_audit_logs is
  'Append-only audit trail ของการกระทำระดับแอป (การเงิน/ยอดขาย/เงินเดือน) เขียนผ่าน lib/audit.ts ด้วย service_role เท่านั้น — ห้าม UPDATE/DELETE (มี trigger กันไว้)';

-- ไม่ตั้ง CHECK บน entity โดยเจตนา: logAudit() กลืน error ทิ้งเพื่อไม่ให้การลบข้อมูลของผู้ใช้พัง
-- ถ้าเพิ่ม entity ใหม่ในโค้ดแล้วลืมแก้ CHECK จะกลายเป็น log หายเงียบๆ ซึ่งอันตรายกว่า
-- ค่าที่สะกดผิดหลุดเข้ามาหนึ่งค่า

-- ── 2. บังคับ append-only ที่ระดับฐานข้อมูล ──────────────────────────────
-- ใช้ trigger ไม่ใช่แค่ REVOKE เพราะ service_role (ที่แอปใช้เขียน) ข้าม grant ได้
create or replace function fn_sc_audit_logs_block_mutation() returns trigger as $$
begin
  raise exception 'sc_audit_logs is append-only — % is not allowed on this table', tg_op
    using errcode = '42501';
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_sc_audit_logs_no_update on sc_audit_logs;
create trigger trg_sc_audit_logs_no_update
  before update on sc_audit_logs
  for each row execute function fn_sc_audit_logs_block_mutation();

drop trigger if exists trg_sc_audit_logs_no_delete on sc_audit_logs;
create trigger trg_sc_audit_logs_no_delete
  before delete on sc_audit_logs
  for each row execute function fn_sc_audit_logs_block_mutation();

-- row-level trigger ไม่ดัก TRUNCATE จึงต้องมี statement-level อีกตัว
-- ไม่งั้น "ล้าง log ทิ้งทั้งตาราง" ยังทำได้อยู่ ซึ่งเลวร้ายกว่าลบทีละแถวเสียอีก
drop trigger if exists trg_sc_audit_logs_no_truncate on sc_audit_logs;
create trigger trg_sc_audit_logs_no_truncate
  before truncate on sc_audit_logs
  execute function fn_sc_audit_logs_block_mutation();

-- ── 3. RLS: อ่านได้เฉพาะ admin, เขียนได้เฉพาะ service_role ───────────────
-- ใช้ SECURITY DEFINER ห่อการอ่าน profiles ไว้ เพื่อไม่ให้ policy ของ sc_audit_logs
-- ไปติด RLS ของตาราง profiles เองจนอ่านไม่ออกและกลายเป็น "ไม่เห็น log เลย"
create or replace function fn_sc_is_admin() returns boolean as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role::text = 'admin'
  );
$$ language sql stable security definer set search_path = public, pg_temp;

alter table sc_audit_logs enable row level security;

revoke insert, update, delete on sc_audit_logs from authenticated, anon;

drop policy if exists p_sc_audit_logs_read_admin on sc_audit_logs;
create policy p_sc_audit_logs_read_admin on sc_audit_logs
  for select to authenticated
  using (fn_sc_is_admin());

-- ── 4. Index ของ audit trail ─────────────────────────────────────────────
create index if not exists idx_sc_audit_logs_created_at on sc_audit_logs (created_at desc);
create index if not exists idx_sc_audit_logs_entity     on sc_audit_logs (entity, created_at desc);
create index if not exists idx_sc_audit_logs_action     on sc_audit_logs (action, created_at desc);

-- ── 5. Index ที่ขาดบนตาราง sc_* (ทุกหน้าเรียงตามวันที่ทั้งหมด) ───────────
-- sc_sales."date"       : ทุกหน้า POS/รายงาน/แดชบอร์ด order by date desc
--                         (ใส่ double quote เพราะ date เป็นคำสงวนชนิดข้อมูลของ Postgres)
-- sc_payments.sale_date : ใช้ join ยอดค้างชำระกลับไปที่ sc_sales
-- sc_opex.month         : หน้า /expenses กรองด้วย month ('MM/YYYY') ทุกครั้ง
create index if not exists idx_sc_sales_date         on sc_sales ("date" desc);
create index if not exists idx_sc_payments_sale_date on sc_payments (sale_date);
create index if not exists idx_sc_opex_month         on sc_opex (month);
