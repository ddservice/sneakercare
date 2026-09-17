-- ════════════════════════════════════════════════════════════════════════
--  0035_extension_layer_lockdown.sql
--  ปิดช่องโหว่ฉุกเฉิน: extension_layer เพิ่งถูกเปิดให้ REST เข้าถึงได้เป็นครั้งแรก (2026-09-17)
--  แต่ RLS ปิดอยู่ทุกตาราง + anon มี SELECT + authenticated มีสิทธิ์เขียน/ลบเต็มทุกตาราง
-- ════════════════════════════════════════════════════════════════════════
--
-- 🔴 บริบท: schema `extension_layer` (0009_smartacc_extension_layer.sql) ถูกสร้างไว้ตั้งแต่
-- 2026-08-30 พร้อม `GRANT ALL ... TO authenticated` + `GRANT SELECT ... TO anon` มาตั้งแต่ต้น
-- แต่ Supabase project ไม่เคยเปิด schema นี้ให้ PostgREST เข้าถึงได้เลย (Exposed schemas
-- มีแค่ public, graphql_public) ⇒ GRANT พวกนี้ **ไม่มีผลอะไรเลยมาตลอด** เพราะเรียกผ่าน REST
-- ไม่ถึงเลยไม่ว่า credential ไหน (ยืนยันแล้ว: แม้แต่ service_role ก็โดน PGRST106 เหมือนกัน)
--
-- วันนี้เจ้าของเพิ่ง Save ตั้งค่า "Exposed schemas" ให้รวม extension_layer เข้าไปด้วย (เพื่อให้
-- แอปใช้งานโมดูลบิล/ภาษีได้ตามที่ควรจะเป็นมาตั้งแต่แรก) ⇒ GRANT เดิมที่นอนเฉยๆ มาเกือบ 3 สัปดาห์
-- กลับมามีผลจริงทันที **โดยไม่มี RLS มากันเลยสักตาราง** (`relrowsecurity = false` ทั้ง 17 ตาราง
-- ตรวจกับ production จริงแล้ว) — ตรงกับสถานการณ์เดียวกับ SECURITY DEFINER View ที่ 0016 เคยปิด
-- ในฝั่ง public schema ทุกประการ (GRANT ที่ดู "ปลอดภัยเพราะเข้าไม่ถึง" กลับมาเปิดช่องทันทีที่มี
-- ทางเข้าใหม่โผล่ขึ้นมา)
--
-- **ผลกระทบจริงถ้าไม่ปิดทันที:** ตารางว่างอยู่ทั้งหมด (0 แถวทุกตาราง — ตรวจแล้ว) ฝั่งอ่านจึงยังไม่มี
-- ข้อมูลรั่วจริง แต่ฝั่ง **เขียนอันตรายกว่ามาก**: พนักงานคนไหนก็ได้ที่ล็อกอินอยู่ (`authenticated`
-- role ไม่แยก role อะไรเลย) ยิง REST ตรงไปที่ `/rest/v1/ext_documents` (หรือตารางอื่นในชุดนี้)
-- แล้ว INSERT/UPDATE/DELETE/TRUNCATE ได้เลย ข้าม `requireModuleWrite()` ของแอปไปทั้งหมด
--
-- **แก้แบบฉุกเฉินก่อน (ไฟล์นี้):** เปิด RLS ทุกตารางแบบ **0 policy = deny-all สำหรับ
-- authenticated ด้วย** (รูปแบบเดียวกับ `inv_integration_secrets` ที่พิสูจน์แล้วว่าใช้ได้จริง — ดู
-- 0033) เพราะแอปทั้งหมดเข้าตารางกลุ่มนี้ผ่าน `createAdminClient()` (service_role, bypass RLS
-- อยู่แล้ว) เท่านั้น ไม่มีจุดไหนใน repo ใช้ session ของผู้ใช้เข้าตารางกลุ่มนี้ตรงๆ เลย (grep แล้ว)
-- ⇒ ปิดสนิทได้ทันทีโดยแอปไม่พัง แล้ว **revoke สิทธิ์ anon ทั้งหมดออกด้วย** (เหมือน 0016)
--
-- **เฟสถัดไป (migration แยก):** ยังต้องเพิ่ม `tenant_id` ให้ตารางที่แอปใช้จริง (ext_contacts,
-- ext_documents, ext_document_items, ext_billing_references, ext_staged_expenses,
-- ext_numbering_sequences) แล้วค่อยเปลี่ยนจาก deny-all เป็น policy ที่กรอง tenant_id จริง — ไฟล์นี้
-- เป็นแค่ด่านฉุกเฉินปิดรูก่อน ไม่ใช่ทางออกสุดท้าย

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_namespace where nspname = 'extension_layer') then
    raise notice '[0035] ไม่พบ schema extension_layer ในฐานข้อมูลนี้ — ข้ามทั้งไฟล์';
    return;
  end if;

  for t in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'extension_layer' and c.relkind = 'r'
  loop
    execute format('alter table extension_layer.%I enable row level security', t);
    execute format('revoke all on extension_layer.%I from anon', t);
  end loop;
end $$;
