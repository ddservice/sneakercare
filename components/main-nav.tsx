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
import { cn } from "@/lib/utils";

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
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        )}
      >
        <Icon
          className={cn(
            "h-5 w-5 shrink-0",
            isActive ? "text-emerald-600 dark:text-emerald-300" : "text-slate-400 dark:text-slate-500"
          )}
        />
        <span className="flex-1 leading-5">{item.label}</span>
        {/* Inline badge — never overlaps anything */}
        {alertCount > 0 && (
          <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold leading-none text-white"
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
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2 text-[13px] font-medium leading-5 transition-colors xl:px-3 xl:text-sm",
        isActive
          ? "border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300"
          : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
      )}
    >
      <Icon
        className={cn(
          "hidden h-4 w-4 shrink-0 xl:block",
          isActive ? "text-emerald-600 dark:text-emerald-300" : "text-slate-400 dark:text-slate-500"
        )}
      />
      <span>{item.navLabel ?? item.label}</span>
      {/* Inline badge — sits after label text, no absolute positioning */}
      {alertCount > 0 && (
        <span
          className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white"
          title={`${alertCount} รายการที่ต้องดูแล`}
        >
          {alertCount > 99 ? "99+" : alertCount}
        </span>
      )}
    </Link>
  );
}
