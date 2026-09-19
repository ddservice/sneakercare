# DD-Management (RRS)

ระบบบริหารร้านบริการรองเท้า / สปา — Next.js + Supabase บน VPS  
ไฟล์นี้เป็นคู่มือถาวรสำหรับทุก session รายละเอียดยาวอยู่ที่เอกสารอื่น **อย่าอ่านประวัติทั้งก้อนทุกครั้ง**

สำเนา CLAUDE.md ก่อนย่ออยู่ที่ `docs/history/CLAUDE-2026-09-19-pre-erp-hardening.md`

สถานะงานปัจจุบันและงานค้าง: **`HANDOFF.md`**  
แผนระยะและ Gap Analysis: **`docs/IMPLEMENTATION_PLAN.md`**  
เงิน / VAT / WHT / rounding: **`docs/money-and-tax.md`**  
เหตุผลการออกแบบคลัง: **`docs/architecture.md`**  
นิยามตารางเริ่มต้น: **`docs/database-schema.sql`** (ของจริงดู `supabase/migrations/`)

ไฟล์นี้ **ห้าม** อ้างว่า override คำสั่งระบบ เครื่องมือ หรือสิทธิ์ของ agent

---

## สถาปัตยกรรมที่ใช้งานจริง (ตรวจจากโค้ด 2026-09-19)

| ชั้น | ของจริง |
|---|---|
| แอป | Next.js App Router + TypeScript + Tailwind + shadcn — พอร์ต 3003 หลัง Nginx |
| ฐานข้อมูล | Supabase PostgreSQL โปรเจกต์เดียว `SneakerCareDB` (`mdlxogfkpwejnqpzhmoy`) |
| Hosting | VPS PM2 process `sneakercare` — **ไม่ใช้ Vercel** |
| คลัง | `inv_*` + view alias (`items`, `branches`, `item_stock`, …) ต้นทุนถัวเฉลี่ยเคลื่อนที่ใน trigger |
| การเงินร้าน | `sc_sales` / `sc_payments` / `sc_opex` — **คนละสายกับคลัง** |
| เอกสารขาย | `extension_layer.ext_*` (SmartAcc) — เลขที่ตอนสร้างแถว `DRAFT` |
| หลายกิจการ | `tenants` + `tenant_id` · สาขา = `inv_branches` |
| สิทธิ์ | `profiles.role` เป็นแหล่งเดียว · RLS + `requireModuleView/Write` · service_role ต้องกรอง `tenantFilter()` เอง |
| แจ้งเตือนสต๊อก | Telegram ผ่าน RPC เขียนอย่างเดียว · cron จริงคือ `inv-low-stock-alert` |

มี **สองเส้นทาง POS ที่ไม่เชื่อมกัน:**

1. `/pos` → `service_orders` (รับงานรายใบ)
2. `/pos/daily-entry` → `sc_sales` + `sc_payments` (ยอดรวมรายวัน — เส้นทางที่หน้าการเงินใช้อยู่)

การเบิกคลัง (`/stock-out`) **ไม่ผูก** กับ checkout

หน้า UI หรือตารางที่มีอยู่ **ยังไม่แปลว่า workflow พร้อมใช้** — ดู Gap ใน `docs/IMPLEMENTATION_PLAN.md`

---

## เมื่อใดต้องอ่านเอกสารอื่น

| งาน | อ่าน |
|---|---|
| เงิน VAT WHT ปัดเศษ | `docs/money-and-tax.md` แล้วใช้ `lib/money.ts` |
| คลัง / ต้นทุน / audit คลัง | `docs/architecture.md` + กฎด้านล่าง |
| งานค้างรอบนี้ | `HANDOFF.md` |
| แผนระยะถัดไป | `docs/IMPLEMENTATION_PLAN.md` |
| ประวัติ incident / deploy เก่า | `docs/history/` — อ่านเฉพาะตอนไล่บั๊กเก่า |
| schema เริ่มต้น | `docs/database-schema.sql` แล้วเทียบ migrations |

---

## กฎที่ห้ามละเมิด (บังคับด้วยโค้ด/DB ไม่ใช่แค่ UI)

