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
 * ตั้ง redirectTo มาที่ /login เดิมทั้งคู่) ถ้าใช่ → สร้าง session ชั่วคราวจาก token ใน URL เอง
 * ตรงๆ แล้วสลับไปแสดงฟอร์มตั้งรหัสผ่านใหม่แทนฟอร์มล็อกอินปกติ
 *
 * ⚠️ [แก้บั๊กจริง 2026-09-17] ก่อนหน้านี้ /login ไม่มี logic จุดนี้เลยสักบรรทัด — คลิกลิงก์เชิญ/
 * รีเซ็ตรหัสผ่านแล้วเจอแค่ฟอร์มล็อกอินธรรมดา ไม่มีทางตั้งรหัสผ่านได้เลย (พบตอนเชิญแอดมิน LUXSU
 * ครั้งแรก) ต้องแก้ไขปัญหาเฉพาะหน้าด้วยการตั้งรหัสผ่านให้ตรงๆ แทนทุกครั้งที่ผ่านมา
 *
 * ⚠️ [แก้รอบสอง — เจอจากการทดสอบจริงด้วยลิงก์ recovery จริงที่ generateLink() ออกให้]
 * รอบแรกพึ่ง `detectSessionInUrl` (ค่าเริ่มต้นของ supabase-js) ให้จัดการ hash fragment เอง
 * อัตโนมัติ แล้วรอผลผ่าน `getSession()` — ทดสอบจริงแล้วพบว่า **ไม่ทำงาน** กับ
 * `createBrowserClient()` ของ `@supabase/ssr` (พฤติกรรม auto-detect ไม่แน่นอนเมื่อรวมกับ
 * client ที่ sync session ผ่านคุกกี้แบบนี้) `getSession()` คืน session ว่างเปล่าตลอดทั้งที่ URL
 * มี access_token/refresh_token ที่ยังไม่หมดอายุอยู่จริง ⇒ ผู้ใช้เจอ "ลิงก์หมดอายุ" ทั้งที่ลิงก์ดีอยู่
 * **แก้โดยแกะ access_token/refresh_token จาก hash fragment เองตรงๆ แล้วเรียก
 * `setSession()` ตรงๆ** แทนการพึ่ง auto-detect — deterministic กว่าและพิสูจน์แล้วว่าทำงานจริง
 * (ทดสอบด้วยลิงก์ recovery จริงจาก `admin.auth.generateLink()` ไม่ใช่แค่เดาจากเอกสาร)
 *
 * รองรับ 2 รูปแบบ URL ที่ Supabase อาจส่งมา (ขึ้นกับ email template settings) — ยืนยันจริงแล้วว่า
 * โปรเจกต์นี้ใช้แบบที่ 1 (hash fragment) แต่เผื่อไว้ทั้งสองแบบไม่ต้องพึ่งการเดา:
 *   1. hash fragment แบบ implicit flow: #access_token=...&refresh_token=...&type=recovery|invite
 *   2. query string แบบ OTP: ?token_hash=...&type=recovery|invite (ต้องเรียก verifyOtp() เอง)
 */
export function AuthGate() {
  const [gate, setGate] = useState<GateState>({ status: "checking" });

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const searchParams = new URLSearchParams(window.location.search);

    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const hashType = hashParams.get("type");
    const tokenHash = searchParams.get("token_hash");
    const queryType = searchParams.get("type");

    const looksLikeAuthLink = !!(accessToken && refreshToken) || !!tokenHash;

    if (!looksLikeAuthLink) {
      setGate({ status: "login" });
      return;
    }

    const resolvedMode: "invite" | "recovery" =
      hashType === "invite" || queryType === "invite" ? "invite" : "recovery";

    (async () => {
      const supabase = createClient();

      if (accessToken && refreshToken) {
        // hash fragment — เซ็ต session เองตรงๆ จาก token ที่แกะมาแล้ว (พิสูจน์แล้วว่าทำงานจริง)
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        setGate(error ? { status: "link-expired" } : { status: "set-password", mode: resolvedMode });
        return;
      }

      if (tokenHash) {
        // query string แบบ OTP — ไม่มี access_token/refresh_token ให้แกะเอง ต้อง verifyOtp()
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: queryType === "invite" ? "invite" : "recovery",
        });
        setGate(error ? { status: "link-expired" } : { status: "set-password", mode: resolvedMode });
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
