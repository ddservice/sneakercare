import { Eye, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_MODULES, ROLE_LABEL, ROLES, type Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";

function RoleToggle({
  role,
  pressed,
}: {
  role: Role;
  pressed: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={pressed ? "default" : "outline"}
      aria-pressed={pressed}
      tabIndex={-1}
      className={cn("pointer-events-none", !pressed && "opacity-40")}
    >
      {ROLE_LABEL[role]}
    </Button>
  );
}

export function PermissionMatrix() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        สิทธิ์จริงบังคับที่ฐานข้อมูล (RLS) ตามบทบาท 3 ระดับ — ตารางนี้สะท้อนค่านั้น
        ไม่ได้ปรับจากหน้าเว็บ เพราะถ้าเปิดเมนูให้ Staff แต่ DB ยังบล็อกอยู่ จะกรอกไม่ผ่านอยู่ดี
      </p>
      <div className="flex flex-col gap-3">
        {APP_MODULES.map((mod) => (
          <div
            key={mod.key}
            className="flex flex-col gap-2 rounded-lg border bg-background p-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-40">
              <div className="text-sm font-medium">{mod.label}</div>
              {mod.note && <p className="text-xs text-muted-foreground">{mod.note}</p>}
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex w-28 items-center gap-1 text-xs text-muted-foreground">
                  <Eye className="size-3.5" />
                  มองเห็น
                </span>
                {ROLES.map((role) => (
                  <RoleToggle key={`view-${mod.key}-${role}`} role={role} pressed={mod.viewRoles.includes(role)} />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex w-28 items-center gap-1 text-xs text-muted-foreground">
                  <PencilLine className="size-3.5" />
                  กรอก/แก้ไข
                </span>
                {ROLES.map((role) => (
                  <RoleToggle key={`write-${mod.key}-${role}`} role={role} pressed={mod.writeRoles.includes(role)} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
