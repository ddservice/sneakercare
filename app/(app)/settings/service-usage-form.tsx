"use client";

import { useState, useTransition } from "react";
import {
  addUsageFormula,
  approveUsageFormula,
  saveUsageCutPoint,
  type UsageCatalogItem,
  type UsageCatalogService,
} from "@/app/actions/service-usage";
import type { ServiceUsageConfig } from "@/lib/service-usage-store";
import { LIVE_AUTO_ISSUE_ALLOWED } from "@/lib/service-usage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function ServiceUsageForm({
  initialConfig,
  services,
  items,
}: {
  initialConfig: ServiceUsageConfig;
  services: UsageCatalogService[];
  items: UsageCatalogItem[];
}) {
  const [config, setConfig] = useState(initialConfig);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    serviceId: services[0]?.id ?? "",
    itemId: items[0]?.id ?? "",
    qtyBase: "",
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });
  const selectedItem = items.find((row) => row.id === form.itemId);

  return (
    <Card className="border-slate-200 shadow-xs dark:border-slate-800">
      <CardHeader className="border-b border-slate-100 pb-4">
        <CardTitle className="text-base font-bold">สูตรของใช้ต่องาน (ยังไม่ตัดอัตโนมัติ)</CardTitle>
        <CardDescription>
          บันทึกสูตรเป็นหน่วยฐาน มีเวอร์ชันและวันที่มีผล แล้วนุมัติก่อนใช้จองวัสดุ — การตัดสต๊อกยังปิด
          {LIVE_AUTO_ISSUE_ALLOWED ? "" : " ที่ระดับเซิร์ฟเวอร์"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-6 text-xs">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
          ข้อเสนอที่ยังไม่เปิดใช้: จองตอนรับงาน → เบิกตอนเริ่มงาน → ปรับตามใช้จริงตอนปิดงาน · ตอนนี้เบิกมือที่ /stock-out
        </div>
        <label className="block space-y-1">
          <span className="text-slate-500">จุดตัดที่ต้องการ (ยังไม่เปิดใช้)</span>
          <select
            value={config.flags.cutPoint ?? ""}
            disabled={pending}
            onChange={(e) => {
              const value = e.target.value as "" | "receive" | "start" | "complete";
              startTransition(async () => {
                const res = await saveUsageCutPoint(value);
                if (res.success) {
                  setConfig(res.config);
                  toast.success("บันทึกจุดตัดที่ต้องการแล้ว — ยังไม่ตัดอัตโนมัติ");
                } else {
                  toast.error(res.error);
                }
              });
            }}
            className="h-8 w-full rounded-md border px-2"
          >
            <option value="">ยังไม่เลือก</option>
            <option value="receive">ตอนรับงาน</option>
            <option value="start">ตอนเริ่มงาน</option>
            <option value="complete">ตอนปิดงาน</option>
          </select>
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-slate-500">บริการ</span>
            <select
              value={form.serviceId}
              onChange={(e) => setForm((p) => ({ ...p, serviceId: e.target.value }))}
              className="h-8 w-full rounded-md border px-2"
            >
              {services.length === 0 ? <option value="">ยังไม่มีบริการ</option> : null}
              {services.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-slate-500">สินค้า / น้ำยา (หน่วยฐาน)</span>
            <select
              value={form.itemId}
              onChange={(e) => setForm((p) => ({ ...p, itemId: e.target.value }))}
              className="h-8 w-full rounded-md border px-2"
            >
              {items.length === 0 ? <option value="">ยังไม่มีสินค้า</option> : null}
              {items.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} ({row.unit})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-slate-500">ปริมาณหน่วยฐาน</span>
            <input
              value={form.qtyBase}
              onChange={(e) => setForm((p) => ({ ...p, qtyBase: e.target.value }))}
              className="h-8 w-full rounded-md border px-2 font-mono"
              inputMode="decimal"
            />
          </label>
          <label className="space-y-1">
            <span className="text-slate-500">วันที่มีผล</span>
            <input
              type="date"
              value={form.effectiveFrom}
              onChange={(e) => setForm((p) => ({ ...p, effectiveFrom: e.target.value }))}
              className="h-8 w-full rounded-md border px-2"
            />
          </label>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={pending || !form.serviceId || !form.itemId}
          onClick={() => {
            startTransition(async () => {
              const res = await addUsageFormula({
                serviceId: form.serviceId,
                itemId: form.itemId,
                qtyBase: Number(form.qtyBase || 0),
                effectiveFrom: form.effectiveFrom,
                unit: selectedItem?.unit || "หน่วย",
              });
              if (res.success) {
                setConfig(res.config);
                setForm((p) => ({ ...p, qtyBase: "" }));
                toast.success("บันทึกสูตรฉบับร่างแล้ว — ต้องอนุมัติก่อนใช้จอง");
              } else {
                toast.error(res.error);
              }
            });
          }}
          className="h-8 bg-teal-700 text-xs text-white hover:bg-emerald-600"
        >
          {pending ? "กำลังบันทึก…" : "เพิ่มสูตรฉบับร่าง"}
        </Button>
        <table className="w-full text-left">
          <thead className="border-b text-slate-500">
            <tr>
              <th className="py-1.5 font-medium">บริการ</th>
              <th className="py-1.5 font-medium">สินค้า</th>
              <th className="py-1.5 font-medium">v / มีผล</th>
              <th className="py-1.5 text-right font-medium">ปริมาณ</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody>
            {config.formulas.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-3 text-slate-400">
                  ยังไม่มีสูตร
                </td>
              </tr>
            ) : (
              config.formulas
                .slice()
                .reverse()
                .map((row) => (
                  <tr key={`${row.serviceId}-${row.itemId}-${row.version}`} className="border-b border-slate-100">
                    <td className="py-1.5">{services.find((s) => s.id === row.serviceId)?.name || row.serviceId}</td>
                    <td className="py-1.5">{items.find((s) => s.id === row.itemId)?.name || row.itemId}</td>
                    <td className="py-1.5 font-mono">
                      v{row.version} · {row.effectiveFrom}
                      {row.approved ? " · อนุมัติแล้ว" : " · ร่าง"}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {row.qtyBase} {row.unit}
                    </td>
                    <td className="py-1.5 text-right">
                      {!row.approved ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => {
                            startTransition(async () => {
                              const res = await approveUsageFormula({
                                serviceId: row.serviceId,
                                itemId: row.itemId,
                                version: row.version,
                              });
                              if (res.success) {
                                setConfig(res.config);
                                toast.success("อนุมัติสูตรแล้ว — ยังไม่ตัดสต๊อกอัตโนมัติ");
                              } else {
                                toast.error(res.error);
                              }
                            });
                          }}
                          className="h-7 text-[11px]"
                        >
                          อนุมัติ
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
