-- ════════════════════════════════════════════════════════════════════════
--  0021_restore_staff_safe_views.sql
--  คืนสภาพ "staff-safe view" ให้พนักงานเห็นสต๊อกได้โดยไม่เห็นต้นทุน (กฎข้อ 5)
-- ════════════════════════════════════════════════════════════════════════
--
-- ที่มา: migration 0016 ตั้ง `security_invoker = on` ให้ **ทุก** view ใน public เพื่อปิดช่องโหว่
-- SECURITY DEFINER view ที่ทำให้ Bot Token และข้อมูลต้นทุนหลุดสาธารณะ — ถูกต้องสำหรับ view
-- ที่เป็น "alias เปล่าๆ" (`items`, `item_stock`, `audit_logs`, ...) ซึ่งไม่มีตรรกะสิทธิ์ในตัว
--
-- แต่ `inv_v_item_stock` และ `inv_v_low_stock` เป็นคนละแบบ: มันคือ **staff-safe view โดยเจตนา**
--   • เลือกเฉพาะคอลัมน์ที่ปลอดภัย — **ไม่มี avg_unit_cost / total_cost** ตามกฎข้อ 5
--   • มี WHERE กรองสิทธิ์ในตัวเอง (admin เห็นทุกสาขา / คนอื่นเห็นเฉพาะสาขาตัวเอง)
-- พอกลายเป็น invoker แล้ว RLS ของ `inv_item_stock` (ซึ่งอนุญาตแค่ admin/co-admin) จะบังคับซ้อน
-- อีกชั้น ⇒ **staff อ่านไม่ได้เลย เห็นจำนวนสต๊อกเป็น 0 ทั้งหมด** = ใช้หน้าคลังสินค้าไม่ได้
--
-- ตอนนี้ยังไม่มีใครเดือดร้อนเพราะระบบมีแต่บัญชี admin 2 คน แต่จะพังทันทีที่เชิญพนักงานเข้าระบบ
--
-- ⚠️ หลักการที่ใช้ตัดสินว่า view ไหนควรเป็นแบบไหน (จำไว้ใช้กับ view ใหม่ทุกตัว):
--   • view ที่ **ไม่มี** ตรรกะสิทธิ์ในตัว → ต้องเป็น `security_invoker = on` เสมอ
--     ไม่งั้นมันจะกลายเป็นประตูหลังข้าม RLS (ดูบทเรียนใน 0016)
--   • view ที่ **มี** WHERE กรองสิทธิ์ในตัวเอง **และ** เลือกเฉพาะคอลัมน์ที่ปลอดภัย → เป็น definer
--     ได้ เพราะตัว view เองคือด่านความปลอดภัย (นี่คือ pattern "staff-safe view" ของ migration 0003)
--   • **ห้ามเป็น definer ถ้ายังมีคอลัมน์ต้นทุนอยู่** — `inv_v_inventory_value`,
--     `inv_v_monthly_cogs`, `inv_v_top_consumed_items_30d` มีข้อมูลต้นทุน จึงต้องคง invoker ไว้
--     ให้ RLS กันพนักงานออกไป (ไม่แตะในไฟล์นี้)

-- ── 1. inv_v_low_stock: เพิ่มการกรองสิทธิ์ให้เท่ากับ inv_v_item_stock ────
-- เดิมไม่มี WHERE กรอง role/สาขาเลย ถ้าตั้งเป็น definer ทั้งอย่างนั้นจะกลายเป็นว่าพนักงาน
-- สาขาหนึ่งเห็นของอีกสาขาได้ — เติมเงื่อนไขเดียวกับ inv_v_item_stock ก่อน แล้วค่อยเปลี่ยนโหมด
create or replace view public.inv_v_low_stock as
select
  s.branch_id,
  b.name as branch_name,
  i.id as item_id,
  i.name,
  i.item_type,
  i.category,
  s.current_qty,
  s.min_stock_level,
  i.base_unit
from public.inv_item_stock s
join public.inv_items i on i.id = s.item_id
join public.inv_branches b on b.id = s.branch_id
where i.is_active = true
  and s.current_qty <= s.min_stock_level
  and s.alert_muted = false
  -- กรองสิทธิ์ในตัว view (เหมือน inv_v_item_stock) เพราะ view นี้เป็น definer
  and (inv_fn_current_role() = 'admin' or s.branch_id = inv_fn_current_branch());

-- ── 2. เปลี่ยน 2 view นี้กลับเป็น definer ───────────────────────────────
-- ปลอดภัยเพราะ: (ก) ไม่มีคอลัมน์ต้นทุนแม้แต่คอลัมน์เดียว (ข) มี WHERE กรอง role/สาขาในตัวเอง
-- (ค) `anon` ถูก revoke สิทธิ์ไปหมดแล้วตั้งแต่ 0016 จึงเข้าไม่ถึงอยู่ดี
alter view public.inv_v_item_stock set (security_invoker = off);
alter view public.inv_v_low_stock  set (security_invoker = off);

-- view alias ที่ชี้มาที่สองตัวนี้ (`v_item_stock`, `v_low_stock`) คงเป็น invoker ไว้ตามเดิม
-- ห่วงโซ่จึงเป็น: alias (invoker) → staff-safe view (definer) → ตารางจริง
-- ผู้เรียกต้องมีสิทธิ์ SELECT บน view ชั้นใน (authenticated มีอยู่แล้ว) แล้วตัว staff-safe view
-- จะเป็นคนตัดสินว่าเห็นแถวไหนได้บ้าง — พนักงานเห็นจำนวนสต๊อกของสาขาตัวเอง แต่ไม่เห็นต้นทุน
grant select on public.inv_v_item_stock to authenticated;
grant select on public.inv_v_low_stock  to authenticated;
grant select on public.v_item_stock     to authenticated;
grant select on public.v_low_stock      to authenticated;
