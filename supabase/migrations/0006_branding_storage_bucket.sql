-- Storage bucket สำหรับเก็บโลโก้/รูปสำหรับใช้ประกอบเอกสาร (payslip, ตั้งค่าร้านค้า) โดยไม่ต้องพึ่ง
-- เว็บฝากรูปภายนอกที่อาจบล็อก hotlink หรือปิดตัวในอนาคต — ใช้ public bucket เพื่อให้ <img src> ฝังตรงได้เลย
-- โดยไม่ต้องแนบ auth token (ไฟล์ในนี้ไม่มีข้อมูลลูกค้า/ธุรกิจที่เป็นความลับ เป็นแค่รูปโลโก้)

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

-- อ่านได้ทุกคน (ต้อง public เพื่อให้ฝัง <img> ได้โดยไม่ auth) แต่เขียน/แก้ไข/ลบได้เฉพาะ Admin เท่านั้น
drop policy if exists branding_public_read on storage.objects;
create policy branding_public_read on storage.objects for select using (
  bucket_id = 'branding'
);

drop policy if exists branding_admin_write on storage.objects;
create policy branding_admin_write on storage.objects for insert with check (
  bucket_id = 'branding' and sc_get_my_role() = 'admin'
);

drop policy if exists branding_admin_update on storage.objects;
create policy branding_admin_update on storage.objects for update using (
  bucket_id = 'branding' and sc_get_my_role() = 'admin'
);

drop policy if exists branding_admin_delete on storage.objects;
create policy branding_admin_delete on storage.objects for delete using (
  bucket_id = 'branding' and sc_get_my_role() = 'admin'
);
