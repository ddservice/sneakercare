import { LoginForm } from "./login-form";
import { Footprints } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="min-h-svh w-full bg-slate-50 flex flex-col justify-between items-center p-6 text-slate-800">
      {/* ── Top Header Bar ── */}
      <header className="w-full max-w-5xl flex items-center justify-between py-2 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-200">
            <Footprints className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold tracking-wider text-slate-900 uppercase">
            Sneaker Care
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200">
            v1.2
          </span>
        </div>
      </header>

      {/* ── Center Login Card ── */}
      <div className="w-full max-w-sm my-auto py-8">
        <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          <div className="mb-6 space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              เข้าสู่ระบบ
            </h1>
            <p className="text-xs text-slate-500">
              ระบบบันทึกงานบริการ ยอดขาย และควบคุมสต๊อก
            </p>
          </div>

          <LoginForm />
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="w-full max-w-5xl flex flex-wrap items-center justify-between gap-4 py-4 text-xs text-slate-500 border-t border-slate-200">
        <div>
          © 2026 Sneaker Care. All rights reserved.
        </div>
        <div className="text-[11px]">
          DD Service
        </div>
      </footer>
    </main>
  );
}
