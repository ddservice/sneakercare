import { requireProfile, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TelegramTokenForm } from "./telegram-token-form";
import { BranchChatIdForm } from "./branch-chat-id-form";
import { PermissionMatrix } from "./permission-matrix";

export default async function AdminSettingsPage() {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = await createClient();
  const [{ data: statusRows }, { data: branches }] = await Promise.all([
    supabase.rpc("fn_integration_secret_status", { p_key: "telegram_bot_token" }),
    supabase.from("branches").select("id, name, telegram_chat_id").eq("is_active", true).order("name"),
  ]);

  const status = statusRows?.[0] ?? { is_set: false, value_suffix: null, updated_at: null };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>สิทธิ์ตามบทบาท</CardTitle>
        </CardHeader>
        <CardContent>
          <PermissionMatrix />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>การแจ้งเตือนสต๊อกต่ำ — Telegram</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <TelegramTokenForm status={status} />
          <div className="flex flex-col gap-3 border-t pt-4">
            <span className="text-sm font-medium">Chat ID ของกลุ่มพนักงานต่อสาขา</span>
            {(branches ?? []).map((branch) => (
              <BranchChatIdForm
                key={branch.id}
                branchId={branch.id}
                branchName={branch.name}
                currentChatId={branch.telegram_chat_id}
              />
            ))}
            {(!branches || branches.length === 0) && (
              <p className="text-sm text-muted-foreground">ยังไม่มีสาขาในระบบ</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
