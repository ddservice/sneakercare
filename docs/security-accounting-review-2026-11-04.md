# ผลตรวจความปลอดภัยและความพร้อมบัญชี — 4 พฤศจิกายน 2569

**สถานะหลังแก้ไข: emergency0048 และรับซื้อ0047ติดตั้งแล้ว; release0049–0052ผ่าน hosted rollback smoke กำลังปล่อยตามขอบเขตบริหารร้าน/ส่งสำนักงานบัญชี**

ผล HOLD ด้านล่างเป็นผลตรวจเริ่มต้นก่อนผู้ใช้สั่งแก้ไข ปัจจุบันพบ/แก้เพิ่มเติมเรื่องธุรกรรมขาย-เอกสารไม่ครบชุด, ARจับคู่ตามวัน, importยอดคลังตรง/importรายจ่ายไม่เข้าสายหลัก, ตรวจสลิปจำลอง และแยกสาขาของco-admin ใช้ผลทดสอบและสถานะล่าสุดที่หัว HANDOFF แทนการตีความว่าข้อค้นพบด้านล่างยังไม่มีการแก้ไข

ไม่รับรองว่าไม่มีช่องโหว่ทั้งหมดหรือเป็นบัญชีครบมาตรฐานสำหรับยื่นเอง; เจ้าของยืนยันให้สำนักงานบัญชีตรวจและจัดทำบัญชีปลายทาง

เงื่อนไขของเจ้าของคือ deploy ได้เมื่อระบบพร้อมครบถ้วน ผลตรวจพบช่องโหว่ระดับวิกฤตที่ production และข้อขัดข้องของข้อมูลบัญชี จึงยังไม่ผ่านเงื่อนไขนี้ การที่ lint/build หรือ npm audit ผ่านไม่ได้ยืนยันว่าระบบไม่มีช่องโหว่ หรือบัญชีครบมาตรฐาน

## ขอบเขตและวิธีตรวจ

- อ่าน CLAUDE, HANDOFF, แผนพัฒนา, โค้ดสิทธิ์/ขาย/รับเงิน/เอกสาร/ภาษี/ปิดงวด/คลัง และ migration ที่เกี่ยวข้อง
- SSH อ่านสถานะ VPS, เวอร์ชัน และ HTTP health โดยไม่ restart/build/deploy บน VPS
- อ่าน PostgreSQL metadata ในธุรกรรม READ ONLY: grants, policies, triggers, function definitions, view definitions และ storage bucket metadata ยืนยัน project reference ก่อนเชื่อมต่อ ไม่อ่านข้อมูลลูกค้า/พนักงานรายบุคคล
- นำฟังก์ชันและนโยบายที่อ่านได้มาพิสูจน์ใน PGlite ด้วยข้อมูลสมมติ ไม่ทดลองแก้สิทธิ์/ลดสต๊อก/ออกเลขบน production
- รันทดสอบในเครื่อง ไม่มีการส่งเอกสารหรือข้อความให้บุคคลอื่น ไม่มีการ rotate credentials หรือเปิดฟีเจอร์ live
- ไม่ใช่การรับรองบัญชี/ภาษีโดยผู้ประกอบวิชาชีพ และไม่ใช่การตรวจเจาะระบบครบทุกเส้นทาง ไม่ได้ตรวจย้อนหลังว่าช่องโหว่ถูกใช้ไปแล้วหรือไม่

## สถานะจริงกับโค้ดที่เตรียมไว้

Production HEAD `08081429abd698ea8f89544be9da9fbabb7d3cb9` สะอาด, PM2 online, `/login` 200 ใช้ Node.js 22.23.3 และ Next.js 16.3.5

โค้ดที่ยังไม่ deploy ใช้ Next.js 16.4.5 / React 19.3.1 / Node.js LTS 26.13.0 เฉพาะโปรเจกต์และ CI; migration 0047 ยังไม่มีใน production จึงห้ามนำสถานะในเครื่องไปกล่าวว่าเว็บจริงอัปเดตแล้ว

