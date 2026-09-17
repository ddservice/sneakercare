"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, ArrowRight, Eye, EyeOff, KeyRound } from "lucide-react";

/**
 * ฟอร์มตั้งรหัสผ่านใหม่ — ใช้ตอนคลิกลิงก์จากอีเมลเชิญ (invite) หรือลิงก์ตั้งรหัสผ่านใหม่
 * (recovery) เท่านั้น session ที่ใช้ตรงนี้มาจากการที่ AuthGate ตรวจ URL แล้วสร้าง session
 * ชั่วคราวให้แล้ว (ดู auth-gate.tsx) — ไม่ต้องขอรหัสผ่านเดิมเพราะการคลิกลิงก์ที่ยังไม่หมดอายุ
 * คือการยืนยันตัวตนอยู่แล้วในตัว (ต่างจาก /account ที่ต้องกรอกรหัสผ่านเดิมเพราะเป็น session ปกติ)
 */
export function SetPasswordForm({ mode }: { mode: "invite" | "recovery" }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 12) {
      setError("รหัสผ่านใหม่ต้องยาวอย่างน้อย 12 ตัวอักษร");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    if (updateError) {
      setPending(false);
      setError(`ตั้งรหัสผ่านไม่สำเร็จ: ${updateError.message}`);
      return;
    }

    // ⚠️ [แก้บั๊กจริง 2026-09-17 — พบตอนทดสอบด้วยลิงก์จริง] ยิง window.location.href ทันทีหลัง
    // updateUser() สำเร็จ เจอ middleware เด้งกลับมา /login เฉยๆ (ไม่มี error ให้เห็นเลย) —
    // ยืนยันด้วย scripts/test-login.mjs แยกว่ารหัสผ่านเปลี่ยนสำเร็จจริง แปลว่าปัญหาคือ cookie
    // session ที่ @supabase/ssr เขียนให้ยังไม่ flush ทันเวลาที่ browser ยิง request ถัดไป
    // (ทั้งสองอย่างเป็น async แข่งกัน) แก้โดยรอ getSession() (บังคับให้ client sync เสร็จก่อน)
    // แล้วหน่วงอีกเล็กน้อยกันเหนียว — ถ้ายัง auto-redirect ไม่ทันด้วยเหตุผลใดก็ตาม เปลี่ยนไป
    // แสดงข้อความสำเร็จ + ปุ่มกดเองแทน ไม่ปล่อยให้ผู้ใช้เจอหน้าเปล่าๆ ไม่รู้ว่าเกิดอะไรขึ้น
    await supabase.auth.getSession();
    await new Promise((resolve) => setTimeout(resolve, 400));
    setPending(false);
    setDone(true);
    window.location.href = "/dashboard";
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <KeyRound className="h-5 w-5" />
        </div>
        <p className="text-sm font-semibold text-slate-800">ตั้งรหัสผ่านสำเร็จแล้ว</p>
        <p className="text-xs text-slate-500">กำลังพาไปหน้าแดชบอร์ด...</p>
        <a href="/dashboard" className="text-xs font-medium text-teal-700 underline underline-offset-2">
          ถ้าไม่ไปเองภายในไม่กี่วินาที กดที่นี่
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs font-medium text-teal-800">
        <KeyRound className="h-4 w-4 shrink-0 text-teal-600" />
        <span>
          {mode === "invite"
            ? "ยินดีต้อนรับ — ตั้งรหัสผ่านของคุณก่อนเข้าใช้งานครั้งแรก"
            : "ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ"}
        </span>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new_password" className="text-xs font-semibold text-slate-700">
          รหัสผ่านใหม่
        </Label>
        <div className="relative">
          <Input
            id="new_password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={12}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="h-10 rounded-lg border-slate-300 bg-white pr-10 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-[11px] text-slate-500">อย่างน้อย 12 ตัวอักษร</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm_password" className="text-xs font-semibold text-slate-700">
          ยืนยันรหัสผ่านใหม่
        </Label>
        <Input
          id="confirm_password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={12}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="h-10 rounded-lg border-slate-300 bg-white text-sm"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-lg bg-teal-700 font-semibold text-white hover:bg-teal-800 active:bg-teal-900 transition-all text-sm mt-2 shadow-xs"
      >
        {pending ? (
          <div className="flex items-center justify-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <span>กำลังบันทึก...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <span>ตั้งรหัสผ่านและเข้าสู่ระบบ</span>
            <ArrowRight className="h-4 w-4" />
          </div>
        )}
      </Button>
    </form>
  );
}
