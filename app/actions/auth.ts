"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type LoginState = { error?: string } | undefined;

// ── In-memory rate limiter (per-process, resets on server restart) ──
// ใช้ IP + username เป็น key เพื่อป้องกัน brute-force
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

function getRateLimitKey(identifier: string): string {
  return `login:${identifier.toLowerCase().trim()}`;
}

function checkRateLimit(key: string): { blocked: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || now > entry.resetAt) {
    return { blocked: false, remaining: MAX_ATTEMPTS, resetAt: now + LOCKOUT_MS };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const remainingMs = Math.ceil((entry.resetAt - now) / 1000);
    return { blocked: true, remaining: 0, resetAt: entry.resetAt };
  }

  return { blocked: false, remaining: MAX_ATTEMPTS - entry.count, resetAt: entry.resetAt };
}

function recordFailedAttempt(key: string): number {
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOCKOUT_MS });
    return MAX_ATTEMPTS - 1;
  }

  const newCount = entry.count + 1;
  loginAttempts.set(key, { count: newCount, resetAt: entry.resetAt });
  return Math.max(0, MAX_ATTEMPTS - newCount);
}

function clearAttempts(key: string): void {
  loginAttempts.delete(key);
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("identifier") ?? formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!identifier || !password) {
    return { error: "กรุณากรอกชื่อผู้ใช้หรืออีเมล และรหัสผ่าน" };
  }

  // ── Rate limit check ──
  const rlKey = getRateLimitKey(identifier);
  const rl = checkRateLimit(rlKey);

  if (rl.blocked) {
    const now = Date.now();
    const entry = loginAttempts.get(rlKey);
    const minutesLeft = entry ? Math.ceil((entry.resetAt - now) / 60000) : 5;
    return {
      error: `บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ในอีก ${minutesLeft} นาที (เกินจำนวนครั้งที่กำหนด)`,
    };
  }

  let email = identifier;

  // หากไม่มี @ ให้ค้นหา email จาก profiles.username
  if (!identifier.includes("@")) {
    try {
      const admin = createAdminClient();
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("id")
        .ilike("username", identifier)
        .maybeSingle();

      if (profileError || !profile) {
        const remaining = recordFailedAttempt(rlKey);
        const hint =
          remaining > 0
            ? ` (เหลือ ${remaining} ครั้งก่อนถูกล็อก)`
            : " — บัญชีถูกล็อกชั่วคราว 5 นาที";
        return { error: `ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง${hint}` };
      }

      const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.id);
      if (userError || !userData?.user?.email) {
        const remaining = recordFailedAttempt(rlKey);
        const hint =
          remaining > 0
            ? ` (เหลือ ${remaining} ครั้งก่อนถูกล็อก)`
            : " — บัญชีถูกล็อกชั่วคราว 5 นาที";
        return { error: `ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง${hint}` };
      }

      email = userData.user.email;
    } catch (err) {
      // ผู้ใช้เห็นแค่ข้อความทั่วไป (ไม่บอกรายละเอียดเพื่อความปลอดภัย) แต่ log ไว้ฝั่งเซิร์ฟเวอร์
      // เพราะ error ตรงนี้อาจเป็นบั๊กจริง (เช่น service_role key ผิด) ไม่ใช่แค่ "หา user ไม่เจอ"
      console.error("[login] ตรวจสอบชื่อผู้ใช้ล้มเหลว:", err);
      return { error: "เกิดข้อผิดพลาดในการตรวจสอบชื่อผู้ใช้" };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const remaining = recordFailedAttempt(rlKey);
    const hint =
      remaining > 0
        ? ` (เหลือ ${remaining} ครั้งก่อนถูกล็อก)`
        : " — บัญชีถูกล็อกชั่วคราว 5 นาที";
    return { error: `ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง${hint}` };
  }

  // ── Login success — clear rate limit counter ──
  clearAttempts(rlKey);
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
