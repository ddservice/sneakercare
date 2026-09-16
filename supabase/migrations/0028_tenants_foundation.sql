-- ════════════════════════════════════════════════════════════════════════
--  0028_tenants_foundation.sql
--  เฟส 1 ของการรองรับหลายนิติบุคคลบนฐานข้อมูลเดียว (multi-tenant)
-- ════════════════════════════════════════════════════════════════════════
--
-- บริบท (2026-09-16): เจ้าของจะเปิดให้ธุรกิจอื่น (สปากระเป๋า/สปารองเท้า — **คนละนิติบุคคล**
-- ไม่แชร์ลูกค้ากัน) ใช้ระบบนี้ร่วมกัน โดยห้ามเห็นข้อมูลข้ามกันเด็ดขาด
--
-- ⚠️ เหตุผลที่ห้ามใช้ `branch_id` เดิมเป็นเส้นแบ่งนิติบุคคล: `role='admin'` + `branch_id=null`
-- แปลว่า "เห็นทุกสาขา" อยู่แล้วโดยตั้งใจ (กฎข้อ 11/12) ถ้าใช้ branch_id กันสองธุรกิจ เจ้าของ
-- ธุรกิจแรก (admin, branch_id=null) จะยังเห็นข้อมูลธุรกิจสองอยู่ดี ตรงข้ามกับที่ต้องการ
-- จึงต้องมี `tenant_id` เป็นเส้นแบ่งใหม่ที่แยกชั้นจาก branch_id เสมอ (ไม่มีใคร tenant_id เป็น
-- null ได้ แม้แต่ admin) — branch_id ยังใช้แยก "สาขาภายในนิติบุคคลเดียวกัน" ตามเดิม
--
-- ⚠️ migration นี้เป็น **เฟส 1 (โครงพื้นฐาน) เท่านั้น — ยังไม่บังคับใช้จริง**
--   * เพิ่มตาราง `tenants` + คอลัมน์ `tenant_id` ให้ทุกตารางธุรกิจ พร้อม backfill ข้อมูลเดิม
--     ทั้งหมดเป็น tenant #1 (ธุรกิจเดิม) ด้วยค่า DEFAULT ตรงๆ — insert/update ที่มีอยู่ตอนนี้
--     **ไม่ต้องแก้โค้ดแอปสักบรรทัด** ก็ยังทำงานได้เหมือนเดิมทุกประการ
--   * สร้าง `fn_current_tenant()` ไว้เฉยๆ (ยังไม่มี policy ไหนเรียกใช้จริง)
--   * **ยังไม่ได้แก้ RLS policy สักตัว** ⇒ ธุรกิจสองจะยังไม่ถูกกันออกจากข้อมูลธุรกิจแรกจนกว่า
--     จะรัน migration เฟส 2 (แก้ RLS ทุกตารางให้ AND ด้วย `tenant_id = fn_current_tenant()`)
--     **ห้ามเชิญผู้ใช้ธุรกิจสองเข้าระบบก่อนเฟส 2 จะ apply และทดสอบผ่านเด็ดขาด**
--
-- รูปแบบ prod/local ที่ต่างกัน (ตามที่ 0012 เจอมาก่อน): production มีตาราง `inv_*` เป็นตัวจริง
-- แล้ว alias เป็น view ชื่อเปล่า (`items`, `branches`, `item_stock`, `stock_transactions`,
-- `audit_logs`, `suppliers`, `integration_secrets` — ทุกตัว `select * from inv_x` ดูจาก
-- scripts/apply-aliases-and-unified-schema.sql) ส่วน local/CI (สร้างจาก migrations ล้วนๆ)
-- มีแค่ชื่อเปล่าเป็นตารางจริง ไม่มี inv_ เลย
--
-- ⚠️ [แก้ความเข้าใจผิดของตัวเอง — เจอจากเทสต์ 2026-09-16] เดิมคิดว่า view ที่เป็น `select *`
-- จะเห็นคอลัมน์ใหม่ของตารางจริงเองอัตโนมัติ **ผิด** — Postgres ขยาย `*` เป็น "รายชื่อคอลัมน์
-- ตายตัว" ตั้งแต่ตอน `CREATE VIEW` ไม่ใช่ query สดทุกครั้งที่เรียก เติมคอลัมน์ที่ตารางจริงแล้ว
-- view จะยังไม่เห็นจนกว่าจะ `create or replace view` ซ้ำ ⇒ migration นี้ทำให้ทุกครั้งที่เติม
-- tenant_id ให้ตารางกลุ่ม A ที่มี view ชื่อเปล่า alias อยู่ (ดูขั้นตอนที่ 4)

