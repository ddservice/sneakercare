-- ════════════════════════════════════════════════════════════════════════
--  0016_fix_security_definer_views.sql
--  🔴 วิกฤต: VIEW ที่เป็น SECURITY DEFINER ข้าม RLS ทำให้ข้อมูลลับหลุดสาธารณะ
-- ════════════════════════════════════════════════════════════════════════
--
-- พบจาก Supabase Security Advisor (2026-09-06) แล้วยืนยันด้วยการยิง REST API จริงด้วย
-- publishable key ที่ฝังอยู่ในหน้าเว็บ — **ไม่ต้องล็อกอินเลย**:
--
--   GET /rest/v1/integration_secrets
--   → [{"key":"telegram_bot_token","value":"8875441249:AAG…"}]     ← Bot Token หลุดทั้งดุ้น
--   GET /rest/v1/item_stock       → avg_unit_cost ของทุกรายการ      ← ข้อมูลต้นทุน (ผิดกฎข้อ 5)
--   GET /rest/v1/stock_transactions → unit_cost ทุกรายการเคลื่อนไหว  ← ข้อมูลต้นทุน
--   GET /rest/v1/audit_logs       → ledger คลังสินค้าทั้งหมด
--   GET /rest/v1/branches         → telegram_chat_id ของกลุ่มพนักงาน
--   GET /rest/v1/items, /suppliers → แคตตาล็อกและรายชื่อซัพพลายเออร์
--
-- ── ทำไม migration 0014/0015 ปิดไม่ได้ ─────────────────────────────────
-- 0014/0015 แก้ RLS policy ของ "ตาราง" แต่ของที่รั่วคือ "VIEW" ที่ชี้ไปตารางเหล่านั้น
-- (`items` → `inv_items`, `item_stock` → `inv_item_stock`, ... สร้างโดย
--  scripts/apply-aliases-and-unified-schema.sql)
--
-- VIEW ใน Postgres ทำงานด้วยสิทธิ์ของ **เจ้าของ view** เป็นค่าเริ่มต้น (SECURITY DEFINER)
-- เจ้าของคือ postgres ซึ่งมี BYPASSRLS → **RLS ของตารางข้างใต้ไม่ถูกบังคับเลย**
-- ยิ่ง 0014/0015 ปิดตารางแน่นแค่ไหน ก็ไม่มีผล ตราบใดที่ยังเข้าทาง view ได้
--
-- ตั้งแต่ Postgres 15 มี `security_invoker` ที่ทำให้ view ใช้สิทธิ์ของ "คนเรียก" แทน
-- ซึ่งเป็นพฤติกรรมที่ควรเป็นตั้งแต่แรก — view กลุ่ม inv_v_* บางตัวตั้งไว้ถูกแล้ว (true)
-- แต่ view alias ที่สร้างทีหลัง 12 ตัวยังเป็น off อยู่ทั้งหมด
--
-- ⚠️⚠️ **ต้อง rotate Telegram Bot Token ทันทีหลังรัน migration นี้**
-- token ถูกเปิดให้อ่านสาธารณะมานานเท่าไหร่ไม่มีทางรู้ ต้องถือว่าหลุดแล้ว 100%
-- ใครถือ token + chat_id (ที่หลุดคู่กัน) สามารถส่งข้อความปลอมเข้ากลุ่มพนักงานได้
-- วิธี rotate: Telegram → @BotFather → /revoke → เอา token ใหม่มาใส่ที่หน้า /settings

-- ── 1. ทำให้ VIEW ทั้งหมดเคารพ RLS ของคนเรียก ────────────────────────────
do $$
declare
  v record;
begin
  for v in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
      and coalesce(
            (select option_value from pg_options_to_table(c.reloptions)
             where option_name = 'security_invoker'), 'off') not in ('true', 'on')
  loop
    execute format('alter view public.%I set (security_invoker = on)', v.relname);
    raise notice '0016: เปิด security_invoker ให้ view %', v.relname;
  end loop;
end $$;

-- ── 2. เปิด RLS ให้ตารางที่ยังไม่ได้เปิด ─────────────────────────────────
-- 4 ตารางนี้มาจาก migration 0008 (โมดูล POS รุ่นแรกที่ยังไม่ได้ใช้จริง) — Security Advisor
-- ขึ้น "RLS Disabled in Public" ให้ทั้งหมด ตอนนี้ services เปิดให้อ่านสาธารณะอยู่จริง
do $$
declare
  t text;
begin
  foreach t in array array['services', 'service_orders', 'service_order_items', 'expenses'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then
        execute format(
          'create policy %I on public.%I to authenticated using (true) with check (true)',
          t || '_authenticated_all', t
        );
      end if;
    end if;
  end loop;
end $$;

-- ── 3. ถอนสิทธิ์ anon ออกจากทุกตาราง/view ของข้อมูลจริง (ด่านที่สอง) ────
-- RLS + security_invoker ไม่ควรเป็นด่านเดียว: รอบนี้พลาดเพราะ view ตัวเดียวเปิดทะลุทุกอย่าง
-- ถ้า anon ไม่มีสิทธิ์แตะตั้งแต่ระดับ GRANT ความผิดพลาดแบบนี้จะไม่กลายเป็นข้อมูลหลุดอีก
--
-- ปลอดภัยเพราะ: (1) ไม่มีไฟล์ใดในแอป import lib/supabase/client.ts เลย ทุก query ผ่าน
-- ฝั่งเซิร์ฟเวอร์ด้วย session ผู้ใช้ (authenticated) หรือ service_role (bypassrls)
-- (2) ระบบเดิมบน Google Apps Script พิสูจน์แล้วว่าไม่ได้ใช้ anon (ดูหมายเหตุใน 0015)
-- (3) หน้า /login ทำงานผ่าน Supabase Auth (`/auth/v1/*`) ซึ่งไม่เกี่ยวกับ GRANT ของตาราง
do $$
declare
  o record;
begin
  for o in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'v')
      and c.relname not like 'pg_%'
  loop
    execute format('revoke all on public.%I from anon', o.relname);
  end loop;
end $$;
