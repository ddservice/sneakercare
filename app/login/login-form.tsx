"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Footprints,
  User,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  Sparkles,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="w-full max-w-md">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-8 shadow-2xl backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/90 sm:p-10">
        {/* Glow Accent */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-teal-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl" />

        {/* Brand Header inside card for mobile */}
        <div className="mb-8 text-center sm:text-left">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-400 text-white shadow-lg shadow-teal-500/25 mb-4">
            <Footprints className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            ยินดีต้อนรับสู่ <span className="bg-gradient-to-r from-teal-600 to-emerald-500 bg-clip-text text-transparent">Sneaker Care</span>
          </h2>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            ระบบบริหารจัดการร้านซักรองเท้าและควบคุมคลังสินค้าอัจฉริยะ
          </p>
        </div>

        {/* Form */}
        <form action={action} className="space-y-5">
          {/* Identifier Input */}
          <div className="space-y-1.5">
            <Label htmlFor="identifier" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              ชื่อผู้ใช้ หรือ อีเมล (Username / Email)
            </Label>
            <div className="relative">
              <User className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <Input
                id="identifier"
                name="identifier"
                type="text"
                placeholder="เช่น admin หรือ staff1"
                autoComplete="username"
                required
                className="h-11 rounded-xl border-slate-200 bg-slate-50/75 pl-10 text-sm font-medium text-slate-900 transition-all focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-slate-800/60 dark:text-white dark:focus:bg-slate-900"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                รหัสผ่าน (Password)
              </Label>
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className="h-11 rounded-xl border-slate-200 bg-slate-50/75 pl-10 pr-10 text-sm font-medium text-slate-900 transition-all focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-slate-800/60 dark:text-white dark:focus:bg-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Error message */}
          {state?.error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{state.error}</span>
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={pending}
            className="h-12 w-full rounded-xl bg-gradient-to-r from-teal-600 via-teal-700 to-emerald-600 font-bold text-white shadow-lg shadow-teal-600/25 transition-all hover:from-teal-700 hover:to-emerald-700 hover:shadow-xl hover:shadow-teal-600/35 hover:-translate-y-0.5 active:translate-y-0"
          >
            {pending ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>กำลังเข้าสู่ระบบ...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <span>เข้าสู่ระบบ</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            )}
          </Button>
        </form>

        {/* Footer Security Notice */}
        <div className="mt-8 flex items-center justify-center gap-2 text-[11px] font-medium text-slate-400 dark:text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
          <span>ระบบรักษาความปลอดภัยมาตรฐาน PostgreSQL RLS & Audit Trail</span>
        </div>
      </div>
    </div>
  );
}
