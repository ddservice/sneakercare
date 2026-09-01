"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Sparkles,
  Boxes,
  Wallet,
  TrendingUp,
  Settings,
  FileText,
  Landmark,
  Calendar,
} from "lucide-react";
import type { AppModule } from "@/lib/permissions";

export const ICON_MAP: Record<string, React.ElementType> = {
  dashboard: LayoutDashboard,
  pos: Sparkles,
  invoicing: FileText,
  inventory: Boxes,
  expenses: Wallet,
  roster: Calendar,
  "tax-filing": Landmark,
  statistics: TrendingUp,
  settings: Settings,
};

interface MainNavProps {
  items: readonly AppModule[];
  /** alert counts per module key — shown inline (never overlapping) */
  alerts?: Record<string, number>;
  /** in mobile drawer mode: close after click */
  onNavClick?: () => void;
}

/** Determine if a given href is currently active */
function useIsActive(href: string, key: string): boolean {
  const pathname = usePathname();
  if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
  if (pathname.startsWith(href)) return true;
  if (key === "inventory") {
    return ["/stock-in", "/stock-out", "/adjustments", "/history", "/reports", "/admin/items"].some(
      (p) => pathname.startsWith(p)
    );
  }
  if (key === "settings") {
    return ["/admin/users", "/admin/audit", "/admin/settings"].some((p) => pathname.startsWith(p));
  }
  return false;
}

/** Desktop horizontal tab strip */
export function MainNav({ items, alerts = {}, onNavClick }: MainNavProps) {
  return (
    <nav
      aria-label="Main navigation"
      className="flex items-center gap-0.5 overflow-x-auto scrollbar-none"
    >
      {items.map((item) => (
        <NavItem
          key={item.href}
          item={item}
          alertCount={alerts[item.key] ?? 0}
          onNavClick={onNavClick}
          variant="horizontal"
        />
      ))}
    </nav>
  );
}

/** Shared nav item used in both horizontal and vertical (drawer) mode */
export function NavItem({
  item,
  alertCount = 0,
  onNavClick,
  variant = "horizontal",
}: {
  item: AppModule;
  alertCount?: number;
  onNavClick?: () => void;
  variant?: "horizontal" | "vertical";
}) {
  const Icon = ICON_MAP[item.key] ?? LayoutDashboard;
  const isActive = useIsActive(item.href, item.key);

  if (variant === "vertical") {
    return (
      <Link
        href={item.href}
        prefetch
        onClick={onNavClick}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
          isActive
            ? "bg-emerald-500 text-white shadow-sm"
            : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
        }`}
      >
        <Icon className={`h-5 w-5 shrink-0 ${isActive ? "text-white" : "text-slate-400 dark:text-slate-500"}`} />
        <span className="flex-1">{item.label}</span>
        {/* Inline badge — never overlaps anything */}
        {alertCount > 0 && (
          <span
            className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none ${
              isActive ? "bg-white/20 text-white" : "bg-rose-500 text-white"
            }`}
          >
            {alertCount > 99 ? "99+" : alertCount}
          </span>
        )}
      </Link>
    );
  }

  // Horizontal tab (desktop)
  return (
    <Link
      href={item.href}
      prefetch
      onClick={onNavClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
        isActive
          ? "bg-emerald-500 text-white shadow-sm font-semibold"
          : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-slate-400 dark:text-slate-500"}`} />
      <span>{item.label}</span>
      {/* Inline badge — sits after label text, no absolute positioning */}
      {alertCount > 0 && (
        <span
          className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none shrink-0 ${
            isActive ? "bg-white/25 text-white" : "bg-rose-500 text-white"
          }`}
          title={`${alertCount} รายการที่ต้องดูแล`}
        >
          {alertCount > 99 ? "99+" : alertCount}
        </span>
      )}
    </Link>
  );
}
