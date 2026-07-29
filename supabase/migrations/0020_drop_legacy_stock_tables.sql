-- ผู้ใช้ยืนยันแล้วให้ปิด /legacy/ (ระบบ sneakercare_dashboard.html เดิม) ถาวร ตารางทั้งสองนี้มีไว้
-- เพื่อเก็บข้อมูล "ต้นทุนวัสดุคลัง"/สต๊อกคงเหลือของระบบเดิมเท่านั้น (อ่าน/เขียนโดย sneakercare_dashboard.html
-- และ dual-write helper `syncLegacyStock` ในแอปใหม่ที่ถอดออกไปแล้วพร้อม migration นี้) — ระบบใหม่อ่านข้อมูล
-- จาก inv_stock_transactions/inv_item_stock โดยตรงมาตั้งแต่ย้ายแท็บภาพรวมมา React แล้ว (ดู
-- app/src/lib/queries/materialCost.ts) ไม่มีโค้ดฝั่งไหนอ่าน/เขียนสองตารางนี้อีกต่อไป
--
-- ตรวจสอบแล้วก่อนลบ: ไม่มี view/trigger ใดอ้างอิงตารางนี้ (query pg_depend + information_schema.triggers
-- ว่างเปล่าทั้งคู่) และข้อมูลในนี้เป็นสาเหตุของบั๊ก "ต้นทุนวัสดุคลังหาย" ที่แก้ไปแล้วตอนต้นของการย้ายระบบ
-- (ข้าม item ที่ purchase_unit_qty != 1 แบบเงียบๆ) จึงไม่ใช่ข้อมูลอ้างอิงที่ถูกต้องอยู่แล้ว

drop table if exists sc_stock_transactions;
drop table if exists sc_stock_status;
