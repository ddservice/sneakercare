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
  ScanLine,
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
  "expenses-ocr": ScanLine,
  "tax-filing": Landmark,
  statistics: TrendingUp,
  settings: Settings,
};

export function MainNav({ items }: { items: readonly AppModule[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
      {items.map((item) => {
        const Icon = ICON_MAP[item.key] ?? LayoutDashboard;
        
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
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              isActive
                ? "bg-teal-700 text-white shadow-xs font-semibold hover:bg-teal-800"
                : "text-slate-600 hover:bg-teal-50 hover:text-teal-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-teal-400"
            }`}
          >
            <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-teal-600 dark:text-teal-400"}`} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
