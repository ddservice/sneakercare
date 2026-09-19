import type { UserRole } from "@/lib/supabase/database.types";

export type Role = UserRole;

// ⚠️ ตั้งใจไม่ใส่ "super_admin" ใน ROLES — array นี้ใช้เป็นตัวเลือกใน dropdown เชิญผู้ใช้ที่
// /admin/users ซึ่งเปิดให้ role admin ของแต่ละ tenant กดใช้เอง ถ้าใส่ super_admin ไว้ที่นี่
// เท่ากับให้ admin ของ tenant ไหนก็ได้สร้างบัญชีที่มองเห็นข้อมูลข้าม tenant ได้เอง — ต้องสร้าง
// super_admin นอกช่องทางนี้เท่านั้น (ตรงๆ ผ่าน SQL โดยผู้ดูแลแพลตฟอร์ม)
export const ROLES = ["admin", "co_admin", "staff"] as const;

export const ROLE_LABEL: Record<Role, string> = {
  admin: "แอดมิน",
  co_admin: "ผู้ช่วย",
  staff: "พนักงาน",
  super_admin: "ผู้ดูแลระบบ",
};

export type ModuleKey =
  | "dashboard"
  | "pos"
  | "invoicing"
  | "inventory"
  | "expenses"
  | "roster"
  | "tax-filing"
  | "statistics"
  | "stock-out"
  | "stock-in"
  | "adjustments"
  | "history"
  | "reports"
  | "items"
  | "users"
  | "audit"
  | "settings";

export type AppModule = {
  key: ModuleKey;
  href: string;
  /** ชื่อเต็ม — ใช้ในเมนูมือถือ */
  label: string;
  /** ชื่อสั้นบนแถบเดสก์ท็อป ถ้าไม่ใส่ใช้ label */
  navLabel?: string;
  icon?: string;
  isMainTab?: boolean;
  viewRoles: readonly Role[];
  writeRoles: readonly Role[];
  note?: string;
};

// สิทธิ์นี้สอดคล้องกับ RLS / staff-safe views — UI เป็นด่านซ่อนปุ่มเท่านั้น
export const APP_MODULES: readonly AppModule[] = [
  // ── MAIN TABS ──
  {
    key: "dashboard",
    href: "/dashboard",
    label: "ภาพรวม",
    isMainTab: true,
    viewRoles: ["admin", "co_admin", "staff"],
    writeRoles: ["admin", "co_admin"],
  },
  {
    key: "pos",
    href: "/pos",
    label: "งานบริการ",
    navLabel: "งานบริการ",
    isMainTab: true,
    viewRoles: ["admin", "co_admin", "staff"],
    writeRoles: ["admin", "co_admin", "staff"],
  },
  {
    key: "invoicing",
    href: "/invoicing",
    label: "ออกเอกสาร",
    navLabel: "เอกสาร",
    isMainTab: true,
    viewRoles: ["admin", "co_admin"],
    writeRoles: ["admin", "co_admin"],
  },
  {
    key: "inventory",
    href: "/inventory",
    label: "คลังสินค้า",
    navLabel: "คลัง",
    isMainTab: true,
    viewRoles: ["admin", "co_admin", "staff"],
    writeRoles: ["admin", "co_admin", "staff"],
  },
  {
    key: "expenses",
    href: "/expenses",
    label: "ค่าใช้จ่าย",
    navLabel: "ค่าใช้จ่าย",
    isMainTab: true,
    viewRoles: ["admin", "co_admin"],
    writeRoles: ["admin", "co_admin"],
  },
  {
    key: "roster",
    href: "/roster",
    label: "ตารางงาน",
    navLabel: "ตารางงาน",
    isMainTab: true,
    viewRoles: ["admin", "co_admin", "staff"],
    writeRoles: ["admin", "co_admin"],
  },
  {
    key: "tax-filing",
    href: "/tax-filing",
    label: "ภาษี",
    navLabel: "ภาษี",
    isMainTab: true,
    viewRoles: ["admin"],
    writeRoles: ["admin"],
  },
  {
    key: "statistics",
    href: "/statistics",
    label: "สถิติ",
    isMainTab: true,
    viewRoles: ["admin", "co_admin"],
    writeRoles: [],
  },
  {
    key: "settings",
    href: "/settings",
    label: "ตั้งค่า",
    isMainTab: true,
    viewRoles: ["admin"],
    writeRoles: ["admin"],
  },

  // ── INVENTORY & ADMIN SUB-MODULES ──
  {
    key: "stock-out",
    href: "/stock-out",
    label: "เบิกใช้งาน",
    viewRoles: ["admin", "co_admin", "staff"],
    writeRoles: ["admin", "co_admin", "staff"],
    note: "แท็บของเสียกรอกได้เฉพาะ Admin/Co-Admin",
  },
  {
    key: "stock-in",
    href: "/stock-in",
    label: "รับของเข้า",
    viewRoles: ["admin", "co_admin"],
    writeRoles: ["admin", "co_admin"],
    note: "มีช่องต้นทุน — Staff เข้าไม่ได้",
  },
  {
    key: "adjustments",
    href: "/adjustments",
    label: "ปรับปรุงสต๊อก",
    viewRoles: ["admin", "co_admin"],
    writeRoles: ["admin", "co_admin"],
    note: "Co-Admin กรอกได้ แต่ต้องรอ Admin อนุมัติ",
  },
  {
    key: "history",
    href: "/history",
    label: "ประวัติ",
    viewRoles: ["admin", "co_admin", "staff"],
    writeRoles: [],
    note: "ตาราง append-only แก้/ลบไม่ได้ — Staff ซ่อนคอลัมน์ต้นทุน",
  },
  {
    key: "reports",
    href: "/reports",
    label: "รายงาน",
    viewRoles: ["admin", "co_admin"],
    writeRoles: [],
    note: "COGS / สรุปมูลค่าเบิกใช้ — Staff เข้าไม่ได้",
  },
  {
    key: "items",
    href: "/admin/items",
    label: "สินค้า",
    viewRoles: ["admin", "co_admin", "staff"],
    writeRoles: ["admin"],
    note: "Staff/Co-Admin ดูเพื่อเลือกเบิกได้ แต่แก้ราคา/เพิ่มตัวใหม่ไม่ได้",
  },
  {
    key: "users",
    href: "/admin/users",
    label: "ผู้ใช้",
    viewRoles: ["admin"],
    writeRoles: ["admin"],
  },
  {
    key: "audit",
    href: "/admin/audit",
    label: "Audit Log",
    viewRoles: ["admin"],
    writeRoles: [],
    note: "อ่านอย่างเดียว ลบไม่ได้เด็ดขาด (มี trigger ดัก)",
  },
] as const;

