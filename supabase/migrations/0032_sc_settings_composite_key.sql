-- ════════════════════════════════════════════════════════════════════════
--  0032_sc_settings_composite_key.sql
--  แก้ sc_settings ให้รองรับหลาย tenant จริง (ตอนนี้ key เดียวใช้ได้แค่ค่าเดียวทั้งระบบ)
-- ════════════════════════════════════════════════════════════════════════
--
-- เจอระหว่างเขียนเทสต์ 0031: `sc_settings.key` เป็น PRIMARY KEY เดี่ยว ⇒ สอง tenant
-- ยังตั้งค่า key ชื่อเดียวกัน (เช่น "name") พร้อมกันไม่ได้จริง แม้จะมี tenant_id คนละอันแล้ว
-- (0028 เพิ่มคอลัมน์ tenant_id ให้ตารางนี้ไปแล้ว แต่ PK ยังเป็น key เดี่ยว ไม่ใช่ composite)
--
-- ⚠️ ตรวจ app code (app/actions/shop-settings.ts, app/actions/smartacc-documents.ts) แล้วพบว่า
-- key ที่ใช้จริงมี 2 ประเภทปนกันอยู่ในตารางเดียว — สำคัญมากต้องแยกให้ถูก ไม่งั้น backup heartbeat
-- (ตั้งค่าระดับ VPS ไม่ใช่ระดับร้าน) จะถูกเข้าใจผิดว่าเป็นข้อมูลของ tenant ใดตัวหนึ่งไปด้วย:
--   1. ต่อ tenant จริง: name, phone, address, tax_id, logo_url, promptpay_id,
--      dbd_company_registry (สมุดที่อยู่ลูกค้าที่เคยออกเอกสารด้วยกัน — ดู CLAUDE.md หัวข้อ SmartAcc ข้อ 4)
--   2. ระดับแพลตฟอร์ม ไม่ผูกกับ tenant ไหนเลย: backup_success_notify (สวิตช์แจ้งเตือน backup
--      รายวันของ VPS ทั้งเครื่อง — ควบคุมโดยผู้ดูแลแพลตฟอร์ม ไม่ใช่เจ้าของร้านแต่ละราย)
--
-- แก้โดยให้ tenant_id เป็น NULL ได้สำหรับ key ระดับแพลตฟอร์ม แล้วใช้
-- UNIQUE NULLS NOT DISTINCT (Postgres 15+) แทน PRIMARY KEY เดิม — กัน (NULL, 'backup_success_notify')
-- ซ้ำกันได้หลายแถวแบบที่ UNIQUE ธรรมดาจะยอมให้เกิดขึ้น (NULL ปกติถือว่าไม่เท่ากับ NULL อื่นเสมอ)

do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'sc_settings') then
    raise notice '[0032] ไม่พบตาราง sc_settings ในฐานข้อมูลนี้ — ข้ามทั้งไฟล์';
    return;
  end if;

  -- ── 1. ย้าย key ระดับแพลตฟอร์มกลับไปเป็น tenant_id = null (0028 ใส่ default tenant #1
  --    ให้ทุกแถวไปแล้วรวมถึงแถวนี้ด้วย ซึ่งผิด เพราะไม่ใช่ข้อมูลของ tenant ไหนทั้งนั้น) ──
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'sc_settings' and column_name = 'tenant_id') then
    alter table public.sc_settings alter column tenant_id drop not null;
    update public.sc_settings set tenant_id = null where key = 'backup_success_notify';
  end if;

  -- ── 2. เปลี่ยนจาก PK เดี่ยว (key) เป็น UNIQUE (tenant_id, key) NULLS NOT DISTINCT ──
  if exists (select 1 from pg_constraint where conname = 'sc_settings_pkey') then
    alter table public.sc_settings drop constraint sc_settings_pkey;
  end if;
  -- key ยังต้องไม่เป็น null เสมอ (แค่ไม่ใช่ PK เดี่ยวแล้ว)
  alter table public.sc_settings alter column key set not null;

  if not exists (select 1 from pg_constraint where conname = 'sc_settings_tenant_key_key') then
    alter table public.sc_settings
      add constraint sc_settings_tenant_key_key unique nulls not distinct (tenant_id, key);
  end if;
end $$;
