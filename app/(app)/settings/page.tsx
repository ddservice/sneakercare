import Link from "next/link";
import { requireProfile, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Settings,
  Users,
  ShieldCheck,
  Send,
  Building2,
  PackagePlus,
  Key,
} from "lucide-react";
import { TelegramTokenForm } from "../admin/settings/telegram-token-form";
import { BranchChatIdForm } from "../admin/settings/branch-chat-id-form";
import { PermissionMatrix } from "../admin/settings/permission-matrix";

export default async function SettingsPage() {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = await createClient();
  const [{ data: statusRows }, { data: branches }] = await Promise.all([
    supabase.rpc("fn_integration_secret_status", { p_key: "telegram_bot_token" }),
    supabase.from("branches").select("id, name, telegram_chat_id").eq("is_active", true).order("name"),
  ]);

  const status = statusRows?.[0] ?? { is_set: false, value_suffix: null, updated_at: null };

  return (
    <div className="space-y-8">
      {/* ── Header Banner ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-teal-950 p-6 text-white shadow-md">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-200 ring-1 ring-teal-400/30">
            <Settings className="h-3.5 w-3.5" />
            System Administration
          </div>
          <h2 className="text-2xl font-bold tracking-tight">ตั้งค่าระบบ & สิทธิ์การใช้งาน</h2>
          <p className="text-sm text-slate-300">
            จัดการบัญชีผู้ใช้ สิทธิ์ความปลอดภัย บอทแจ้งเตือนสต๊อกต่ำ และการตั้งค่าสาขา
          </p>
        </div>
      </div>

      {/* ── Quick Admin Links ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/admin/users" className="group">
          <Card className="border-slate-200 p-5 transition-all hover:border-teal-400 hover:shadow-sm dark:border-slate-800">
            <div className="flex items-center gap-3.5">
              <div className="rounded-xl bg-teal-50 p-3 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-all dark:bg-teal-950 dark:text-teal-400">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <div className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-teal-600">
                  จัดการผู้ใช้ & สิทธิ์
                </div>
                <div className="text-xs text-slate-500">เชิญพนักงาน กำหนดสิทธิ์ และสาขา</div>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/admin/audit" className="group">
          <Card className="border-slate-200 p-5 transition-all hover:border-teal-400 hover:shadow-sm dark:border-slate-800">
            <div className="flex items-center gap-3.5">
              <div className="rounded-xl bg-teal-50 p-3 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-all dark:bg-teal-950 dark:text-teal-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <div className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-teal-600">
                  Audit Log ตรวจสอบ
                </div>
                <div className="text-xs text-slate-500">ประวัติความปลอดภัยที่ลบ/แก้ไม่ได้</div>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/admin/items" className="group">
          <Card className="border-slate-200 p-5 transition-all hover:border-teal-400 hover:shadow-sm dark:border-slate-800">
            <div className="flex items-center gap-3.5">
              <div className="rounded-xl bg-teal-50 p-3 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-all dark:bg-teal-950 dark:text-teal-400">
                <PackagePlus className="h-6 w-6" />
              </div>
              <div>
                <div className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-teal-600">
                  แคตตาล็อกสินค้ากลาง
                </div>
                <div className="text-xs text-slate-500">เพิ่ม/แก้ไขรายการสินค้าและน้ำยา</div>
              </div>
            </div>
          </Card>
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Telegram Low-Stock Notification (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="border-slate-200 shadow-xs dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Send className="h-4 w-4 text-teal-600" />
                การแจ้งเตือนสต๊อกต่ำ — Telegram Bot
              </CardTitle>
              <CardDescription>
                ระบบจะส่งข้อความเข้ากลุ่มพนักงานอัตโนมัติเมื่อสินค้ามีจำนวนต่ำกว่าเกณฑ์
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <TelegramTokenForm status={status} />

              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Chat ID ของกลุ่ม Telegram ต่อสาขา
                </div>
                {(branches ?? []).map((branch) => (
                  <BranchChatIdForm
                    key={branch.id}
                    branchId={branch.id}
                    branchName={branch.name}
                    currentChatId={branch.telegram_chat_id}
                  />
                ))}
                {(!branches || branches.length === 0) && (
                  <p className="text-sm text-slate-400">ยังไม่มีสาขาในระบบ</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Permission Matrix (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="border-slate-200 shadow-xs dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Key className="h-4 w-4 text-teal-600" />
                แผนผังสิทธิ์การใช้งาน (RBAC)
              </CardTitle>
              <CardDescription>สิทธิ์ระดับฐานข้อมูล (PostgreSQL RLS)</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <PermissionMatrix />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
