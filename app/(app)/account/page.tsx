import { requireProfile } from "@/lib/auth";
import { ROLE_LABEL, type Role } from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCircle, KeyRound } from "lucide-react";
import { ChangePasswordForm } from "./change-password-form";

/**
 * หน้าบัญชีของฉัน — **ทุก role เข้าได้** (ใช้แค่ requireProfile ไม่มี requireModuleView)
 *
 * ทำไมไม่ไปอยู่ใน /settings: หน้านั้นเป็น requireAdmin ⇒ พนักงานเข้าไม่ได้ แต่การเปลี่ยน
 * รหัสผ่านของตัวเองเป็นสิ่งที่ทุกคนต้องทำได้ ไม่งั้นพนักงานจะเปลี่ยนรหัสเองไม่ได้เลย
 * (ระบบเดิมมี `change_password` อยู่แล้ว — ถ้าระบบใหม่ไม่มี ก็เลิกใช้ระบบเดิมไม่ได้)
 */
export default async function AccountPage() {
  const profile = await requireProfile();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-4">
          <div className="rounded-xl bg-teal-50 p-3 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
            <UserCircle className="h-7 w-7" />
          </div>
          <div className="space-y-0.5">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {profile.display_name}
            </h2>
            <p className="text-xs text-slate-500">
              {profile.username} · {ROLE_LABEL[profile.role as Role] ?? profile.role}
            </p>
          </div>
        </div>
      </div>

      <Card className="border-slate-200 shadow-xs dark:border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-teal-700" /> เปลี่ยนรหัสผ่าน
          </CardTitle>
          <CardDescription className="text-xs">
            ต้องกรอกรหัสผ่านเดิมเพื่อยืนยันตัวตนก่อนทุกครั้ง — กันกรณีมีคนมาใช้เครื่องที่เปิดค้างไว้
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
