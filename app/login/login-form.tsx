"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Lock,
  User,
} from "lucide-react";

const REMEMBER_KEY = "sc_remember_identifier";

function readRememberedIdentifier(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(REMEMBER_KEY) ?? "";
  } catch {
    return "";
  }
}

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [identifier] = useState(() => readRememberedIdentifier());

  function persistIdentifier(formData: FormData) {
    const value = String(formData.get("identifier") ?? "").trim();
    try {
      if (remember && value) window.localStorage.setItem(REMEMBER_KEY, value);
      else window.localStorage.removeItem(REMEMBER_KEY);
    } catch {
      /* เครื่องที่ปิด localStorage ยังล็อกอินได้ */
    }
  }

  return (
    <form
      action={(formData) => {
        persistIdentifier(formData);
        return action(formData);
      }}
      className="space-y-4"
    >
      {/* Identifier Input */}
      <div className="space-y-1.5">
        <Label htmlFor="identifier" className="text-xs font-semibold text-slate-700">
          ชื่อผู้ใช้ หรือ อีเมล
        </Label>
        <div className="relative">
          <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <Input
            id="identifier"
            name="identifier"
            type="text"
            placeholder="เช่น admin หรือ staff"
            autoComplete="username"
            defaultValue={identifier}
            required
            className="h-10 rounded-lg border-slate-300 bg-white pl-10 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 shadow-xs"
          />
        </div>
      </div>

      {/* Password Input */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
            รหัสผ่าน
          </Label>
        </div>
        <div className="relative">
          <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="current-password"
            required
            className="h-10 rounded-lg border-slate-300 bg-white pl-10 pr-10 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 shadow-xs"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs leading-5 text-slate-600">
        <input
          type="checkbox"
          name="remember"
          value="1"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-slate-300 text-teal-700"
        />
        <span>จดจำชื่อผู้ใช้ในเครื่องนี้</span>
      </label>

      {/* Error message */}
      {state?.error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <span>{state.error}</span>
        </div>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-lg bg-teal-700 font-semibold text-white hover:bg-teal-800 active:bg-teal-900 transition-all text-sm mt-2 shadow-xs"
      >
        {pending ? (
          <div className="flex items-center justify-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <span>กำลังตรวจสอบ...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <span>เข้าสู่ระบบ</span>
            <ArrowRight className="h-4 w-4" />
          </div>
        )}
      </Button>
    </form>
  );
}
