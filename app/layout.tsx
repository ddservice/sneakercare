import type { Metadata } from "next";
import { Prompt } from "next/font/google";
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
      className={`${prompt.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-slate-50 text-slate-900 antialiased selection:bg-teal-600 selection:text-white dark:bg-slate-950 dark:text-slate-100">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