// ⚠️ super_admin ผ่านทุกจุดในไฟล์นี้เสมอ (ชั้น UI เท่านั้น) — "เห็นได้ทุกอย่างทุก tenant"
// เป็นนิยามของ role นี้โดยตรง ไม่ใช่ความสะดวก ⇒ ไม่ต้องไล่แก้ viewRoles/writeRoles ของ
// AppModule ทุกตัว (เสี่ยงพลาดตกหล่นบางโมดูลแบบเงียบๆ เหมือนที่เคยเกิดกับ INTENTIONALLY_OPEN
// ของ test:guards) แค่เช็คจุดเดียวตรงนี้พอ **แต่ชั้น DB (RLS) ยังไม่รู้จัก super_admin เป็นพิเศษ
// จนกว่าจะถึง migration เฟส 2** จึงยังไม่ใช่ช่องโหว่สิทธิ์จริง — แค่ทำให้ UI ไม่ซ่อนเมนู/ปุ่ม
// จากบัญชี super_admin เฉยๆ ข้อมูลจริงที่ query กลับมายังถูกกรองโดย RLS ตามเดิม
function isSuperAdmin(role: Role): boolean {
  return role === "super_admin";
}

export function canView(role: Role, key: ModuleKey): boolean {
  if (isSuperAdmin(role)) return true;
  const mod = APP_MODULES.find((m) => m.key === key);
  if (!mod) return false;
  return (mod.viewRoles as readonly string[]).includes(role);
}

export function canWrite(role: Role, key: ModuleKey): boolean {
  if (isSuperAdmin(role)) return true;
  const mod = APP_MODULES.find((m) => m.key === key);
  if (!mod) return false;
  return (mod.writeRoles as readonly string[]).includes(role);
}

export function visibleModulesFor(role: Role): readonly AppModule[] {
  if (isSuperAdmin(role)) return APP_MODULES;
  return APP_MODULES.filter((m) => (m.viewRoles as readonly string[]).includes(role));
}

export function mainNavItemsFor(role: Role): readonly AppModule[] {
  if (isSuperAdmin(role)) return APP_MODULES.filter((m) => m.isMainTab);
  return APP_MODULES.filter(
    (m) => m.isMainTab && (m.viewRoles as readonly string[]).includes(role)
  );
}

export function canSeeCost(role: Role): boolean {
  return role === "admin" || role === "co_admin" || isSuperAdmin(role);
}

export function canManageUsers(role: Role): boolean {
  return role === "admin" || isSuperAdmin(role);
}

export function canEditMinStock(role: Role): boolean {
  return role === "admin" || role === "co_admin" || isSuperAdmin(role);
}

export function canRecordWaste(role: Role): boolean {
  return role === "admin" || role === "co_admin" || isSuperAdmin(role);
}

