import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canView, canWrite, type ModuleKey } from "@/lib/permissions";

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  role: "admin" | "co_admin" | "staff";
  branch_id: string | null;
};

export const requireProfile = cache(async (): Promise<Profile> => {
  try {
    const supabase = await createClient();
    let user = null;

    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data?.user) {
        user = data.user;
      }
    } catch {
      // Stale refresh token or auth error -> redirect to login
      user = null;
    }

    if (!user) {
      redirect("/login");
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, role, branch_id, is_active")
      .eq("id", user.id)
      .single();

    if (error || !profile || !profile.is_active) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
      redirect("/login");
    }

    const rawRole = String(profile.role ?? "staff").toLowerCase().replace("-", "_");
    const role: "admin" | "co_admin" | "staff" =
      rawRole === "admin" ? "admin" : rawRole === "co_admin" ? "co_admin" : "staff";

    return {
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name || profile.username || "ผู้ใช้",
      role,
      branch_id: profile.branch_id,
    };
  } catch (err: any) {
    if (err?.digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    redirect("/login");
  }
});

export function requireAdmin(profile: Profile) {
  if (profile.role !== "admin") {
    redirect("/dashboard");
  }
}

export function requireModuleView(profile: Profile, key: ModuleKey) {
  if (!canView(profile.role, key)) {
    redirect("/dashboard");
  }
}

export function requireModuleWrite(profile: Profile, key: ModuleKey) {
  if (!canWrite(profile.role, key)) {
    redirect("/dashboard");
  }
}