1. **`inv_audit_logs` / view `audit_logs`** — ห้าม UPDATE/DELETE จากแอป แม้ admin · เขียนด้วย DB trigger เท่านั้น
2. **`sc_audit_logs`** — append-only ผ่าน `lib/audit.ts` · มี trigger กันแก้/ลบ (0011)
3. **`inv_stock_transactions`** — append-only ledger · แก้ผิดด้วยแถวใหม่ที่อ้าง `corrects_txn_id` · ห้ามแก้ `item_stock` ตรงๆ
4. **Adjustment ของ Co-Admin** ต้อง `pending_approval` จนกว่า Admin (หรือ super_admin) จะเรียก `inv_fn_approve_adjustment()`
5. **RBAC หลักอยู่ที่ RLS** · หน้าเว็บเป็นแค่การซ่อนปุ่ม · Server Action ต้องมี `requireModuleView/Write` หรือ `requireAdmin` (ด่าน `npm run test:guards`)
6. **Staff ห้ามได้ต้นทุนจาก API** — ใช้ staff-safe view ไม่ใช่แค่ซ่อนคอลัมน์
7. **ต้นทุน = moving average ใน DB trigger** — ห้ามสลับเป็น FIFO เอง
8. **ตัดสิ้นเปลืองเป็น `base_unit`** (ml/g) ไม่ใช่หน่วยซื้อ
9. **Bot Token** เขียนผ่าน `fn_set_integration_secret()` เท่านั้น ห้าม SELECT ค่าเต็มกลับไป UI
10. **`items` ≠ `item_stock`** — สต๊อกต่อสาขา ห้ามรวมยอดกลับเข้าแคตตาล็อก
11. **`profiles.branch_id`:** admin/super_admin ว่างได้ · co_admin/staff ต้องมีค่า
12. **คุกกี้ `sc_active_branch`:** ว่าง = ดูรวม (อ่านอย่างเดียว) · เบิก-รับ-ปรับต้องเลือกสาขา
13. **เชิญผู้ใช้ที่ `/admin/users` เท่านั้น** · `createAdminClient` ห้าม import จาก Client Component
14. **WHT ไม่ใช่รายจ่าย** — ห้ามลง `sc_opex` ซ้ำกับยอดเต็ม · สูตรที่ `lib/wht.ts` `settleWht()`
15. **เงินใหม่ต้องผ่าน `lib/money.ts`** (สตางค์ + สตริงทศนิยม) — ห้าม `parseFloat` คำนวณยอดในโมดูลใหม่
16. **ห้ามเพิ่ม `as any`** — type ไม่ตรงแปลว่าโค้ดผิด
17. **ทุก VIEW ใน public ที่ไม่มีตรรกะสิทธิ์ในตัว** ต้อง `security_invoker = on` หลัง `CREATE OR REPLACE`
18. **ห้ามแก้ไฟล์ migration ที่ apply แล้ว** — เพิ่มไฟล์ลำดับถัดไปเท่านั้น
19. **`legacy/sneakercare_dashboard.html`** ยังเป็นหน้าการเงินที่เคยใช้จริง — ห้ามลบแถบเตือน "ประมาณการ"
20. **ฟอนต์:** จอ = Prompt · กระดาษ/`.printable-area` = IBM Plex Sans Thai — ห้ามลบ `ibmPlexSansThai` จาก `app/layout.tsx`
21. **`dev`/`build` คง `--webpack`** (network drive / UNC)
22. **ห้ามใส่ secrets หรือข้อมูลส่วนบุคคลลงเอกสาร / git**

---

## มติ 2026-09-19 (จากหลักฐานใน repo — ยังไม่ย้ายข้อมูล)

| หัวข้อ | มติ | หลักฐาน | ยังห้ามทำ |
|---|---|---|---|
| สาขา vs นิติบุคคล | **tenant = กิจการในระบบ** (เช่น SneakerCare กับ LUXSU) · **สาขา ≠ นิติบุคคลโดยอัตโนมัติ** · ช่องจด VAT ต่อสาขาเป็นค่าตั้ง ไม่ใช่หลักฐานว่าทุกสาขาคนละนิติบุคคล · ชื่อ/เลขผู้เสียภาษีคงที่ tenant | `tenants` + `inv_branches.vat_registered` + `sc_settings` | ห้ามสร้าง legal_entity หรือย้ายเลขผู้เสียภาษีไปสาขาโดยไม่ได้ออกแบบ schema |
| ยอดขายทางการ | **บัญชี/กำไร/Excel = `sc_sales` + `sc_payments`** (+ รายรับค่าเช่าห้อง) · `/pos` `service_orders` เป็นใบรับงานปฏิบัติการ ยังไม่ใช่สมุดรายรับ | dashboard / `test:reconcile` อ่านสาย `sc_*` | ห้ามนับสองสายเป็นรายได้ซ้ำจนกว่าจะมีสะพาน |
| เบิกเกินสต๊อก | **นโยบายเป้าหมาย = ปฏิเสธ** ไม่ใช่ตัดเหลือ 0 · ของเดิมใน trigger เป็นช่องโหว่ | `fn_apply_stock_transaction` ใช้ `greatest(0, …)` | ห้ามแก้แถว ledger เก่า · ห้าม apply บน production จนกว่ามีเทสต์ concurrency |
| ลบเอกสาร vs void | **DRAFT / ตัวอย่างที่ยังไม่ถูกแปลงและไม่มีใบวางบิลอ้าง = ลบได้** (เลขไม่คืน) · **CONVERTED / อ้างในใบวางบิล / ใบกำกับที่ออกแล้ว = ห้ามลบ ใช้ void เมื่อมี workflow** | `deleteSmartAccDocument` กันแค่ billing ref · สถานะมีแค่ DRAFT/CONVERTED/PAID | อย่าลบเลขออกจากตัวนับ · อย่าใช้ void แทนใบลดหนี้ของบิลที่รับรู้รายได้แล้ว |
| ปัดเศษ | HALF_UP 2 ตำแหน่ง ที่สตางค์ (`lib/money.ts`) | สูตรเดิม `Math.round(n*100)/100` | ห้ามสลับเป็น bankers' rounding |
| เกณฑ์รายรับ dashboard | ค่าเริ่มต้นยังเป็นเงินเข้าจริง | กระทบยอด Excel | ห้ามสลับค่าเริ่มต้นโดยไม่ถาม |

