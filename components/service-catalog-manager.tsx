"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  createShopService,
  updateShopService,
  type ShopService,
} from "@/app/actions/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CATEGORIES = [
  { id: "package", label: "แพ็กเกจหลัก" },
  { id: "addon", label: "บริการเสริม" },
  { id: "treatment", label: "ทรีตเมนต์" },
  { id: "repair", label: "ซ่อม" },
];

export function ServiceCatalogManager({
  services,
  canManage,
}: {
  services: ShopService[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("package");
  const [price, setPrice] = useState("");

  if (!canManage) return null;

  function handleCreate() {
    startTransition(async () => {
      const res = await createShopService({
        name,
        category,
        basePrice: Number(price) || 0,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("เพิ่มบริการของกิจการนี้แล้ว");
      setName("");
      setPrice("");
      router.refresh();
    });
  }

  function handleToggle(service: ShopService) {
    startTransition(async () => {
      const res = await updateShopService({
        id: service.id,
        name: service.name,
        category: service.category,
        basePrice: service.basePrice,
        isActive: !service.isActive,
      });
      if (!res.success) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
        บริการของกิจการนี้ — ไม่ดึงแพ็กเกจจากสาขาแรก
      </p>
      <div className="grid gap-2 sm:grid-cols-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อบริการ" className="sm:col-span-2" />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="ราคา" />
      </div>
      <Button type="button" size="sm" disabled={pending || !name.trim()} onClick={handleCreate} className="gap-1">
        <Plus className="h-3.5 w-3.5" /> เพิ่มบริการ
      </Button>
      {services.length > 0 && (
        <ul className="space-y-1 text-xs">
          {services.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5 dark:bg-slate-900">
              <span className={s.isActive ? "" : "text-slate-400 line-through"}>
                {s.name} · ฿{s.basePrice.toLocaleString("th-TH")}
              </span>
              <button type="button" className="text-teal-700" disabled={pending} onClick={() => handleToggle(s)}>
                {s.isActive ? "ปิด" : "เปิด"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
