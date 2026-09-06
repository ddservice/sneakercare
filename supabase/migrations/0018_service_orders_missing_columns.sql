-- ════════════════════════════════════════════════════════════════════════
--  0018_service_orders_missing_columns.sql
--  เพิ่มคอลัมน์ที่โมดูลรับงานบริการ (/pos) ต้องใช้แต่ไม่เคยมีในตารางจริง
-- ════════════════════════════════════════════════════════════════════════
--
-- พบ 2026-09-06 ตอน generate types จากฐานข้อมูล production แล้วให้ TypeScript ตรวจโค้ดจริง
-- เป็นครั้งแรก (ก่อนหน้านี้ทั้งโปรเจกต์ใช้ `as any` ทับไว้ TypeScript จึงมองไม่เห็นอะไรเลย)
--
-- `createServiceOrder()` ใน app/actions/pos.ts เขียนลงคอลัมน์ที่ **ไม่มีอยู่จริง 6 ตัว**:
--   gross_amount, cash_amount, transfer_amount, is_paid, notes, received_by
-- และ service_order_items เขียน `quantity` ที่ก็ไม่มีเช่นกัน
-- ⇒ ฟีเจอร์นี้ error ทุกครั้งที่กดบันทึกมาตลอด ซึ่งตรงกับที่ทั้งสองตารางมี **0 แถว**
-- (ร้านใช้หน้า /pos/daily-entry บันทึกยอดขายลง sc_sales แทน จึงไม่มีใครสังเกต)
--
-- แนวทางแก้แบ่งเป็น 2 ส่วน:
--   • ชื่อที่แค่ "เรียกผิด" → แก้ที่โค้ดให้ตรงกับตาราง (gross_amount→total_amount,
--     notes→note, received_by→created_by, is_paid→payment_status)
--   • ข้อมูลที่ฟอร์มเก็บจริงแต่ตารางไม่มีที่เก็บ → เพิ่มคอลัมน์ที่นี่ ไม่ตัดทิ้ง
--     เพราะการแยกเงินสด/เงินโอนเป็นข้อมูลที่ร้านใช้กระทบยอดปลายวันจริง (เหมือนที่ sc_sales มี)
--
-- ปลอดภัย: เป็นการ ADD COLUMN ที่มี default บนตารางที่ยังว่างเปล่าทั้งคู่ ไม่กระทบข้อมูลใดๆ

alter table if exists public.service_orders
  add column if not exists cash_amount numeric(12, 2) not null default 0,
  add column if not exists transfer_amount numeric(12, 2) not null default 0;

comment on column public.service_orders.cash_amount is
  'ยอดที่รับเป็นเงินสด — แยกจาก transfer_amount เพื่อกระทบยอดปลายวัน (เพิ่ม 2026-09-06)';
comment on column public.service_orders.transfer_amount is
  'ยอดที่รับเป็นเงินโอน — แยกจาก cash_amount เพื่อกระทบยอดปลายวัน (เพิ่ม 2026-09-06)';

alter table if exists public.service_order_items
  add column if not exists quantity integer not null default 1;

comment on column public.service_order_items.quantity is
  'จำนวนหน่วยของบริการในรายการนั้น (เพิ่ม 2026-09-06 — เดิมโค้ดเขียนคอลัมน์นี้ทั้งที่ยังไม่มี)';
