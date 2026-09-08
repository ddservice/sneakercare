"use client";

import { useActionState, useState } from "react";
import { changeOwnPassword, type UserActionState } from "@/app/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound } from "lucide-react";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<UserActionState, FormData>(changeOwnPassword, undefined);
  const [formKey, setFormKey] = useState(0);
  const [prev, setPrev] = useState(state);
  if (state !== prev) {
    setPrev(state);
    // ล้างช่องรหัสผ่านทิ้งหลังเปลี่ยนสำเร็จ — ไม่ควรค้างไว้บนหน้าจอ
    if (state?.success) setFormKey((k) => k + 1);
  }

  return (
    <form key={formKey} action={action} className="flex flex-col gap-4 max-w-md">
      <div className="flex flex-col gap-2">
        <Label htmlFor="current_password">รหัสผ่านเดิม</Label>
        <Input id="current_password" name="current_password" type="password" autoComplete="current-password" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="new_password">รหัสผ่านใหม่</Label>
        <Input id="new_password" name="new_password" type="password" autoComplete="new-password" minLength={12} required />
        <p className="text-[11px] text-slate-500">อย่างน้อย 12 ตัวอักษร · ห้ามซ้ำกับรหัสผ่านเดิม</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm_password">ยืนยันรหัสผ่านใหม่</Label>
        <Input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" minLength={12} required />
      </div>

      {state?.error && (
        <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 leading-relaxed border border-rose-200">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 leading-relaxed border border-emerald-200">
          เปลี่ยนรหัสผ่านเรียบร้อยแล้ว ครั้งต่อไปให้ใช้รหัสผ่านใหม่เข้าสู่ระบบ
        </p>
      )}

      <Button type="submit" disabled={pending} className="gap-1.5 self-start">
        <KeyRound className="h-4 w-4" />
        {pending ? "กำลังเปลี่ยน…" : "เปลี่ยนรหัสผ่าน"}
      </Button>
    </form>
  );
}
