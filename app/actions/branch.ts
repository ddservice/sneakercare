"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ACTIVE_BRANCH_COOKIE } from "@/lib/branch";
import { requireProfile, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function setActiveBranch(formData: FormData) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const branchId = String(formData.get("branch_id") ?? "").trim();
  const cookieStore = await cookies();

  if (!branchId) {
    cookieStore.delete(ACTIVE_BRANCH_COOKIE);
  } else {
    const supabase = await createClient();
    const { data } = await supabase.from("branches").select("id").eq("id", branchId).maybeSingle();
    if (!data) {
      cookieStore.delete(ACTIVE_BRANCH_COOKIE);
    } else {
      cookieStore.set(ACTIVE_BRANCH_COOKIE, branchId, {
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }

  revalidatePath("/", "layout");
}
