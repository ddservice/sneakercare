-- inv_p_item_stock_select (0001) เดิมคือ "admin หรืออยู่สาขาเดียวกัน" — เช็คแค่สาขา ไม่เช็ค role เลย
-- แปลว่า manager/staff SELECT inv_item_stock ตรงๆ ได้ทั้งแถว รวม avg_unit_cost (ต้นทุนถัวเฉลี่ย) ด้วย
-- ทั้งที่หน้าเว็บซ่อนคอลัมน์นี้ไว้แค่ระดับ UI (canSeeCost ใน StockStatusTable.tsx) — useItemStock() เดิม
-- select('*') จาก inv_item_stock ตรงๆ ทำให้ต้นทุนถูกโหลดลง browser ของ manager/staff ทุกคนอยู่แล้วในการใช้
-- งานปกติ (ไม่ต้องเจาะระบบเลยด้วยซ้ำ เปิด devtools ธรรมดาก็เห็น) ไม่ใช่แค่ช่องโหว่ทาง API เท่านั้น
--
-- แก้แบบเดียวกับที่ทำกับ inv_stock_transactions ไปแล้ว (migration 0008): จำกัด SELECT ตรงบน inv_item_stock
-- เหลือแค่ admin (ทุกสาขา) + co-admin (เฉพาะสาขาตัวเอง) แล้วเพิ่ม view ที่ไม่มีต้นทุนให้ role อื่นใช้แทน
-- สำหรับ current_qty/min_stock_level/alert_muted ที่ทุก role ยังต้องเห็นได้ปกติ (จำเป็นต่อการทำงานจริง
-- ไม่ใช่ข้อมูลอ่อนไหว) — ฝั่งแอปแก้ useItemStock() ให้ query 2 ทาง: view นี้ (ได้เสมอทุก role) + query
-- avg_unit_cost จาก inv_item_stock ตรงๆ แยกต่างหาก (ได้ผลจริงเฉพาะ admin/co-admin, role อื่นได้ [] เปล่าๆ
-- จาก RLS เงียบๆ ไม่ error) แล้ว merge ฝั่ง client

drop policy inv_p_item_stock_select on inv_item_stock;
create policy inv_p_item_stock_select on inv_item_stock for select using (
  inv_fn_current_role() = 'admin'
  or (inv_fn_current_role() = 'co-admin' and branch_id = inv_fn_current_branch())
);

create view inv_v_item_stock
with (security_invoker = false) as
select id, item_id, branch_id, current_qty, min_stock_level, alert_muted, updated_at
from inv_item_stock
where inv_fn_current_role() = 'admin' or branch_id = inv_fn_current_branch();

grant select on inv_v_item_stock to authenticated;

-- หมายเหตุ: view นี้ตั้งใจเป็น security_invoker = false (ค่า default) ต่างจาก 4 view ที่แก้ไปใน 0026
-- เพราะจุดประสงค์ตรงข้ามกัน — 0026 ต้องการให้ view เคารพ RLS ที่ "เข้มกว่า" ของตารางฐาน แต่ view นี้ต้องการ
-- ให้เห็นได้ "กว้างกว่า" RLS ใหม่ของตารางฐาน (ทุก role ในสาขา ไม่ใช่แค่ admin/co-admin) จึงต้อง bypass RLS
-- ของตารางฐานแล้วเขียนเงื่อนไขที่ต้องการเองในตัว view (เหมือนที่ RRS ทำกับ v_item_stock) — ถ้า Security
-- Advisor เตือน view นี้เป็น "Security Definer View" อีกครั้ง **ห้ามแก้เป็น security_invoker = true เด็ดขาด**
-- เพราะจะทำให้ manager/staff มองไม่เห็น current_qty ของตัวเองอีกเลย (RLS ตารางฐานจำกัดแค่ admin/co-admin แล้ว)
