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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, role, branch_id, is_active")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    redirect("/login");
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  return {
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
    role: profile.role,
    branch_id: profile.branch_id,
  };
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
