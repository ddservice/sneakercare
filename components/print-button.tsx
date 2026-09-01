"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintButton({
  label = "สั่งพิมพ์ / บันทึก PDF (A4)",
  className = "bg-teal-700 hover:bg-emerald-600 text-white text-xs gap-1.5 font-bold shadow-xs",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Button
      size="sm"
      type="button"
      onClick={() => window.print()}
      className={className}
    >
      <Printer className="h-4 w-4" /> {label}
    </Button>
  );
}
