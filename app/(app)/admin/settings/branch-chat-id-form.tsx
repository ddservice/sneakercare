"use client";

import { useActionState } from "react";
import { updateBranchChatId, type SettingsActionState } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function BranchChatIdForm({
  branchId,
  branchName,
  currentChatId,
}: {
  branchId: string;
  branchName: string;
  currentChatId: string | null;
}) {
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(
    updateBranchChatId,
    undefined
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="branch_id" value={branchId} />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{branchName}</span>
        <Input
          name="telegram_chat_id"
          defaultValue={currentChatId ?? ""}
          placeholder="chat_id ของกลุ่มพนักงาน"
          className="w-56"
        />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "กำลังบันทึก..." : "บันทึก"}
      </Button>
      {state?.error && <span className="text-xs text-destructive">{state.error}</span>}
      {state?.success && <span className="text-xs text-emerald-600">บันทึกแล้ว</span>}
    </form>
  );
}
