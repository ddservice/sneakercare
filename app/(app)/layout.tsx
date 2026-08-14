import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { navItemsFor, ROLE_LABEL } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/actions/auth";
import { Toaster } from "@/components/ui/sonner";
import { BranchPicker } from "@/components/branch-picker";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const selectedBranchId = await getSelectedBranchId(profile);

  let branchName = "ทุกสาขา";
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  if (selectedBranchId) {
    branchName = branches?.find((branch) => branch.id === selectedBranchId)?.name ?? branchName;
  }

  const visibleNav = navItemsFor(profile.role);

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-semibold">คลังสินค้า — {branchName}</span>
          {profile.role === "admin" && (
            <BranchPicker branches={branches ?? []} selectedBranchId={selectedBranchId} />
          )}
          <nav className="flex flex-wrap gap-1">
            {visibleNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {profile.display_name} ({ROLE_LABEL[profile.role]})
          </span>
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">
              ออกจากระบบ
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 bg-muted/30 p-4 sm:p-6">{children}</main>
      <Toaster />
    </div>
  );
}
