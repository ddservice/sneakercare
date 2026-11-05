> อัปเดตงานแก้ไขรอบถัดมาในวันเดียวกัน: M3/M4 มีโค้ดแก้ใน migration0053/0054 พร้อมทดสอบ local/native PostgreSQL และ hosted rollback แล้ว ชุดตรวจ release ผ่าน 25/25 และ full migration dry-run พร้อม backup ผ่าน. รายละเอียดรุ่นดู HANDOFF.md ส่วนบน. ความเสี่ยงระดับ VPS H1/H2 และ SSH/พอร์ตยังคงอยู่ ไม่ได้เปลี่ยน config ในงานนี้.

# ตรวจความปลอดภัย VPS / RRS — 5 พฤศจิกายน 2569

**ผลรวม: ยังมีความเสี่ยงสูงระดับ VPS แม้การป้องกันหลักของ RRS ยังอยู่ครบ**

ตรวจ OS/แพตช์ที่ติดตั้ง, PM2, พอร์ตที่มี listener, TCP จากเครื่องตรวจ, HTTP HEAD, TLS origin, SSH authentication negotiation แบบไม่ส่ง credentials, PostgreSQL metadata ใน READ ONLY และโค้ด RRS. ไม่เปลี่ยน config/restart/deploy หรือแก้ข้อมูลธุรกิจในรอบนี้.

คำว่า “ยืนยัน” แยกการตั้งค่า/เวอร์ชันที่พบออกจากการพิสูจน์ exploit. ความเสี่ยงระดับสูงไม่ใช่หลักฐานว่าถูกบุกรุกแล้ว.

## H1 — เว็บอื่นบน VPS ยังใช้ Next.js ที่มีประกาศช่องโหว่ (สูง)

**สถานะ:** ยืนยันเวอร์ชัน / เงื่อนไขโจมตียังไม่ทดสอบ

**หลักฐาน:** horpak: Next 14.2.24; pems-platform: 16.2.12; cnxhaircutz: 16.4.4; sneakercare-local-seo: 16.3.8. RRS เองใช้ 16.4.5. horpak 14.2.24 อยู่ในช่วง CVE-2025-29927 ตาม advisory ผู้พัฒนา

**ผลกระทบ/เงื่อนไข:** ช่องโหว่ข้ามการตรวจสิทธิ์ใน middleware ใช้ได้เมื่อแอปตรวจสิทธิ์ด้วย middleware ตามเงื่อนไขของ advisory ไม่ได้ทดสอบ bypass จริง และยังไม่ยืนยันว่าเว็บเหล่านี้ถูกเจาะ

**สิ่งที่ควรทำ:** อัปเดตแต่ละแอปไปสายที่ยังได้รับ security updates พร้อมทดสอบแยกแอป โดยเริ่ม horpak และ pems; อัปเดต Node อย่างเดียวไม่เปลี่ยน Next.js ในแอป

อ้างอิง: https://github.com/vercel/next.js/security/advisories/GHSA-f82v-jwr5-mffw

## H2 — เว็บหลายตัวใช้บัญชีเดียวที่มีสิทธิ์ระดับ root ผ่าน Docker / wg-quick (สูง)

**สถานะ:** ยืนยันการตั้งค่า

**หลักฐาน:** RRS และ PM2 หลายแอปรันเป็น ddservice; บัญชีเป็นสมาชิก docker และอ่าน Docker API ได้; docker.sock เป็น root:docker 660. sudo -l อนุญาต NOPASSWD: /usr/bin/wg และ /usr/bin/wg-quick โดยไม่จำกัดอาร์กิวเมนต์

**ผลกระทบ/เงื่อนไข:** ถ้าแอปใดรันคำสั่งบนเครื่องได้ จะอ่านไฟล์ของแอปอื่นที่เป็นเจ้าของเดียวกันได้ แม้ .env จะเป็น 600. Docker group เทียบเท่า root และ wg-quick รองรับ hooks ที่รัน shell. ไม่ได้ทดลองยกระดับสิทธิ์

**สิ่งที่ควรทำ:** แยกบัญชีรัน RRS ออกจากบัญชี deploy/ดูแลเครื่อง; บัญชีเว็บไม่ควรอยู่กลุ่ม docker หรือมี sudo; จำกัดคำสั่ง VPN ผ่านการจัดการที่ตรวจ interface/config ได้และไฟล์ config เป็นของ root

อ้างอิง: https://docs.docker.com/engine/install/linux-postinstall/

## M1 — SSH ยังรับ password แม้ไฟล์ harden ระบุปิด (กลาง)