-- ── 1. ตาราง tenants ──────────────────────────────────────────────────────
create table if not exists public.tenants (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,             -- ชื่อที่ใช้แสดงในระบบ (สั้นๆ)
  legal_name   text,                      -- ชื่อนิติบุคคลเต็มตามหนังสือรับรอง
  tax_id       text,                      -- เลขผู้เสียภาษี 13 หลัก
  address      text,
  phone        text,
  promptpay_id text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ใช้ UUID คงที่แทน gen_random_uuid() ให้ migration รันซ้ำได้แบบ idempotent จริง (ไม่สุ่มค่าใหม่
-- ทุกครั้งที่รัน) และให้ migration เฟสถัดๆ ไปอ้างอิง id เดิมนี้ได้แน่นอนโดยไม่ต้อง query หาก่อน
insert into public.tenants (id, name, is_active)
values ('00000000-0000-0000-0000-000000000001'::uuid, 'รวยรับทรัพย์168 / SneakerCare (ธุรกิจเดิม)', true)
on conflict (id) do nothing;

-- ── 2. เพิ่ม tenant_id ให้ profiles ก่อน (fn_current_tenant() ต้องมีคอลัมน์นี้ก่อนถูกเรียกจริง) ──
alter table public.profiles
  add column if not exists tenant_id uuid not null
    default '00000000-0000-0000-0000-000000000001'::uuid
    references public.tenants(id);

create index if not exists idx_profiles_tenant on public.profiles(tenant_id);

-- ── 3. fn_current_tenant() ────────────────────────────────────────────────
-- ยังไม่มี policy ไหนเรียกใช้จนกว่าจะถึงเฟส 2 — สร้างไว้ตอนนี้เพื่อให้เฟส 2 เป็นแค่
-- "แก้ policy" ไม่ต้องมี migration แยกสำหรับตัวฟังก์ชันเอง
--
-- ⚠️ ต้องมาหลังข้อ 2 เสมอ (บทเรียนซ้ำจาก 0012: `sc_get_my_role()` เคยประกาศก่อน
-- `create table sc_users` แล้ว error ทันทีเพราะฟังก์ชัน `language sql` ถูก Postgres ตรวจสอบ
-- คอลัมน์ที่อ้างถึงตั้งแต่ตอน CREATE FUNCTION ไม่ใช่ตอนถูกเรียกใช้จริงแบบ `language plpgsql`)
create or replace function public.fn_current_tenant()
returns uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select tenant_id from public.profiles where id = auth.uid()
$fn$;

comment on function public.fn_current_tenant() is
  'เส้นแบ่งนิติบุคคล — คนละชั้นจาก fn_current_branch()/inv_fn_current_branch() ที่แยกแค่สาขา '
  'ภายในนิติบุคคลเดียวกัน ยังไม่มี RLS policy ตัวไหนเรียกใช้จนกว่าจะถึง migration เฟส 2';

-- ── 4. เพิ่ม tenant_id ให้ตารางธุรกิจที่เหลือ ─────────────────────────────
-- กลุ่ม A: ชื่อตารางต่างกันระหว่าง production (prefix inv_) กับ local/CI (ชื่อเปล่า)
-- กลุ่ม B: ชื่อเดียวกันทั้งสองฝั่ง (ตารางของโมดูลการเงิน/POS ที่ไม่เคยผ่าน alias script)
do $$
declare
  v_tenant_1 constant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_logical  text;
  v_actual   text;
  -- กลุ่ม A: ตรวจ inv_<ชื่อ> ก่อนเสมอ (ของจริงบน production) แล้วค่อย fallback ไปชื่อเปล่า (local/CI)
  group_a constant text[] := array[
    'items', 'branches', 'suppliers', 'integration_secrets',
    'notification_log', 'audit_logs', 'item_stock', 'stock_transactions'
  ];
  -- กลุ่ม B: ชื่อเดียวกันทุกที่ — ครอบทุกตารางของโมดูลการเงิน/ขาย/POS/เงินเดือน
  group_b constant text[] := array[
    'customers', 'services', 'service_orders', 'service_order_items',
    'sc_sales', 'sc_opex', 'sc_opex_history', 'sc_payments', 'sc_employees',
    'sc_expenses', 'sc_payslip_deductions', 'sc_payslips', 'sc_rental_records',
    'sc_expense_entries', 'sc_settings', 'sc_audit_logs'
  ];
begin
  foreach v_logical in array group_a loop
    v_actual := null;
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'inv_' || v_logical) then
      v_actual := 'inv_' || v_logical;
    elsif exists (select 1 from pg_tables where schemaname = 'public' and tablename = v_logical) then
      v_actual := v_logical;
    end if;

    if v_actual is null then
      raise notice '[0028] ข้ามตาราง % — ไม่พบทั้ง inv_% และ % ในฐานข้อมูลนี้', v_logical, v_logical, v_logical;
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists tenant_id uuid not null default %L::uuid references public.tenants(id)',
      v_actual, v_tenant_1
    );
    execute format('create index if not exists %I on public.%I(tenant_id)', 'idx_' || v_actual || '_tenant', v_actual);

    -- ⚠️ บทเรียนจริงจากการเทสต์ (2026-09-16): `create view v as select * from t` ขยาย `*`
    -- เป็น "รายชื่อคอลัมน์ตายตัว" ตั้งแต่ตอนสร้าง view — ไม่ใช่ query สดทุกครั้งที่เรียก
    -- เติมคอลัมน์ใหม่ที่ตารางจริง (`inv_x`) แล้ว **view ที่ alias ไว้ไม่เห็นคอลัมน์ใหม่เอง**
    -- ต้อง `create or replace view` ซ้ำเพื่อให้รายชื่อคอลัมน์อัปเดต — เจอจาก
    -- `scripts/test-migration-0028.mjs` ที่ยิง `select tenant_id from items` ตรงๆ แล้วพัง
    -- (ทำเฉพาะกรณี v_actual มี prefix inv_ เท่านั้น เพราะนั่นแปลว่ามันคือ production-style
    -- ที่มี view ชื่อเปล่าอยู่จริง — ถ้า v_actual = v_logical เปล่าๆ แปลว่าเป็น local/CI
    -- ไม่มี view ให้ refresh อยู่แล้ว, และ `notification_log` ไม่มี view alias ตั้งแต่ต้น
    -- จึงต้องเช็ค pg_views ก่อนเสมอ ไม่ใช่เดาจาก v_actual อย่างเดียว)
    if v_actual = 'inv_' || v_logical
       and exists (select 1 from pg_views where schemaname = 'public' and viewname = v_logical) then
      execute format('create or replace view public.%I as select * from public.%I', v_logical, v_actual);
      -- ⚠️ ต้องตั้ง security_invoker ซ้ำเสมอหลัง create or replace view — ไม่เสี่ยงเดาว่า
      -- Postgres เก็บ reloption เดิมไว้ให้หรือเปล่า (0016 เพิ่งแก้ช่องโหว่ SECURITY DEFINER
      -- View ไปหมาดๆ ถ้าพลาดตรงนี้คือเปิดช่องโหว่เดิมกลับมาโดยไม่มีใครรู้)
      execute format('alter view public.%I set (security_invoker = on)', v_logical);
    end if;
  end loop;

  foreach v_logical in array group_b loop
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = v_logical) then
      raise notice '[0028] ข้ามตาราง % — ไม่พบในฐานข้อมูลนี้ (ปกติถ้ายังไม่ได้ apply migration ที่สร้างตารางนี้)', v_logical;
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists tenant_id uuid not null default %L::uuid references public.tenants(id)',
      v_logical, v_tenant_1
    );
    execute format('create index if not exists %I on public.%I(tenant_id)', 'idx_' || v_logical || '_tenant', v_logical);
  end loop;
