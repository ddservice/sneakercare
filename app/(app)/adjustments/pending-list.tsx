"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { approveAdjustment } from "@/app/actions/stock";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type PendingRow = {
  id: string;
  item_name: string;
  branch_name: string;
  txn_type: string;
  quantity_delta: number;
  reason: string | null;
  performed_by_name: string;
  created_at: string;
};

export function PendingAdjustmentsList({ rows }: { rows: PendingRow[] }) {
  const [isPending, startTransition] = useTransition();

  function handleApprove(id: string, approve: boolean) {
    startTransition(() => {
      approveAdjustment(id, approve).catch((err) => {
        toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      });
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">ไม่มีรายการรออนุมัติ</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>สาขา</TableHead>
          <TableHead>สินค้า</TableHead>
          <TableHead>ทิศทาง</TableHead>
          <TableHead className="text-right">จำนวน</TableHead>
          <TableHead>เหตุผล</TableHead>
          <TableHead>ผู้ขอ</TableHead>
          <TableHead className="text-right">การอนุมัติ</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.branch_name}</TableCell>
            <TableCell>{row.item_name}</TableCell>
            <TableCell>{row.txn_type === "adjustment_increase" ? "ปรับเพิ่ม" : "ปรับลด"}</TableCell>
            <TableCell className="text-right">{Math.abs(row.quantity_delta)}</TableCell>
            <TableCell className="max-w-48 truncate" title={row.reason ?? ""}>
              {row.reason}
            </TableCell>
            <TableCell>{row.performed_by_name}</TableCell>
            <TableCell className="flex justify-end gap-2">
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => handleApprove(row.id, true)}
              >
                อนุมัติ
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => handleApprove(row.id, false)}
              >
                ปฏิเสธ
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
