"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { toggleItemActive } from "@/app/actions/items";
import { Button } from "@/components/ui/button";

export function ToggleActiveButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(() => {
      toggleItemActive(id, !isActive).catch((err) => {
        toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      });
    });
  }

  return (
    <Button size="sm" variant="outline" disabled={isPending} onClick={handleClick}>
      {isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
    </Button>
  );
}
