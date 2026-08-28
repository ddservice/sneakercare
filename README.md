# ระบบบริหารจัดการคลังสินค้า

คลังสินค้าสำหรับร้านบริการทำความสะอาด/ซ่อมแซมรองเท้า — แทนระบบเดิมที่เป็น Google Apps Script + Sheets

- Frontend: Next.js (App Router) + Tailwind CSS + shadcn/ui
- Backend: Supabase (PostgreSQL + Auth + RLS + Edge Functions)
- Hosting: VPS (PM2 + Nginx) + Supabase Cloud — ไม่ใช้ Vercel

บริบทการออกแบบอยู่ที่ `docs/architecture.md` คู่มือพัฒนาอยู่ที่ `CLAUDE.md`

## พัฒนาบนเครื่อง

คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ค่าจาก Supabase Project Settings → API

```bash
npm install
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000) — หน้าแรกจะพาไป `/dashboard` (ต้อง login)

บนเครื่องที่ repo อยู่บน mapped network drive ต้องคง flag `--webpack` ใน `dev`/`build` ไว้ (Turbopack resolve path ผิดบน UNC)

## Production (VPS)

รันด้วย `npm start` หลัง Nginx — ฟังแค่ `127.0.0.1` ไม่เปิดพอร์ตออกเน็ตตรง

อัปเดตบนเซิร์ฟเวอร์แบบเดียวกับเว็บร้านอื่น: `git pull` → `npm run build` → `pm2 restart`

ตั้ง `NEXT_PUBLIC_SITE_URL` บน VPS เป็นโดเมนจริง (ใช้กับลิงก์ในอีเมลเชิญผู้ใช้)
