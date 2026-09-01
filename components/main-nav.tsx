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

const ICON_MAP: Record<string, React.ElementType> = {
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
  /** alert counts per module key — shows a red badge if > 0 */
  alerts?: Record<string, number>;
}

export function MainNav({ items, alerts = {} }: MainNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
      {items.map((item) => {
        const Icon = ICON_MAP[item.key] ?? LayoutDashboard;
        const alertCount = alerts[item.key] ?? 0;
        
        // Active check
        const isActive =
          item.href === "/dashboard"
            ? pathname === "/dashboard" || pathname === "/"
            : pathname.startsWith(item.href) || 
              (item.key === "inventory" && ["/stock-in", "/stock-out", "/adjustments", "/history", "/reports", "/admin/items"].some(p => pathname.startsWith(p))) ||
              (item.key === "settings" && ["/admin/users", "/admin/audit", "/admin/settings"].some(p => pathname.startsWith(p)));

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={true}
            className={`relative inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              isActive
                ? "bg-teal-700 text-white shadow-xs font-semibold hover:bg-teal-800"
                : "text-slate-600 hover:bg-teal-50 hover:text-teal-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-teal-400"
            }`}
          >
            <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-teal-600 dark:text-teal-400"}`} />
            <span>{item.label}</span>
            {/* ── Alert badge (e.g. low stock count) ── */}
            {alertCount > 0 && (
              <span
                className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center leading-none ${
                  isActive
                    ? "bg-amber-400 text-slate-900"
                    : "bg-rose-500 text-white"
                }`}
                title={`${alertCount} รายการที่ต้องดูแล`}
              >
                {alertCount > 99 ? "99+" : alertCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