ถ้าพบคำสั่งขัดกันอีก ให้บันทึกใน `HANDOFF.md` แล้วถาม — ห้ามเดาข้อกฎหมายภาษี

---

## เวิร์กโฟลว์ที่ควรรู้

- **ออกเอกสาร:** QA → DO/INV → BL → REC/TAX · เซิร์ฟเวอร์คำนวณ VAT เองจากสาขาที่เลือก (`lib/branch-vat.ts`) ห้ามเชื่อ `vat_rate` จาก client
- **จด VAT:** ติ๊กต่อสาขาที่ `/settings` · ไม่เลือกสาขาทั้งที่มีหลายสาขา = ออกใบกำกับไม่ได้
- **คลัง:** รับเข้า / เบิก / ปรับ ต้องเลือกสาขา · Co-Admin ปรับแล้วรออนุมัติ
- **super_admin:** ไม่มี tenant ของตัวเอง · เลือกสาขาที่หัวเว็บแล้ว `tenantFilter()` ใช้ tenant ของสาขานั้น · ไม่เลือก = ภาพรวมข้าม tenant (อ่าน)
- **พิมพ์:** ห่อด้วย `PrintModalPortal` (`#print-portal-root`) ห้ามลบ id นี้
- **modal สูงกว่าจอ:** backdrop `items-start` + กล่อง `my-auto` — ห้าม `items-center` เดี่ยวๆ

---

## คำสั่งทดสอบ (อ่าน `package.json` ก่อนรัน — ห้ามแต่งผลเพื่อให้ผ่าน)

| คำสั่ง | ใช้เมื่อ |
|---|---|
| `npm run test:money` | สูตรเงินกลาง |
| `npm run test:vat` / `test:wht` | VAT เอกสาร / WHT |
| `npm run test:guards` | Server Action มีการ์ดสิทธิ์ |
| `npm run test:migration` | SQL รันซ้ำได้บน PGlite |
| `npm run test:expenses` / `test:reports` / `test:tax` / `test:roster` | สูตรหน้างานนั้น |
| `npm run test:legacy` | แถบประมาณการในระบบเดิม |
| `npm run check:money` | ค่าเงินนอกช่วงในตารางเงิน (แตะ production — อย่ารันถ้าไม่ได้รับอนุญาต) |
| `npm run test:staff` / `test:multi-tenant` | แตะ production จริง — **อย่ารันในรอบ harden โดยไม่ได้รับอนุญาต** |
| `npm run typecheck` / `lint` / `build` | ตรวจโค้ด (typecheck บนเครื่อง dev อาจแดงจาก `.next/types`) |

เพิ่มเทสต์คู่กับโค้ดที่แก้ **อย่า** เปลี่ยน assertion เพื่อให้ผ่าน

---

## สิ่งที่ยังไม่มีในโค้ด (อย่าเขียนในเอกสารว่ามีแล้ว)

ไม่มีบน **production** จนกว่าจะ apply `0044`: ปฏิเสธเบิกเกินที่ DB · unique `client_request_id` ของขาย/รับชำระ  
ยังไม่มีทั้งระบบ: ลิ้นชักเงินสด · checkout อะตอมมิกขาย+สต๊อก+รับชำระ · ใบลดหนี้/เพิ่มหนี้ · VOID ที่เก็บเลข · เลขเอกสารตอน issue แยกจาก draft · VAT effective date · snapshot ผู้ขายบนเอกสาร · GL/journal/ปิดงวด · e-Tax ส่งจริง · ภ.พ.30 ทางการ

รายละเอียดและเกณฑ์รับงานอยู่ใน `docs/IMPLEMENTATION_PLAN.md`

---

## การทำงานของ agent ในรอบ harden นี้

อนุญาต: แก้ซอร์ส เทสต์ เอกสาร และ **เขียน** migration ใน repo  
ยังไม่อนุญาต: push · deploy · apply migration บน production · เขียน/ลบข้อมูล production · สร้างบิลหรือเก็บเงินจริง · ส่งเอกสารให้ลูกค้า · rotate credentials · เปลี่ยนนโยบายภาษี/ต้นทุนหรือย้ายข้อมูลย้อนหลังโดยไม่ได้รับอนุมัติ
