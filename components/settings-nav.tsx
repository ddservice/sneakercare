"use client";

import { usePathname } from "next/navigation";
import { ShieldAlert, Store, Users } from "lucide-react";
import { UnderlineNav } from "@/components/underline-nav";

const ITEMS = [
  { id: "/settings", label: "ร้านและเอกสาร", href: "/settings", icon: Store },
  { id: "/admin/users", label: "ผู้ใช้และสิทธิ์", href: "/admin/users", icon: Users },
  { id: "/admin/audit", label: "ประวัติการใช้งาน", href: "/admin/audit", icon: ShieldAlert },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  const value = ITEMS.find((item) =>
    item.id === "/settings" ? pathname === "/settings" : pathname.startsWith(item.id)
  )?.id ?? "/settings";
  return <UnderlineNav items={ITEMS} value={value} aria-label="เมนูตั้งค่า" className="print:hidden" />;
}
