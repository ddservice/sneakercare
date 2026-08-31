"use client";

import { useEffect } from "react";
import { RefreshCw, LogIn } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global Error Caught:", error);
  }, [error]);

  return (
    <html lang="th">
      <body className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans text-slate-100">
        <div className="w-full max-w-md rounded-2xl bg-slate-800 p-6 sm:p-8 shadow-2xl border border-slate-700 text-center space-y-5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/30">
            <RefreshCw className="h-7 w-7 animate-spin-slow" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold tracking-tight text-white">
              กำลังรีเฟรชการเชื่อมต่อระบบ
            </h2>
            <p className="text-xs text-slate-400">
              เซสชันการเข้าสู่ระบบหมดอายุหรือมีข้อมูลเวอร์ชันใหม่ กรุณากดลองใหม่หรือเข้าสู่ระบบอีกครั้ง
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => {
                window.location.reload();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md"
            >
              <RefreshCw className="h-4 w-4" /> โหลดหน้าเว็บใหม่อีกครั้ง
            </button>

            <a
              href="/login"
              className="w-full py-2.5 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition-all border border-slate-600"
            >
              <LogIn className="h-4 w-4" /> กลับสู่หน้าเข้าสู่ระบบ
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
