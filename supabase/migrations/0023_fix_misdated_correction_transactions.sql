-- ผู้ใช้ยืนยันแล้วว่าการซื้อ "น้ำยาขจัดคราบสีฟ้า" ที่ถูกแก้ไขจำนวนจาก 80 เหลือ 10 ขวด (รวม 2,000 บาท)
-- เป็นการซื้อจริงที่เกิดขึ้นในเดือนกุมภาพันธ์ 2569 (ตรงกับวันที่ของรายการต้นฉบับ 278dcd12... ที่ยังไม่ได้แก้)
-- แต่ตอนใช้ปุ่ม "แก้ไขรายการซื้อเข้า" (useCorrectPurchase) ทั้งรายการยกเลิก (reversal) และรายการที่แก้ไข
-- ใหม่ ไม่ได้ส่ง transaction_date ไปเลย จึง default เป็น current_date (วันที่กดแก้ไขจริง 29 ก.ค. 2569)
-- ทำให้ยอดต้นทุนวัสดุของเดือนกรกฎาคมเพี้ยนไปเกือบ 570 บาท (นับรายการของเดือนกุมภาพันธ์ปนเข้ามา)
--
-- แก้เฉพาะ transaction_date เท่านั้น (ไม่แตะ quantity_delta/unit_cost_snapshot ซึ่งเป็นตัวเลขทางบัญชีจริง
-- ที่กฎ append-only ห้ามแก้) — ตรวจสอบแล้วว่า trigger บนตารางนี้ทำงานเฉพาะตอน INSERT เท่านั้น (ดู
-- inv_trg_apply_stock_transaction, inv_trg_audit_stock_transactions) การ UPDATE คอลัมน์นี้จึงไม่กระทบ
-- ยอดคงเหลือ/ต้นทุนถัวเฉลี่ยเคลื่อนที่ที่คำนวณไปแล้ว
--
-- แก้โค้ดต้นเหตุคู่กันแล้วที่ app/src/lib/queries/purchaseHistory.ts (insertReversalTxn ใช้วันที่ของ
-- รายการเดิมเสมอ, useCorrectPurchase ให้ผู้ใช้เลือกวันที่ของรายการที่แก้ไขใหม่ได้ใน CorrectPurchaseModal)
-- เพื่อไม่ให้บั๊กนี้เกิดซ้ำกับการแก้ไข/ลบรายการซื้อในเดือนถัดๆ ไป

update inv_stock_transactions
set transaction_date = '2026-02-01'
where id in (
  '4fa40ded-a5fe-48f9-849b-d1c71327299d', -- adjustment_decrease (reversal of the wrongly-entered 80-unit row)
  '551cd5bb-f179-4a0c-b013-9326643237d0'  -- stock_in (the corrected 10-unit / 2,000-baht replacement row)
);