**สถานะ:** ยืนยันการตั้งค่าที่ใช้งานจริง

**หลักฐาน:** เจรจา authentication โดยไม่ส่ง key/password: server ประกาศ publickey,password. ใน 24 ชั่วโมงล่าสุดพบ accepted password 6 ครั้ง (ไม่ใช่ root), accepted publickey 164 ครั้ง และบรรทัด Failed password/Invalid user 1,672 บรรทัด

**ผลกระทบ/เงื่อนไข:** เพิ่มความเสี่ยงจากการเดารหัสผ่าน/บัญชีรั่ว ไม่ได้ยืนยันว่ารหัสผ่านอ่อนหรือการล็อกอิน 6 ครั้งผิดปกติ; ตัวเลข failed/invalid เป็นจำนวนบรรทัด log ไม่ใช่จำนวนผู้โจมตีหรือ attempt ที่ไม่ซ้ำ

**สิ่งที่ควรทำ:** ตรวจ sshd -T ด้วยสิทธิ์ root รวม Match/Include; ยืนยันว่ามี key ใช้งานได้และช่องทางฉุกเฉินก่อนปิด password. ตรวจว่า 6 ครั้งเป็นของเจ้าของ; ไฟล์ 50-cloud-init.conf อ่านไม่ได้จึงยังระบุต้นตอค่า override ไม่ได้แน่ชัด

อ้างอิง: https://man.openbsd.org/sshd_config

## M2 — พอร์ตบริการจัดการ/แอปอื่นเข้าถึงได้ตรงนอก nginx (กลาง)

**สถานะ:** ยืนยันการเชื่อมต่อจากจุดตรวจ

**หลักฐาน:** เชื่อมต่อได้: 9000, 8080, 6789, 8880, 8843, 8443 นอกเหนือ 22/80/443. Docker spider-bot publish 0.0.0.0:9000 และ [::]:9000. HTTP 9000 / redirect ไป /admin/dashboard; HEAD /admin/dashboard ได้ 200 โดยไม่ส่ง cookie. พอร์ต 8080 redirect ไป 8443

**ผลกระทบ/เงื่อนไข:** 9000 ใช้ HTTP ไม่เข้ารหัสและไม่ผ่านการป้องกัน TLS/header ของ nginx. HEAD 200 เพียงอย่างเดียวยังไม่พิสูจน์ว่าอ่านข้อมูลหรือสั่งงาน admin ได้. ยังไม่ได้ยืนยันว่าเปิดได้จากทุก IP; ผลคือจากเครื่องตรวจปัจจุบัน

**สิ่งที่ควรทำ:** พิจารณาผูก 9000 กับ loopback แล้วให้เข้าผ่าน TLS + authentication หรือ VPN. จำกัด 8443 ตามผู้ดูแล; 8080/พอร์ต portal อาจจำเป็นกับ UniFi จึงต้องกำหนด allowlist ตามการใช้งาน ไม่ปิดทั้งหมดทันที. ตรวจ Docker firewall ควบคู่ UFW

อ้างอิง: https://docs.docker.com/engine/network/packet-filtering-firewalls/#docker-and-ufw

## M3 — ตัวจำกัด 60 รายการต่อนาทีหลุดได้เมื่อคำสั่งพร้อมกัน (กลาง)

**สถานะ:** พิสูจน์ใน PostgreSQL จำลอง / โค้ดจริงตรงกัน

**หลักฐาน:** ทดสอบสอง connection ในฐานชั่วคราว: มีคำสั่งเดิม 59; สอง transaction ใช้ request key ต่างกันผ่านทั้งคู่; รวม 61. fingerprint prosrc ของ rrs_private.replay บน production ตรงกับโค้ดที่ทดสอบ. ไม่มีการเขียน production

**ผลกระทบ/เงื่อนไข:** ผู้ใช้ที่มีสิทธิ์สามารถทำให้เกินอัตราที่ตั้งไว้ได้ เพราะล็อกแยก request key แล้วนับแถวก่อนอีก transaction commit. ไม่ได้ข้ามสิทธิ์ tenant และไม่ได้พิสูจน์ว่ารับเงินเกินยอดหรือเกิด duplicate

**สิ่งที่ควรทำ:** เพิ่มการล็อก/ตัวนับแบบ atomic ต่อ actor ใน migration ใหม่ และทดสอบหลาย actor/หลาย request พร้อมกันพร้อมยืนยันว่าไม่เกินเพดาน

