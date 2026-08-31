import { requireProfile } from "@/lib/auth";
import { getSelectedBranchId, getActiveBranches } from "@/lib/branch";
import { mainNavItemsFor, ROLE_LABEL } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/actions/auth";
import { Toaster } from "@/components/ui/sonner";
import { BranchPicker } from "@/components/branch-picker";
import { MainNav } from "@/components/main-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Footprints, LogOut, Shield } from "lucide-react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const selectedBranchId = await getSelectedBranchId(profile);

  let branchName = "ทุกสาขา";
  const branches = await getActiveBranches();

  if (selectedBranchId) {
    branchName = branches?.find((branch) => branch.id === selectedBranchId)?.name ?? branchName;
  }

  const mainNav = mainNavItemsFor(profile.role);

  return (
    <div className="flex min-h-svh flex-col bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
      {/* ── Brand Banner & Header ── */}
      <header className="border-b border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {/* Logo & Title */}
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-600 ring-1 ring-teal-500/20 dark:bg-teal-950 dark:text-teal-400">
              <Footprints className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-teal-900 dark:text-teal-100">Sneaker Care</h1>
                <span className="rounded-md bg-teal-100/80 px-2 py-0.5 text-[11px] font-semibold text-teal-800 dark:bg-teal-900/60 dark:text-teal-300">
                  {branchName}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ระบบบริหารจัดการร้านซักรองเท้าและควบคุมคลังสินค้าอัจฉริยะ
              </p>
            </div>
          </div>

          {/* User badge & Actions */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {profile.role === "admin" && (
              <BranchPicker branches={branches ?? []} selectedBranchId={selectedBranchId} />
            )}

            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300">
              <Shield className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
              <span className="font-semibold text-teal-700 dark:text-teal-300">
                {ROLE_LABEL[profile.role]}
              </span>
              <span className="text-slate-400 dark:text-slate-600">|</span>
              <span className="font-medium">{profile.display_name}</span>
            </div>

            {/* Dark / Light Mode Icon-only Switch */}
            <ThemeToggle />

            <form action={logout}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/50"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">ออกจากระบบ</span>
              </Button>
            </form>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2 sm:px-6 dark:border-slate-800/60 dark:bg-slate-900/50">
          <div className="mx-auto max-w-7xl">
            <MainNav items={mainNav} />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>

      <Toaster />
    </div>
  );
}
