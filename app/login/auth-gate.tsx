"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LoginForm } from "./login-form";
import { SetPasswordForm } from "./set-password-form";

type GateState =
  | { status: "checking" }
  | { status: "login" }
  | { status: "set-password"; mode: "invite" | "recovery" }
  | { status: "link-expired" };

/**
 * ตรวจ URL ตอนโหลดหน้า /login ว่ามาจากลิงก์เชิญ (invite) หรือลิงก์ตั้งรหัสผ่านใหม่ (recovery)
 * ของ Supabase หรือไม่ (ทั้ง `inviteUser()` และ `sendPasswordReset()` ใน app/actions/users.ts
 * ตั้ง redirectTo มาที่ /login เดิมทั้งคู่) ถ้าใช่ → ให้ Supabase สร้าง session ชั่วคราวจาก token
 * ใน URL แล้วสลับไปแสดงฟอร์มตั้งรหัสผ่านใหม่แทนฟอร์มล็อกอินปกติ
 *
 * ⚠️ [แก้บั๊กจริง 2026-09-17] ก่อนหน้านี้ /login ไม่มี logic จุดนี้เลยสักบรรทัด — คลิกลิงก์เชิญ/
 * รีเซ็ตรหัสผ่านแล้วเจอแค่ฟอร์มล็อกอินธรรมดา ไม่มีทางตั้งรหัสผ่านได้เลย (พบตอนเชิญแอดมิน LUXSU
 * ครั้งแรก) ต้องแก้ไขปัญหาเฉพาะหน้าด้วยการตั้งรหัสผ่านให้ตรงๆ แทนทุกครั้งที่ผ่านมา
 *
 * รองรับ 2 รูปแบบ URL ที่ Supabase อาจส่งมา (ขึ้นกับ email template settings) ไม่ต้องรู้ล่วงหน้า
 * ว่าโปรเจกต์นี้ตั้งค่าแบบไหน:
 *   1. hash fragment แบบ implicit flow: #access_token=...&type=recovery|invite
 *      (detectSessionInUrl ของ supabase-js อ่านให้อัตโนมัติตอนสร้าง client)
 *   2. query string แบบ OTP: ?token_hash=...&type=recovery|invite
 *      (ต้องเรียก verifyOtp() เองตรงๆ ก่อน ไม่ auto-detect)
 */
export function AuthGate() {
  const [gate, setGate] = useState<GateState>({ status: "checking" });

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const queryType = params.get("type");
    const hashHasRecoveryOrInvite =
      hash.includes("type=recovery") || hash.includes("type=invite");
    const looksLikeAuthLink =
      hashHasRecoveryOrInvite ||
      queryType === "recovery" ||
      queryType === "invite" ||
      !!tokenHash ||
      params.has("code");

    if (!looksLikeAuthLink) {
      setGate({ status: "login" });
      return;
    }

    const resolvedMode: "invite" | "recovery" =
      queryType === "invite" || hash.includes("type=invite") ? "invite" : "recovery";

    (async () => {
      const supabase = createClient();

      // รูปแบบ OTP query string ต้อง verifyOtp() เองตรงๆ — detectSessionInUrl ไม่จับให้
      if (tokenHash && (queryType === "recovery" || queryType === "invite")) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: queryType === "invite" ? "invite" : "recovery",
        });
        if (error) {
          setGate({ status: "link-expired" });
          return;
        }
      }

      // รูปแบบ hash fragment (implicit) หรือ PKCE code — supabase-js จัดการให้อัตโนมัติแล้ว
      // ตอนสร้าง client ด้านบน (detectSessionInUrl: true เป็นค่าเริ่มต้น) แค่รอผลผ่าน getSession()
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setGate({ status: "set-password", mode: resolvedMode });
      } else {
        setGate({ status: "link-expired" });
      }
    })();
  }, []);

  if (gate.status === "checking") {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  if (gate.status === "link-expired") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
          ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว — กรุณาขอลิงก์ใหม่จากผู้ดูแลระบบ หรือเข้าสู่ระบบด้วยรหัสผ่านที่มีอยู่
        </div>
        <LoginForm />
      </div>
    );
  }

  if (gate.status === "set-password") {
    return <SetPasswordForm mode={gate.mode} />;
  }

  return <LoginForm />;
}
