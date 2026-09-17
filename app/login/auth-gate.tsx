"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { useIsMounted } from "@/lib/use-is-mounted";
import { LoginForm } from "./login-form";
import { SetPasswordForm } from "./set-password-form";

type AuthLink =
  | { kind: "none" }
  | { kind: "hash"; accessToken: string; refreshToken: string; mode: "invite" | "recovery" }
  | { kind: "otp"; tokenHash: string; mode: "invite" | "recovery" };

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
 *
 * ⚠️ [2026-09-17] ห้ามอ่าน `window.location` แล้ว `setState` ตรงๆ ใน `useEffect` — CI แดงที่
 * `react-hooks/set-state-in-effect`. URL (โดยเฉพาะ hash fragment) ไม่เคยไปถึงเซิร์ฟเวอร์
 * จึงใช้ `useSyncExternalStore` อ่านฝั่ง client หลัง hydrate แล้วเรียก `setSession` เฉพาะตอน
 * มี token จริง (setState เกิดหลัง await ไม่ใช่ในลำตัว effect)
 */
function parseAuthLink(hash: string, search: string): AuthLink {
  const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
  const searchParams = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  const tokenHash = searchParams.get("token_hash");
  const mode: "invite" | "recovery" =
    hashParams.get("type") === "invite" || searchParams.get("type") === "invite"
      ? "invite"
      : "recovery";

  if (accessToken && refreshToken) {
    return { kind: "hash", accessToken, refreshToken, mode };
  }
  if (tokenHash) {
    return { kind: "otp", tokenHash, mode };
  }
  return { kind: "none" };
}

function subscribeAuthUrl(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  window.addEventListener("popstate", onStoreChange);
  return () => {
    window.removeEventListener("hashchange", onStoreChange);
    window.removeEventListener("popstate", onStoreChange);
  };
}

function getAuthUrlKey() {
  return `${window.location.hash}\n${window.location.search}`;
}

function getServerAuthUrlKey() {
  return "";
}

export function AuthGate() {
  const mounted = useIsMounted();
  const urlKey = useSyncExternalStore(subscribeAuthUrl, getAuthUrlKey, getServerAuthUrlKey);
  const [hash = "", search = ""] = urlKey.split("\n");
  const link = parseAuthLink(hash, search);
  const [session, setSession] = useState<"ok" | "expired" | null>(null);

  useEffect(() => {
    const current = parseAuthLink(hash, search);
    if (current.kind === "none") return;

    let cancelled = false;
    const supabase = createClient();

    (async () => {
      const { error } =
        current.kind === "hash"
          ? await supabase.auth.setSession({
              access_token: current.accessToken,
              refresh_token: current.refreshToken,
            })
          : await supabase.auth.verifyOtp({
              token_hash: current.tokenHash,
              type: current.mode === "invite" ? "invite" : "recovery",
            });
      if (!cancelled) setSession(error ? "expired" : "ok");
    })();

    return () => {
      cancelled = true;
    };
  }, [hash, search]);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  if (link.kind === "none") {
    return <LoginForm />;
  }

  if (session === "expired") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
          ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว — กรุณาขอลิงก์ใหม่จากผู้ดูแลระบบ หรือเข้าสู่ระบบด้วยรหัสผ่านที่มีอยู่
        </div>
        <LoginForm />
      </div>
    );
  }

  if (session === "ok") {
    return <SetPasswordForm mode={link.mode} />;
  }

  return (
    <div className="flex items-center justify-center py-8">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
    </div>
  );
}
