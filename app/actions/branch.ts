"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ACTIVE_BRANCH_COOKIE } from "@/lib/branch";
import { requireProfile, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function setActiveBranch(branchId: string) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const id = branchId.trim();
  const cookieStore = await cookies();

  if (!id) {
    cookieStore.delete(ACTIVE_BRANCH_COOKIE);
  } else {
    const supabase = await createClient();
    const { data } = await supabase.from("branches").select("id").eq("id", id).maybeSingle();
    if (!data) {
      cookieStore.delete(ACTIVE_BRANCH_COOKIE);
    } else {
      cookieStore.set(ACTIVE_BRANCH_COOKIE, id, {
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }

  // บังคับให้ layout + ทุกหน้าที่อ่านคุกกี้นี้วาดใหม่ — ฝั่ง client ยังต้อง router.refresh()
  // ต่อด้วย เพราะ RSC ในรอบเดียวกับ Server Action มักยังเห็นคุกกี้ชุดเก่า
  revalidatePath("/", "layout");
}
