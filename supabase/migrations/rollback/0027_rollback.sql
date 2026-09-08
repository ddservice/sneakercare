-- ย้อน 0027
--
-- ⚠️ อ่านก่อนรัน: 0027 เป็น "baseline" ที่เขียนสิ่งที่มีอยู่บน production อยู่แล้วลงไฟล์
-- การย้อนมันจึงไม่ใช่การกลับไปสู่สภาพเดิม แต่เป็นการ **ลบของที่ระบบใช้งานอยู่จริง**
-- โดยเฉพาะการ drop คอลัมน์ = ข้อมูลอ้างอิงเอกสารต้นทางหายถาวร กู้คืนไม่ได้
-- ให้ใช้เฉพาะตอนที่แน่ใจว่า apply ผิดโปรเจกต์เท่านั้น

alter table extension_layer.ext_documents drop column if exists ref_parent_doc_number;
alter table extension_layer.ext_documents drop column if exists ref_parent_doc_id;
-- ไม่ย้อน varchar(8) กลับ และไม่ drop ฟังก์ชันรันเลขเอกสาร
-- (ระบบออกเอกสารจะพังทันทีถ้าไม่มีฟังก์ชันนี้ — เสียหายกว่าการปล่อยไว้)
