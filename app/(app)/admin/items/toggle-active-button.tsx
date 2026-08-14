"use client";

import { useTransition } from "react";
import { toggleItemActive } from "@/app/actions/items";
import { Button } from "@/components/ui/button";

export function ToggleActiveButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => startTransition(() => toggleItemActive(id, !isActive))}
    >
      {isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
    </Button>
  );
}
