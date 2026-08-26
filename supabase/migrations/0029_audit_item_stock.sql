-- เหตุการณ์ (2026-08-26): migration 0027 (กู้คืน ledger หลังอุบัติเหตุ) ต้องลบ inv_item_stock ทั้งตาราง
-- แล้วให้ trigger คำนวณ current_qty/avg_unit_cost ใหม่จากการ replay ledger — แต่ `alert_muted` (เพิ่มใน
-- 0025) ไม่มีตัวแทนอยู่ใน ledger เลย เพราะเป็นค่าที่ set ตรงผ่าน inv_fn_set_alert_muted (UPDATE) ไม่ใช่ค่า
-- ที่มาจาก stock_transactions — ผลคือค่า alert_muted ของทุกสินค้าที่เคยถูกปิดแจ้งเตือนไว้ **หายไปเงียบๆ
-- กลับไปเป็นค่า default (false) ทั้งหมด โดยไม่มีใครรู้ตัวจนกว่าจะมีคนสังเกตว่าแจ้งเตือนกลับมาอีก**
-- (ไม่มีทางกู้คืนค่าที่หายไปได้เลย เพราะไม่มี audit trail ของตารางนี้มาก่อน) — ต้องให้ผู้ใช้ตั้งค่าใหม่เอง
--
-- แก้ไม่ให้เกิดซ้ำ: เพิ่ม audit trigger ให้ inv_item_stock เหมือนตารางอื่นๆ ที่มีอยู่แล้ว
-- (inv_items, inv_branches, inv_integration_secrets) ต่อไปถ้าเกิดเหตุการณ์ทำนองนี้อีก จะกู้ค่า
-- alert_muted/min_stock_level ล่าสุดของแต่ละสินค้าคืนได้จาก inv_audit_logs

create trigger inv_trg_audit_item_stock
after insert or update on inv_item_stock
for each row execute function inv_fn_write_audit_log();