Next.js 16.4.5 มี security fixes ตาม [release ทางการ](https://github.com/vercel/next.js/releases/tag/v16.4.5) แต่ยังไม่ได้พิสูจน์ว่า advisory ทุกข้อใช้โจมตี configuration ของเว็บนี้ได้

## ช่องโหว่ที่ต้องแก้ก่อนปล่อย

### S1 — Critical: พนักงานยกระดับตนเองเป็น super_admin ได้

**ยืนยัน:** production ให้ authenticated UPDATE ทุกคอลัมน์ของ `profiles` รวม `role`, `tenant_id`, `branch_id`, `is_active`; policy `profiles_update` อนุญาตแถว `id = auth.uid()` โดยไม่แยกคอลัมน์ และไม่มี trigger ป้องกันการแก้โปรไฟล์เลย Constraints ยอมรับ `super_admin`

พิสูจน์ในฐานแยกแล้ว: ผู้ใช้ staff เปลี่ยน role ในแถวตนเองเป็น super_admin ได้ ใช้ policy ที่อ่านจาก production จึงข้ามการ์ดบนหน้าจอ/Server Action ได้

**ผลกระทบ:** เปลี่ยนขอบเขตสิทธิ์และเส้นแบ่งกิจการของทั้งระบบ ข้อจำกัดหลายโมดูลที่อิง role จึงไม่เพียงพอ

**หลักฐานโค้ด:** `supabase/migrations/0031_tenant_rls_enforcement.sql:181`; การซ่อนตัวเลือกใน `app/actions/users.ts` ไม่ป้องกัน direct Data API

**การแก้ที่ต้องมี:** DB guard สำหรับคอลัมน์สิทธิ์และตัวตน, เฉพาะ super_admin จัดการ super_admin, ตรวจ tenant/สาขาของค่าใหม่, ถอนสิทธิ์ที่ไม่จำเป็น เพิ่มทดสอบ direct authenticated UPDATE ทั้งตนเองและผู้อื่น ห้ามทดสอบยกระดับกับบัญชีจริง

### S2 — Critical: ผู้ไม่ล็อกอินเรียก helper ลดสต๊อกได้โดยไม่ผ่าน ledger

**ยืนยัน:** `public.fn_consume_stock_outflow(uuid,uuid,numeric)` เป็น SECURITY DEFINER, anon มี EXECUTE และตัวฟังก์ชันไม่มีการตรวจ actor/tenant/branch เขียน `inv_item_stock` โดยตรง

พิสูจน์ในฐานแยกแล้ว: anon เปลี่ยนยอดจาก 10 เป็น 7 โดยไม่มีรายการ stock ledger

**หลักฐานโค้ด:** `supabase/migrations/0044_reject_overissue_and_idempotency.sql:61`

**การแก้ที่ต้องมี:** ถอน EXECUTE จาก PUBLIC/anon/authenticated สำหรับ helper ภายใน เก็บการเรียกจากฟังก์ชันอนุมัติที่ตรวจสิทธิ์แล้ว ทดสอบทั้ง direct RPC ถูกปฏิเสธ และ flow อนุมัติเดิมยังทำงาน กระทบยอด cache กับ ledger หลังปิดช่องโหว่ โดยไม่เขียนทับยอดย้อนหลังเอง

### S3 — High: ผู้ไม่ล็อกอินขยับตัวนับเลขเอกสารของกิจการอื่นได้

**ยืนยัน:** anon มี USAGE บน `extension_layer` และ EXECUTE บน `fn_generate_document_number(varchar,varchar,varchar,uuid)` ฟังก์ชัน SECURITY DEFINER รับ tenant จากผู้เรียกและตรวจเพียงไม่เป็น null

พิสูจน์ในฐานแยกแล้ว: anon เพิ่มตัวนับเอกสารสำหรับ tenant ที่ระบุเองได้

**หลักฐานโค้ด:** `supabase/migrations/0036_ext_tenant_id.sql:91`; caller ปัจจุบัน `lib/smartacc/numbering.ts` ใช้ service-role client

**การแก้ที่ต้องมี:** จำกัด RPC นี้เฉพาะ service_role ที่จำเป็น หรือย้ายเป็น authenticated RPC ที่ derive tenant จาก actor และตรวจสิทธิ์ก่อนออกเลข ถอน PUBLIC/anon grants ด้วย ไม่ใช่ถอน anon อย่างเดียว

### S4 — High: inventory views ข้าม tenant boundary

**ยืนยัน:** `inv_v_item_stock` / `inv_v_low_stock` ใช้ `security_invoker=off` โดยเงื่อนไขหลักเป็น role admin หรือสาขาประจำ ไม่มี tenant predicate ขณะเดียวกัน authenticated มี SELECT

พิสูจน์ `inv_v_item_stock` ในฐานแยกแล้ว: admin ของ tenant หนึ่งอ่านยอดอีกสาขาซึ่งเป็นตัวแทนของอีก tenant ได้ผ่าน owner-privileged view แม้ตารางฐานเปิด RLS

**ผลกระทบ:** ข้อมูลจำนวนคลัง/จุดสั่งซื้อของกิจการอื่นรั่วผ่าน Data API แม้หน้าจอแอปปกติจะส่ง filter มาเอง

**หลักฐาน:** production view definition ที่ตรวจอ่าน 2026-11-04; pattern เดิมอยู่ใน `supabase/migrations/0003_staff_safe_views.sql:34`

**การแก้ที่ต้องมี:** เขียน staff-safe projection พร้อม actor/tenant/branch predicates ที่ครบ หรือใช้ RPC ที่ตรวจสิทธิ์ ห้ามแก้เป็น security_invoker โดยไม่ตรวจสิทธิ์ underlying columns เพราะอาจทำให้ staff ได้ต้นทุนหรืออ่านไม่ได้ทั้งระบบ

### S5 — High: การปิดงวดยังข้ามได้และเปิดทางเมื่ออ่าน settings ล้มเหลว

**ยืนยันจากโค้ด/metadata:** `readClosedPeriods` ไม่ตรวจ error จากฐานข้อมูล และ parse null เป็นรายการว่าง จึงถือว่าทุกงวดเปิดเมื่อ query ล้มเหลว Production ของ sc_sales/sc_payments/sc_opex มี audit triggers แต่ไม่มี period-close trigger ส่วน RLS ยังอนุญาต writes ตาม tenant ทำให้การเขียนตรงไม่ผ่าน assertPeriodOpen

`recordArPayment` ตรวจ `sale_date` แต่ไม่ได้ตรวจ `received_date` ซึ่งเป็นวันที่กระทบเงินรับ ส่วนลบรับชำระก็อิงวันขายเช่นกัน

**หลักฐานโค้ด:** `lib/period-close-store.ts:12`, `app/actions/daily-sales.ts:374`, `app/actions/daily-sales.ts:469`

**การแก้ที่ต้องมี:** fail closed เมื่ออ่านสถานะงวดไม่ได้ บังคับปิดงวดที่ DB/RPC เดียวกับ write และตรวจวันที่บัญชีที่ถูกกระทบทั้งก่อนและหลังแก้ รวมวันรับเงินจริง ไม่ทดสอบโดยแก้ธุรกรรมร้านจริง

### S6 — High: สมุดซื้อที่อ้างว่าเป็นแหล่งหลักยังเขียนตรงเพื่อข้าม RPC ได้

**ยืนยันจาก metadata:** `sc_receipt_posts` ให้ authenticated INSERT/UPDATE/DELETE/TRUNCATE และ policy ALL สำหรับ admin/co-admin ของ tenant ไม่มี immutable trigger บนตารางนี้

จึงไม่ได้บังคับว่าต้องผ่าน `sc_fn_post_receipt` เพื่อตรวจ fingerprint / replay เสมอ การทดสอบ RPC ผ่านไม่ครอบคลุมเส้นทางเขียนตรง การให้ TRUNCATE กว้างยังควรถอน แม้ PostgREST ไม่ได้มี endpoint TRUNCATE ทั่วไปและยังไม่ได้พิสูจน์เส้นทางใช้สิทธิ์นี้ผ่าน HTTP

**หลักฐานโค้ดตั้งต้น:** `supabase/migrations/0046_receipt_posts_and_live_guards.sql`; production grants กว้างกว่า minimum grants ในไฟล์นี้

**การแก้ที่ต้องมี:** ปิด direct client writes แล้วใช้ RPC ที่ตรวจ actor/tenant ด้วยตนเอง เก็บสมุดซื้อ immutable และแก้ด้วย reversal ที่ตรวจสอบได้ ต้องปรับ ownership/security mode ให้สอดคล้องก่อนถอน INSERT เพื่อไม่ทำให้ flow ลงสมุดเดิมพัง

### S7 — Medium: ไฟล์ branding ยังแบ่งกิจการไม่ครบ

bucket `branding` เป็น public มี 1 object; write/update/delete policies ตรวจ role admin/co-admin แต่ไม่ตรวจ tenant prefix/ownership หรือ MIME/ขนาดที่ bucket

เป็นความเสี่ยงต่อการเปลี่ยน/ลบ asset ข้ามกิจการ ไม่ถือว่าการเปิด public logo เป็นช่องโหว่โดยตัวมันเอง ยังไม่ได้ตรวจเนื้อหา object และไม่ยืนยันว่าเป็นไฟล์ส่วนตัว

**การแก้ที่ต้องมี:** tenant-scoped object paths + ownership predicates, MIME/size limits และทดสอบ direct Storage API

## ความครบถ้วนของบัญชีและภาษี

**ยังไม่ใช่ระบบบัญชีเต็มรูปแบบที่รับรองว่าตรงมาตรฐานทั้งหมดได้** ระบบมีส่วนช่วยบริหารร้านและเตรียมข้อมูล แต่การปฏิบัติตามมาตรฐานของกิจการยังต้องพิจารณาทั้งนโยบาย หลักฐาน และบัญชีภายนอก ไม่ใช่ดูว่ามีหน้าภาษีแล้ว

### A1 — โครงบัญชีและงบการเงินยังไม่ครบ

ไม่มี journal/GL, trial balance, งบแสดงฐานะการเงิน, การเปลี่ยนแปลงส่วนของเจ้าของ และ closing workflow ที่พิสูจน์ได้ครบ `DEFAULT_REVENUE_BASIS` เป็น cash เพื่อกระทบยอด Excel ซึ่งใช้เป็นภาพบริหารได้ แต่ไม่ใช่หลักฐานว่ารับรู้บัญชีตามเกณฑ์คงค้างครบทุกเหตุการณ์

ถ้ากิจการใช้ TFRS for NPAEs ต้องเทียบเกณฑ์คงค้างข้อ 3.2–3.3 และงบการเงินที่สมบูรณ์ข้อ 4.1 ตาม [มาตรฐานทางการของสภาวิชาชีพบัญชี](https://acpro-std.tfac.or.th/test_std/uploads/files/%E0%B8%9A%E0%B8%97%E0%B8%84%E0%B8%A7%E0%B8%B2%E0%B8%A1/TFRS%20for%20NPAEs_Revise%202565.pdf) ก่อนกล่าวว่าแอปทำบัญชีตามมาตรฐานครบ นอกจากนี้ต้องยืนยันก่อนว่ากิจการอยู่ภายใต้กรอบใด

หลักฐาน: `lib/dashboard-books.ts:17`, `docs/IMPLEMENTATION_PLAN.md`

### A2 — เลขเอกสารทางการยัง fallback เป็นเลขสุ่ม

เมื่อ RPC ออกเลขล้มเหลว `generateDocumentNumber` คืนเลขสุ่ม 4 หลักแทนการหยุด ทำให้ไม่สามารถรับประกัน unique/ลำดับ/การตรวจสอบเลขทางการได้ อีกทั้ง counter และการ insert document อยู่คนละธุรกรรม จึงกินเลขแล้วสร้างใบไม่สำเร็จได้

หลักฐาน: `lib/smartacc/numbering.ts:29`

ต้อง fail closed สำหรับเลขทางการ และออกเลขพร้อมบันทึกเอกสารใน DB transaction ที่มี idempotency ไม่ควรแก้เลขย้อนหลังด้วยมือ

### A3 — หลายขั้นตอนการเงินยังไม่ atomic

- POS สร้าง service_order แล้วค่อยบันทึก sc_sales ถ้าลงขายล้มเหลว ใบรับงานยังอยู่ พร้อมข้อความเตือน แต่ไม่มีคำสั่ง retry ใบเดิมแบบครบ workflow ที่รับรองไม่สร้างใบรับงานใหม่
- สร้างเอกสารก่อนแล้วค่อย insert line items; ไม่ตรวจ error ของ line-items insert หรือ rollback หัวเอกสาร
- ยอด line items ที่ส่งจาก client ถูกใช้เป็นฐานรวมโดยไม่มีการคำนวณ quantity × unit_price − discount ใหม่ครบฝั่ง server
- รับชำระ AR ผูกวันขาย ไม่ใช่ invoice FK ที่จำเพาะ; query sale ด้วย maybeSingle ขณะที่ในวันเดียวมีได้หลาย service orders ทำให้รับชำระและสถานะลูกหนี้ไม่สามารถ reconcile ระดับบิลได้แน่นอน

หลักฐาน: `app/actions/pos.ts:110`, `app/actions/pos.ts:198`, `app/actions/smartacc-documents.ts:425`, `app/actions/smartacc-documents.ts:614`, `app/actions/smartacc-documents.ts:642`, `app/actions/daily-sales.ts:412`

### A4 — ภาษียังเป็นกระดาษทำงาน ไม่ใช่ระบบยื่นครบ

- `readyToFile: false` และ `completeBook: false` อยู่จริงในโค้ด
- ใบลดหนี้/เพิ่มหนี้ทางการยังปิด และยังไม่กลับยอดขาย/ลูกหนี้/ภาษีอย่างครบวงจร
- VAT ไม่มี effective-date table และยังไม่แยก 0%/ยกเว้นครบ
- ภาษีซื้อบางส่วนมาจาก WHT records/manual purchase book ต้องตรวจหลักฐานใบกำกับและกันเอกสารซ้ำระหว่างแหล่ง ไม่สามารถสรุปสิทธิเครดิตจากการมี WHT record เพียงอย่างเดียว
- VAT ขายอิง issue_date ของเอกสาร ขณะที่ภาษีงานบริการต้องประเมิน tax point ที่เชื่อมกับการรับเงินจริง/การออกใบกำกับ/การใช้บริการตามเงื่อนไขกฎหมาย

หลักฐาน: `lib/tax-recon.ts:115`, `lib/input-vat.ts`, `lib/smartacc/issue.ts:4`, `lib/vat.ts`

อ้างอิง: [ประมวลรัษฎากร มาตรา 78/1](https://www.rd.go.th/5205.html), [รายการใบกำกับ/ใบเพิ่มหนี้/ใบลดหนี้ มาตรา 86/4, 86/9, 86/10](https://www.rd.go.th/5208) รายการจริงและแบบภาษีต้องให้ผู้ทำบัญชี/ผู้สอบบัญชีตรวจตามกรอบที่กิจการใช้ก่อนนำไปยื่น

### A5 — คลัง การซื้อ ค่าใช้จ่าย และบัญชียังเป็นคนละสาย

Moving average และ append-only stock ledger เป็นพื้นฐานที่ดี แต่การรับเข้าตาม 0047 ไม่ลงค่าใช้จ่าย/ภาษีซื้อ/เจ้าหนี้อัตโนมัติ การเบิกใช้ไม่ตัดอัตโนมัติจากบริการ สินค้ารับคืนและ CN ยังไม่เชื่อมบัญชีครบ ต้อง reconcile กับบัญชีภายนอก ไม่ถือว่าแอปมีระบบ perpetual inventory accounting ครบเพียงเพราะมีจำนวนคงเหลือ

## สิ่งที่ตรวจแล้วผ่านและข้อจำกัด

- ทุกตารางจริงใน public/extension_layer ที่ตรวจเปิด RLS; ไม่พบ SECURITY DEFINER ที่ไม่ pin search_path แต่ RLS และ pinned path ไม่ชดเชย execute grants หรือ role escalation ที่ผิด
- npm audit --omit=dev ของโค้ดปัจจุบันพบ 0 advisories; ไม่ใช่ผล audit ของแพ็กเกจ production 16.3.5 และไม่ครอบคลุม application logic
- test:guards ผ่าน 103 actions; test:tax-recon, test:vat, test:checkout, test:period-close, test:docs, test:receipts และ test:migration ผ่านชุดที่รัน
- receipt-pg ใช้ embedded Postgres สอง connection ผ่าน; test-migration-0046 โหมด TEST_DATABASE_URL แยกไม่ได้รัน ไม่ใช่ hosted production smoke
- ชุดทดสอบเดิมไม่ได้ทดสอบ staff แก้ role ตัวเอง/anon mutation RPC/owner-privileged views ครบ จึงผ่านได้ทั้งที่มีช่องโหว่ข้างต้น
- backup ล่าสุด `rrs-backup-20261103_200001.dump` ขนาด 799,117 bytes (เวลาในชื่อไฟล์เป็น UTC; ตรงกับเช้าวันที่ 4 พ.ย. ในไทย) อ่าน TOC ด้วย pg_restore 17.11 และ 18.6 ได้ 92 TABLE DATA รวม auth.users และ sc_receipt_posts ค่า default pg_restore 16.15 อ่านไฟล์นี้ไม่ได้ ห้ามตีความว่า backup เสีย
- ยังไม่ได้ deep restore backup, ตรวจความครบของ uploads/Storage backup หรือยืนยัน scheduler ทุกบริบท (user cron/system cron ที่สิทธิ์นี้อ่านได้ไม่พบ แต่ backup มีไฟล์ใหม่ จึงไม่สรุปว่าไม่มี automation)
- ยังไม่ได้ตรวจ MFA/password policy จาก Auth admin configuration, secret rotation history, full HTTP penetration test หรือ log การใช้งานย้อนหลัง จึงไม่รับรองว่าไม่มีการถูกโจมตีมาก่อน

## ลำดับแก้และเกณฑ์ปล่อย

1. ปิด S1/S2/S3 ก่อน เพิ่ม DB-level regression tests ที่ assert ว่าการกระทำไม่ได้รับอนุญาตถูกปฏิเสธ ไม่เปลี่ยน assertion เพื่อให้ช่องโหว่ผ่าน
2. แก้ S4/S5/S6 และสิทธิ์ Storage ตรวจ role/tenant/branch ทั้งอ่านและเขียนผ่าน Data API โดยตรง
3. ปิดเลขสุ่มของเอกสารทางการ ทำการออกเลข+หัวใบ+รายการเป็น transaction เดียว ทำ POS/payment write ให้ atomic และใช้ invoice/order keys ที่คงเดิมเมื่อ retry
4. ผู้ทำบัญชียืนยันกรอบบัญชี นโยบาย VAT/ภาษีซื้อ/COGS/การรับรู้รายได้ และทางเชื่อมกับบัญชีภายนอก ถ้าจะเป็นบัญชีเต็มต้องมี GL/งบทดลอง/งบการเงินและ reconciliation ที่ตรวจสอบได้
5. ตรวจ backup restore จริงในฐานแยก และ hosted smoke ที่ rollback เสมอ โดยไม่ส่งข้อความ/บิล/เงินจริง ตรวจ counts ว่าไม่ทิ้งข้อมูลทดสอบ
6. เมื่อผ่านเกณฑ์จึงตรวจ Node ของ build และ PM2, migration compatibility/privileges (รวม 0047), commit/push และ deploy ด้วย npm run deploy พร้อม health checks/rollback ตามเดิม

รอบนี้เป็นการวิเคราะห์และตรวจยืนยันเท่านั้น **ช่องโหว่ยังไม่ได้แก้บน production และยังไม่มีการ deploy** ไม่ควรปล่อยฟีเจอร์รับซื้อรอบใหม่พร้อมอ้างว่าระบบบัญชีสมบูรณ์แล้ว

แหล่งแนวทาง security: [Supabase Database Functions — function privileges และ SECURITY DEFINER](https://supabase.com/docs/guides/database/functions), [Supabase security-definer view advisor](https://supabase.github.io/splinter/0010_security_definer_view/)
