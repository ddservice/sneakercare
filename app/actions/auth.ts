"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type LoginState = { error?: string } | undefined;

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("identifier") ?? formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!identifier || !password) {
    return { error: "กรุณากรอกชื่อผู้ใช้หรืออีเมล และรหัสผ่าน" };
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
        return { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };
      }

      const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.id);
      if (userError || !userData?.user?.email) {
        return { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };
      }

      email = userData.user.email;
    } catch {
      return { error: "เกิดข้อผิดพลาดในการตรวจสอบชื่อผู้ใช้" };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
