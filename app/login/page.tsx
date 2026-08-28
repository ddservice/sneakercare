import { LoginForm } from "./login-form";
import { Footprints, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="min-h-svh w-full bg-[#0b0f19] flex flex-col justify-between items-center p-6 text-slate-200">
      {/* ── Top Header Bar ── */}
      <header className="w-full max-w-5xl flex items-center justify-between py-2 border-b border-slate-800/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600/20 text-teal-400 border border-teal-500/30">
            <Footprints className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold tracking-wider text-white uppercase">
            Sneaker Care
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-mono font-medium text-slate-400 bg-slate-800/80 border border-slate-700/60">
            v1.2
          </span>
        </div>
      </header>

      {/* ── Center Login Card ── */}
      <div className="w-full max-w-sm my-auto py-8">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8 shadow-xl backdrop-blur-sm">
          <div className="mb-6 space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-white">
              เข้าสู่ระบบ
            </h1>
            <p className="text-xs text-slate-400">
              ระบบบันทึกงานบริการ ยอดขาย และควบคุมสต๊อก
            </p>
          </div>

          <LoginForm />

          <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-center gap-1.5 text-[11px] text-slate-500 font-mono">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-500/80" />
            <span>PostgreSQL RLS Secured</span>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="w-full max-w-5xl flex flex-wrap items-center justify-between gap-4 py-4 text-xs text-slate-500 border-t border-slate-800/60">
        <div>
          © 2026 Sneaker Care. All rights reserved.
        </div>
        <div className="text-[11px]">
          DD Service Information Technology
        </div>
      </footer>
    </main>
  );
}
