import { LoginForm } from "./login-form";
import { Footprints, Sparkles, CheckCircle2, Shield, Boxes, Receipt, TrendingUp } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="relative min-h-svh w-full overflow-hidden bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-12">
      {/* ── Background Glow Effects ── */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-teal-600/20 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full bg-emerald-600/15 blur-[140px]" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[800px] w-[800px] rounded-full bg-indigo-950/40 blur-[180px]" />

      {/* Subtle grid texture overlay */}
      <div 
        className="pointer-events-none absolute inset-0 opacity-15"
        style={{
          backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px)`,
          backgroundSize: '24px 24px'
        }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-12 items-center lg:grid-cols-12">
        {/* ── Left Column: Brand Showcase & Value Proposition (7 cols) ── */}
        <div className="hidden lg:flex lg:col-span-7 flex-col space-y-8 text-white pr-6">
          {/* Brand Tag */}
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-teal-500/30 bg-teal-950/60 px-4 py-1.5 text-xs font-bold text-teal-300 backdrop-blur-md">
            <Sparkles className="h-4 w-4 text-teal-400" />
            <span>Sneaker Care Smart Management Platform 2.0</span>
          </div>

          {/* Headline */}
          <div className="space-y-4">
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl leading-tight">
              ระบบบริหารจัดการร้านซักรองเท้า <br />
              <span className="bg-gradient-to-r from-teal-400 via-emerald-300 to-cyan-400 bg-clip-text text-transparent">
                ครบวงจรและทรงพลังที่สุด
              </span>
            </h1>
            <p className="text-base text-slate-300 max-w-xl leading-relaxed">
              รวมงานบริการหน้าร้าน (POS), ติดตามสถานะงานซัก-ซ่อม, ควบคุมคลังน้ำยาตัดสต๊อกเป็นมิลลิลิตร (ml), และสรุปยอดกำไรแบบเรียลไทม์ไว้ในที่เดียว
            </p>
          </div>

          {/* Feature Highlights Grid */}
          <div className="grid gap-4 sm:grid-cols-2 pt-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-teal-500/20 p-2.5 text-teal-400 ring-1 ring-teal-400/30">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Smart POS & Service</h4>
                  <p className="text-xs text-slate-400">รับงาน ออกบิล ติดตามสถานะรองเท้า</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-teal-500/20 p-2.5 text-teal-400 ring-1 ring-teal-400/30">
                  <Boxes className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Precision Inventory</h4>
                  <p className="text-xs text-slate-400">ตัดสต๊อกน้ำยาเป็น ml คำนวณต้นทุน</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-teal-500/20 p-2.5 text-teal-400 ring-1 ring-teal-400/30">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Opex & Profit Analysis</h4>
                  <p className="text-xs text-slate-400">สรุปค่าใช้จ่าย กำไรสุทธิ และเงินเดือน</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-teal-500/20 p-2.5 text-teal-400 ring-1 ring-teal-400/30">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Enterprise Security</h4>
                  <p className="text-xs text-slate-400">PostgreSQL RLS & Audit Logs</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Column: Modern Glassmorphic Login Form (5 cols) ── */}
        <div className="lg:col-span-5 flex justify-center w-full">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
