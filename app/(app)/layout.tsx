import { requireProfile } from "@/lib/auth";
import { getSelectedBranchId, getActiveBranches } from "@/lib/branch";
import { mainNavItemsFor, ROLE_LABEL } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/actions/auth";
import { Toaster } from "@/components/ui/sonner";
import { BranchPicker } from "@/components/branch-picker";
import { MainNav } from "@/components/main-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Footprints, LogOut, ShieldCheck } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const selectedBranchId = await getSelectedBranchId(profile);

  let branchName = "ทุกสาขา";
  const branches = await getActiveBranches();

  if (selectedBranchId) {
    branchName = branches?.find((branch) => branch.id === selectedBranchId)?.name ?? branchName;
  }

  const mainNav = mainNavItemsFor(profile.role);

  // ── Low stock alert count for nav badge ──
  let lowStockCount = 0;
  try {
    const adminDb = createAdminClient();
    let q = (adminDb.from("item_stock" as any) as any).select("id, current_qty, min_stock_level", { count: "exact", head: false });
    if (selectedBranchId) q = q.eq("branch_id", selectedBranchId);
    const { data: stockRows } = await q;
    lowStockCount = (stockRows || []).filter((s: any) =>
      Number(s.current_qty ?? 0) <= Number(s.min_stock_level ?? 0)
    ).length;
  } catch {
    // non-fatal — badge just won't show
  }

  return (
    <div className="flex min-h-svh flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased">

      {/* ── Top Header ── */}
      <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-sm">

        {/* Brand row */}
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">

          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-sm">
              <Footprints className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                  Sneaker Care
                </span>
                <span className="hidden sm:inline-flex items-center rounded-md bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                  {branchName}
                </span>
              </div>
              <p className="hidden sm:block text-[11px] text-slate-400 dark:text-slate-500 leading-none mt-0.5">
                ระบบบริหารจัดการร้านซักรองเท้า
              </p>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {profile.role === "admin" && (
              <BranchPicker branches={branches ?? []} selectedBranchId={selectedBranchId} />
            )}

            {/* User badge */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                {ROLE_LABEL[profile.role]}
              </span>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span className="font-medium text-slate-600 dark:text-slate-300">
                {profile.display_name}
              </span>
            </div>

            {/* Theme toggle */}
            <ThemeToggle />

            {/* Logout */}
            <form action={logout}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
                title="ออกจากระบบ"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>

        {/* Nav row */}
        <div className="border-t border-slate-100 dark:border-slate-800/70 bg-slate-50/60 dark:bg-slate-900/60 px-4 sm:px-6 py-1.5">
          <div className="mx-auto max-w-7xl">
            <MainNav items={mainNav} alerts={{ inventory: lowStockCount }} />
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>

      <Toaster />
    </div>
  );
}