end $$;

-- ── 5. ตารางที่ *ตั้งใจไม่แตะ* ในเฟสนี้ (บันทึกเหตุผลไว้กันคนถัดไปงง) ─────────
--   * sc_expense_categories — ลิสต์หมวดค่าใช้จ่ายมาตรฐาน (payroll/utilities/marketing/...)
--     เป็น enum กลางที่ใช้ร่วมกันได้ทุกธุรกิจ ไม่ใช่ข้อมูลเฉพาะของนิติบุคคลใดนิติบุคคลหนึ่ง
--   * app_settings — ตารางตาย ไม่มีโค้ดแอปจุดไหน import ใช้เลย (ตรวจด้วย grep แล้ว)
--   * sc_users — เก็บไว้เพื่อความเข้ากันได้กับระบบเดิม (GAS) เท่านั้น ห้ามใช้ตัดสินสิทธิ์
--     ตามที่ 0023 ระบุไว้แล้ว ไม่เกี่ยวกับการกันข้อมูลข้าม tenant
--   * ext_* (โมดูล SmartAcc บิล/ภาษี — 17 ตาราง) — เลื่อนไปเฟสถัดไปโดยตั้งใจ เพราะธุรกิจ
--     สปากระเป๋า/รองเท้าที่จะเข้าระบบยังไม่ต้องใช้ใบกำกับภาษี/e-Tax ตั้งแต่วันแรก
--     ⚠️ ก่อนเปิดให้ tenant ที่สองใช้หน้า /invoicing หรือ /tax-filing ต้องกลับมาทำ tenant_id
--     ให้ครบก่อน ไม่งั้นเอกสารข้ามนิติบุคคลจะปนกันได้ (ยังไม่มี migration ตัวนี้ ณ วันที่เขียน)
--
-- ── 6. ยังไม่ทำในเฟสนี้ (รอเฟส 2/3 ตามแผน) ────────────────────────────────
--   * ไม่แก้ RLS policy ใดๆ — ทุกตารางยังเข้าถึงได้ตามกฎเดิมทุกประการ (role/branch เท่านั้น)
--   * ไม่ตั้ง trigger ให้ INSERT ใหม่เซ็ต tenant_id จาก fn_current_tenant() อัตโนมัติ — ตอนนี้
--     insert ที่ไม่ระบุ tenant_id จะได้ค่า DEFAULT ของ tenant #1 เสมอ (ปลอดภัยเพราะยังมีแค่
--     tenant เดียวในระบบจริง) เฟส 2 จะถอด DEFAULT นี้ออกแล้วแทนด้วย trigger ที่อ่านจาก session
--   * ไม่แยก sc_settings/integration_secrets ตาม (tenant_id, key) เป็น primary key คู่ — แค่มี
--     คอลัมน์ tenant_id เฉยๆ ก่อน ยังต้องแก้โค้ดแอปให้ query กรองด้วย tenant_id ในเฟส 3
