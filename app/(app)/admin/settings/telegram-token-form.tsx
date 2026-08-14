"use client";

import { useActionState } from "react";
import { setTelegramToken, type SettingsActionState } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status = { is_set: boolean; value_suffix: string | null; updated_at: string | null };

export function TelegramTokenForm({ status }: { status: Status }) {
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(setTelegramToken, undefined);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {status.is_set
          ? `ตั้งค่าแล้ว (ลงท้าย ****${status.value_suffix}) แก้ไขล่าสุด ${
              status.updated_at ? new Date(status.updated_at).toLocaleString("th-TH") : "-"
            }`
          : "ยังไม่ได้ตั้งค่า Bot Token"}
      </p>
      <form action={action} className="flex flex-col gap-3 max-w-md">
        <div className="flex flex-col gap-2">
          <Label htmlFor="token">Telegram Bot Token</Label>
          <Input id="token" name="token" type="password" placeholder="ได้จาก @BotFather" autoComplete="off" />
          <p className="text-xs text-muted-foreground">
            ค่านี้เขียนได้ทางเดียว — ระบบจะไม่แสดงค่าเต็มกลับมาให้ดูอีก แม้แต่ Admin เพื่อความปลอดภัย
          </p>
        </div>
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state?.success && <p className="text-sm text-emerald-600">บันทึก Bot Token สำเร็จ</p>}
        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "กำลังบันทึก..." : "บันทึก Token"}
        </Button>
      </form>
    </div>
  );
}