## M4 — ค่าใช้จ่ายยังเขียนตรงผ่าน Data API ได้สำหรับ admin/co-admin (กลาง)

**สถานะ:** ช่องว่างการบังคับ business rules

**หลักฐาน:** authenticated มี INSERT/UPDATE/DELETE บน sc_opex; RLS จำกัด admin/co-admin ใน tenant ตนเองหรือ super_admin. ตรงกับ writeRoles ที่แอปอนุญาต จึงไม่ใช่การข้ามบทบาทโดยตัวมันเอง. ตารางขาย/รับเงิน/เอกสาร/สลิปถูกปิด direct writes แล้ว

**ผลกระทบ/เงื่อนไข:** การแก้ค่าใช้จ่ายตรงไม่ผ่าน validation, idempotency และขั้นตอน mirror/WHT ใน Server Action. RLS และ trigger ปิดงวดยังทำงาน; ไม่ได้ทดลอง payload การเงินที่ผิดบน production

**สิ่งที่ควรทำ:** ย้ายรายการค่าใช้จ่ายไป command/RPC แบบ atomic ครอบคลุม mirror และเอกสารที่เกี่ยวข้อง ก่อน revoke direct DML โดยตรวจผู้เขียน legacy ทั้งหมด

## L1 — Security headers ซ้ำและ CSP ยังอนุญาต inline scripts (ต่ำ)

**สถานะ:** ปรับความแข็งแรงเพิ่มเติม

**หลักฐาน:** X-Frame-Options และ Referrer-Policy มาจากทั้ง nginx/Next จึงเห็นค่าซ้ำ; CSP มี script-src unsafe-inline และยังไม่ระบุ frame-ancestors

**ผลกระทบ/เงื่อนไข:** ลดความชัดเจนของ policy และความสามารถ CSP ในการจำกัด script injection ไม่ได้พิสูจน์ XSS/clickjacking หรือถือว่า header ซ้ำทำให้โจมตีได้แน่นอน

**สิ่งที่ควรทำ:** รวม header ให้มีเจ้าของชั้นเดียว เพิ่ม frame-ancestors และพิจารณา CSP nonce หลังทดสอบ Next/หน้า legacy

## I1 — มีประกาศ security release ของ Node.js วันที่ 11 พฤศจิกายน (ข้อมูล)

**สถานะ:** แพตช์ที่ควรวางรอบติดตาม

**หลักฐาน:** ผู้พัฒนาประกาศจะออก security releases สาย 26/24/22 วันที่ 11 พ.ย. 2026 หรือหลังจากนั้น โดยระดับสูงสุด HIGH. RRS ใช้ 26.13.0 ณ วันตรวจ 5 พ.ย.

**ผลกระทบ/เงื่อนไข:** ยังไม่ใช่หลักฐานว่ามีแพตช์รุ่นใหม่ที่ติดตั้งได้แล้ววันนี้ หรือแอปถูกโจมตี. ไม่ได้สร้าง automation/reminder

**สิ่งที่ควรทำ:** ติดตามประกาศและวาง maintenance update หลังรุ่นแก้ไขออก พร้อมตรวจ PM2 interpreter และ health หลังอัปเดต

อ้างอิง: https://github.com/nodejs/nodejs.org/blob/main/apps/site/pages/en/blog/vulnerability/november-2026-security-releases.md

## I2 — libsqlite3-0 มีอัปเดตค้างหนึ่งรายการ (ข้อมูล)

**สถานะ:** พบจากดัชนี apt ที่มีอยู่

**หลักฐาน:** ติดตั้ง 3.45.1-1ubuntu2.8; ดัชนี apt เสนอ 3.45.1-1ubuntu2.9. nginx 1.24.0-2ubuntu7.19 และ openssh-server 9.6p1-3ubuntu13.20 ตรงรุ่น Ubuntu security package ที่ตรวจอ้างอิง

**ผลกระทบ/เงื่อนไข:** ไม่ได้ยืนยันว่า SQLite update นี้เป็นการปิดช่องโหว่ร้ายแรง; ไม่ใช้เลข upstream ของ nginx/OpenSSH ตัดสินว่าขาดแพตช์ เพราะ Ubuntu backport security fixes

**สิ่งที่ควรทำ:** ตรวจ changelog แล้วอัปเดตในรอบดูแลระบบ; ตรวจความสดของ apt index ด้วยสิทธิ์ผู้ดูแลก่อนสรุปว่าระบบอัปเดตครบ

อ้างอิง: https://packages.ubuntu.com/noble/openssh-server

## สิ่งที่ผ่านการตรวจ

