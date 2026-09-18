"use client";

import { usePathname } from "next/navigation";
import { Calendar, Footprints } from "lucide-react";
import { UnderlineNav } from "@/components/underline-nav";

const ITEMS = [
  { id: "/pos", label: "รับงาน", href: "/pos", icon: Footprints },
  { id: "/pos/daily-entry", label: "ยอดสรุปรายวัน", href: "/pos/daily-entry", icon: Calendar },
] as const;

export function PosNav() {
  const pathname = usePathname();
  const value = pathname.startsWith("/pos/daily-entry") ? "/pos/daily-entry" : "/pos";
  return <UnderlineNav items={ITEMS} value={value} aria-label="เมนูงานบริการ" className="print:hidden" />;
}
