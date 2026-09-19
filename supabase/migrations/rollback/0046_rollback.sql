-- ถอดตารางลงสมุดซื้อและฟังก์ชันปิดเส้นทาง live (0046 ยังไม่ apply production)

drop function if exists public.sc_fn_post_receipt(uuid, text, text, text, numeric, numeric, uuid);
drop function if exists public.sc_fn_guard_live_feature(text);
drop table if exists public.sc_receipt_posts;