- RRS production commit 1e0036d, Next.js 16.4.5, Node/PM2 26.13.0; /login ตอบ 200 และ source ไม่มีงานค้าง
- npm audit --omit=dev ของ RRS: 0 advisories ณ วันตรวจ; ไม่ใช่ผลของทุกแอปหรือทุก Docker image
- ตาราง public/extension_layer ที่ตรวจไม่พบตารางที่ปิด RLS และไม่พบ SECURITY DEFINER ที่ปล่อย search_path เปลี่ยนได้
- anonymous เรียก definer ได้เพียง fn_current_tenant และ fn_sc_is_admin; ไม่พบสิทธิ์ anonymous ที่ใช้เขียนรายการเงินตามรายการตรวจ
- authenticated เขียนขาย/รับเงิน/เอกสาร/สลิปตรงไม่ได้; dedicated owner ทั้ง 3 ตัว NOLOGIN/NOBYPASSRLS
- ไฟล์ .env.local และ backup.env เป็น 600; .ssh 700 และ authorized_keys 600
- หน้าราคาซื้อ/รายงานที่ไม่ล็อกอิน redirect ไป login; HEAD /.env และ /.git/config ได้ 404
- ทดสอบ TLS ที่ origin: TLS1.0/1.1 ถูกปฏิเสธ; TLS1.2/1.3 ใช้ได้ แม้ global config จะยังมีค่าเก่า
- พอร์ต RRS 3003 และ PostgreSQL 5432 ไม่เชื่อมต่อได้จากเครื่องตรวจ; มี listener เฉพาะ loopback
- backup ล่าสุด rrs-backup-20261104_200001.dump 904,629 bytes; pg_restore17/18 อ่าน TOC ได้ 96 TABLE DATA รวม auth.users และ sc_receipt_posts; ไม่กู้ซ้ำวันนี้
- ไม่พบ legacy verified-slip records และเงินรับ legacy ที่ยังไม่จับคู่จาก aggregate checks (ทั้งคู่ 0)

## ขอบเขตที่ยังยืนยันไม่ได้

- อ่าน effective UFW/nft rules, fail2ban jail และ sshd -T ไม่ได้ด้วย sudo ปัจจุบัน จึงยืนยัน policy รวม/root-login ทั้งหมดไม่ได้; ไม่ใช้ Docker หรือ wg-quick ข้ามสิทธิ์ไปอ่านแทน
- ไม่ได้ทดสอบ IPv6 จากภายนอก และการเข้าถึงพอร์ตจากจุดตรวจนี้อาจต่างจาก IP อื่น
- ไม่ได้ audit dependency tree / source / container images ของแอปอื่นทั้งหมด; automatic approval review ปฏิเสธวิธีส่ง private lockfile metadata ของแอปอื่นไป npm จึงใช้เฉพาะเวอร์ชันกับประกาศสาธารณะ
- ไม่ได้ทดสอบโจมตี middleware จริง ไม่อ่านข้อมูล admin ของบริการ 9000 และไม่ได้ทดสอบ credentials, brute-force หรือยกระดับ root
- ไม่ได้ตรวจบัญชีผู้ใช้จริงครบทุก role/ทุกหน้า และไม่ได้ทำ intrusion forensics เพื่อยืนยันว่ามีหรือไม่มีการบุกรุก
- backup รอบนี้ตรวจความสด/TOC ไม่ยืนยัน off-site R2, storage uploads หรือ full auth/schema restore; รอบก่อนเคยกู้ public data 34/34 ตารางและเทียบจำนวน 5 ตารางหลัก

## ลำดับดำเนินการ

1. อัปเดต Next.js ของเว็บอื่นและแยกบัญชี runtime ออกจากบัญชีที่มี Docker/sudo
2. ยืนยัน SSH key/ช่องทางฉุกเฉิน แล้วปิด password ตาม effective configuration; ตรวจการล็อกอิน 6 ครั้ง
3. จำกัด port9000/UniFi management ตามการใช้งานจริง โดยตรวจทั้ง Docker firewall และ UFW
4. แก้ concurrency throttle และย้าย expense commands ให้บังคับ validation/mirror ในธุรกรรมเดียว
5. เกลา headers และติดตาม Node security release 11พ.ย.; ตรวจ apt update ที่ค้าง

หลักฐานดิบเก็บใน .scratch-* ภายใน workspace ไม่ส่งขึ้น Git. ผลเป็น snapshot ณ เวลาตรวจ ไม่ใช่การรับรองว่าปราศจากช่องโหว่ทั้งหมด.
