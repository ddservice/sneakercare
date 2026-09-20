# ระบบบริหารจัดการคลังสินค้า

คลังสินค้าสำหรับร้านบริการทำความสะอาด/ซ่อมแซมรองเท้า — แทนระบบเดิมที่เป็น Google Apps Script + Sheets

- Frontend: Next.js (App Router) + Tailwind CSS + shadcn/ui
- Backend: Supabase (PostgreSQL + Auth + RLS + Edge Functions)
- Hosting: VPS (PM2 + Nginx) + Supabase Cloud — ไม่ใช้ Vercel

บริบทการออกแบบอยู่ที่ `docs/architecture.md` คู่มือพัฒนาอยู่ที่ `CLAUDE.md`

## พัฒนาบนเครื่อง

ใช้ Node.js 22 และติดตั้ง dependency จาก lockfile

คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ค่าจาก Supabase Project Settings → API

```bash
npm ci
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000) — หน้าแรกจะพาไป `/dashboard` (ต้อง login)

บนเครื่องที่ repo อยู่บน mapped network drive ต้องคง flag `--webpack` ใน `dev`/`build` ไว้ (Turbopack resolve path ผิดบน UNC)

## Production (VPS)

รันด้วย `npm start` หลัง Nginx — ฟังแค่ `127.0.0.1` ไม่เปิดพอร์ตออกเน็ตตรง

อัปเดตด้วย `npm run deploy` จากเครื่องพัฒนา สคริปต์จะตรวจว่า VPS ไม่มีไฟล์ค้าง, ดึง Git แบบ fast-forward, ติดตั้งจาก lockfile, build แยกที่ `.next-new`, สลับ release เมื่อ build ผ่าน และคืน `.next-prev` อัตโนมัติถ้าเริ่มระบบไม่สำเร็จ

ตั้ง `NEXT_PUBLIC_SITE_URL` บน VPS เป็นโดเมนจริง (ใช้กับลิงก์ในอีเมลเชิญผู้ใช้)
