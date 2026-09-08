import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai, Prompt } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// ⚠️ Prompt ไม่ใช่ variable font — ต้องระบุ weight ที่ใช้ให้ครบทุกตัว
// ถ้าขาดตัวไหน เบราว์เซอร์จะ "ปลอม" น้ำหนักนั้นเอง (synthetic bold) ซึ่งภาษาไทยจะดูเละ
// 300/400/500/600/700 = ครบทุกน้ำหนักที่ระบบใช้จริง (font-light ถึง font-bold)
const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

// ── ฟอนต์สำหรับ "เอกสารที่พิมพ์ออกกระดาษ" เท่านั้น (สลิปเงินเดือน · ใบกำกับภาษี ·
//    หนังสือรับรองหัก ณ ที่จ่าย · ใบวางบิล · ตารางงาน · รายงาน) ─────────────────
// เจ้าของสั่งไว้ 2026-09-08: หน้าเว็บใช้ Prompt แต่ **เอกสารที่พิมพ์ต้องเป็น IBM Plex Sans Thai
// เหมือนเดิม** เพราะเอกสารที่ออกไปหาคนอื่น (พนักงาน/ลูกค้า/สรรพากร) มีรูปแบบที่ใช้มาตลอด
// จะได้ไม่ดูเหมือนเอกสารคนละชุดกับที่เคยส่งไปก่อนหน้า
//
// ⚠️ ถ้าจะเปลี่ยนฟอนต์หน้าเว็บอีกในอนาคต **ห้ามลบตัวนี้ทิ้งไปด้วย** — มันไม่ได้ถูกใช้บนจอเลย
// เลยดูเหมือนโค้ดตาย แต่มันคือฟอนต์ของกระดาษทุกใบที่ร้านออก
const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  variable: "--font-ibm-plex",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SNEAKER CARE — Service & Inventory System",
  description: "ระบบบริหารจัดการร้านซักรองเท้าและคลังสินค้า",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SneakerCare",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      suppressHydrationWarning
      className={`${prompt.variable} ${ibmPlexSansThai.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-slate-50 text-slate-900 antialiased selection:bg-teal-600 selection:text-white dark:bg-slate-950 dark:text-slate-100">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
