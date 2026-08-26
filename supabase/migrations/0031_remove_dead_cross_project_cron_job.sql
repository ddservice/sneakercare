-- พบระหว่างตรวจ cron.job ตอนแก้เรื่องแจ้งเตือนสต๊อกต่ำ (2026-08-26): มี job ชื่อ "low-stock-alert-30min"
-- (คนละชื่อกับ "inv-low-stock-alert-30min" ของระบบนี้เอง) ที่ยิง HTTP ไปที่
-- https://tecrcoienazmtbynuqpg.supabase.co/functions/v1/low-stock-alert ทุก 30 นาที — โฮสต์นั้นคือ
-- project ทดลอง "shoe-care-inventory" ที่ CLAUDE.md บันทึกไว้แล้วว่าลบทิ้งไปตั้งแต่ 2026-07-11
-- (resolve DNS ไม่ได้แล้วจริง ตรวจสอบแล้ว) — job นี้จึงยิง fail เงียบๆ มาตลอด ไม่กระทบอะไร (ไม่ได้ทำให้แจ้ง
-- เตือนซ้ำซ้อนหรือข้ามการเช็ค alert_muted แต่อย่างใด เพราะยิงไม่ถึงปลายทางเลย) แต่เป็นขยะค้าง ลบทิ้ง

select cron.unschedule('low-stock-alert-30min');
