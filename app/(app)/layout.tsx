import { requireProfile } from "@/lib/auth";
import { withId, text } from "@/lib/db-rows";
import { getSelectedBranchId, getActiveBranches } from "@/lib/branch";
import { mainNavItemsFor, ROLE_LABEL } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/actions/auth";
import { Toaster } from "@/components/ui/sonner";
import { BranchPicker, type BranchOption } from "@/components/branch-picker";
import { MainNav } from "@/components/main-nav";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Footprints, LogOut, UserCircle } from "lucide-react";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { tenantFilter } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const selectedBranchId = await getSelectedBranchId(profile);
  const branches = await getActiveBranches();
  const mainNav = mainNavItemsFor(profile.role);

  // ✅ [multi-tenant 2026-09-17] super_admin เห็นสาขาข้าม tenant ได้แล้ว แต่คนละ tenant อาจตั้ง
  // ชื่อสาขาซ้ำกันได้ (เช่น "SneakerCare" ทั้งคู่) — ส่งชื่อ tenant แยกจากชื่อสาขา ให้ตัวเลือก
  // แสดงเป็นสองบรรทัดแทนการต่อสตริงยาวๆ ในช่องเดียว
  let branchOptions: BranchOption[] = withId(branches).map((b) => ({ id: b.id, name: text(b.name) }));
  if (profile.role === "super_admin" && branches.length > 0) {
    const adminDbForNames = createAdminClient();
    const { data: tenantRows } = await adminDbForNames.from("tenants").select("id, name");
    const tenantNameById = new Map((tenantRows ?? []).map((t) => [t.id, t.name]));
    branchOptions = withId(branches).map((b) => ({
      id: b.id,
      name: text(b.name),
      tenantName: (b.tenant_id ? tenantNameById.get(b.tenant_id) : undefined) ?? "?",
    }));
  }

  const avatarLetter = profile.display_name.trim().slice(0, 1) || "?";

  // ── Low stock alert count for nav badge ──
  let lowStockCount = 0;
  try {
    const adminDb = createAdminClient();
    let q = adminDb.from("item_stock").select(
      "id, current_qty, min_stock_level, alert_muted"
    );
    if (selectedBranchId) {
      q = q.eq("branch_id", selectedBranchId);
    } else if (profile.role !== "super_admin") {
      // 🔴 [แก้ช่องโหว่จริง 2026-09-17] เดิมไม่มีการกรอง tenant เลยตรงนี้ — admin ของ tenant
      // ไหนก็ตามที่ "ดูทุกสาขา" (ไม่ได้เลือกสาขาเจาะจง) จะเห็น badge แจ้งเตือนสต๊อกต่ำที่นับรวม
      // ของทุก tenant ปนกันหมด ไม่ใช่แค่ tenant ของตัวเอง — super_admin ตั้งใจให้เห็นรวมทุก tenant
      // ได้ต่อไป (เป็นมุมมองระดับแพลตฟอร์ม) แต่ admin ปกติต้องกรองเฉพาะ tenant ตัวเองเท่านั้น
      const ownTenantId = await tenantFilter(profile);
      if (ownTenantId) {
        const { data: ownBranches } = await adminDb.from("inv_branches").select("id").eq("tenant_id", ownTenantId);
        const ownBranchIds = (ownBranches ?? []).map((b) => b.id);
        q = q.in("branch_id", ownBranchIds.length > 0 ? ownBranchIds : ["00000000-0000-0000-0000-000000000000"]);
      }
    }
    const { data: stockRows } = await q;
    // ไม่นับรายการที่ปิดแจ้งเตือนไว้ — ไม่งั้น badge จะขึ้นตัวเลขค้างที่พนักงานไม่มีทางเคลียร์ได้
    // (เพราะ Telegram ก็ไม่ส่งแจ้งรายการนั้นอยู่แล้วเช่นกัน ดู supabase/functions ที่ deploy จริง)
    lowStockCount = (stockRows || []).filter(
      (s) => !s.alert_muted && Number(s.current_qty ?? 0) <= Number(s.min_stock_level ?? 0)
    ).length;
  } catch {
    // non-fatal — badge just won't show
  }

  const alerts = { inventory: lowStockCount };

  return (
    <div id="app-shell" className="flex min-h-svh flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased">

      {/* ══════════════════════════════════════════════
          Top Header (sticky, glassmorphism)
          ══════════════════════════════════════════════ */}
      <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-sm">

        {/* ── Brand row ── */}
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">

          {/* Left: Mobile hamburger + Logo */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger — visible ONLY on < lg */}
            <MobileNav
              items={mainNav}
              alerts={alerts}
              brandName="DD-Management"
              roleBadge={ROLE_LABEL[profile.role]}
              displayName={profile.display_name}
            />

            {/* Logo icon */}
            <div className="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-sm">
              <Footprints className="h-5 w-5" />
            </div>

            {/* Brand text */}
            <div className="min-w-0">
              <span className="block truncate text-base font-bold tracking-tight text-slate-900 dark:text-white">
                DD-Management
              </span>
              <p className="hidden sm:block text-[11px] text-slate-400 dark:text-slate-500 leading-none mt-0.5">
                ระบบบริหารจัดการร้าน
              </p>
            </div>
          </div>

          {/* Right: actions */}
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
            {(profile.role === "admin" || profile.role === "super_admin") && (
              <BranchPicker branches={branchOptions} selectedBranchId={selectedBranchId} />
            )}

            {/* User chip — hidden on mobile (shown in drawer instead) */}
            <div className="hidden md:flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pr-3 pl-1 dark:border-slate-700 dark:bg-slate-800">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">
                {avatarLetter}
              </span>
              <span className="min-w-0 text-left">
                <span className="block max-w-28 truncate text-xs font-semibold leading-tight text-slate-800 dark:text-slate-100">
                  {profile.display_name}
                </span>
                <span className="block text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                  {ROLE_LABEL[profile.role]}
                </span>
              </span>
            </div>

            {/* ทางเข้าหน้าบัญชีของฉัน — ทุก role เข้าได้ (เปลี่ยนรหัสผ่านของตัวเอง)
                จงใจไม่ใส่ในเมนูหลัก เพราะไม่ใช่งานประจำวัน แต่ต้องหาเจอง่ายจากชื่อผู้ใช้ */}
            <Link
              href="/account"
              title="บัญชีของฉัน (เปลี่ยนรหัสผ่าน)"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <UserCircle className="h-4 w-4" />
            </Link>

            <ThemeToggle />

            <form action={logout}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-full text-slate-400 dark:text-slate-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
                title="ออกจากระบบ"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>

        {/* ── Desktop Nav row (hidden on < lg — drawer handles it) ── */}
        <div className="hidden lg:block border-t border-slate-100 dark:border-slate-800/70 bg-slate-50/60 dark:bg-slate-900/60 px-4 sm:px-6 py-1.5">
          <div className="mx-auto max-w-7xl">
            <MainNav items={mainNav} alerts={alerts} />
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
