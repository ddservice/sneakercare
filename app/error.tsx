"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, LogIn } from "lucide-react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4 text-center text-white">
      <div className="w-full max-w-md space-y-6 rounded-3xl bg-slate-800/80 p-8 shadow-2xl backdrop-blur-md border border-slate-700">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40">
          <AlertTriangle className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight">เซสชันหมดอายุ หรือ เกิดข้อผิดพลาด</h2>
          <p className="text-xs text-slate-400">
            เซสชันการเข้าสู่ระบบของคุณอาจหมดอายุ หรือเครือข่ายมีการเชื่อมต่อใหม่ กรุณาลองใหม่อีกครั้งหรือเข้าสู่ระบบใหม่
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            onClick={() => reset()}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs gap-2 h-10 rounded-xl"
          >
            <RefreshCw className="h-4 w-4" /> ลองโหลดใหม่
          </Button>

          <Link
            href="/login"
            className="flex-1 flex items-center justify-center bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs gap-2 h-10 rounded-xl transition-all"
          >
            <LogIn className="h-4 w-4" /> ไปหน้าเข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </div>
  );
}
