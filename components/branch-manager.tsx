"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Clock, Plus } from "lucide-react";
import {
  createBranch,
  createTenantWithBranch,
  updateBranch,
  type ManagedBranch,
  type ManagedTenant,
} from "@/app/actions/branch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function BranchManager({
  branches,
  tenants,
  isSuperAdmin,
}: {
  branches: ManagedBranch[];
  tenants: ManagedTenant[];
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? "");
  const [openTime, setOpenTime] = useState("09:00");
  const [closeTime, setCloseTime] = useState("20:00");
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantBranch, setNewTenantBranch] = useState("");

  function refresh() {
    router.refresh();
  }

  function handleCreate() {
    startTransition(async () => {
      const res = await createBranch({ name, tenantId, openTime, closeTime });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("เพิ่มสาขาแล้ว");
      setName("");
      refresh();
    });
  }

  function handleCreateTenant() {
    startTransition(async () => {
      const res = await createTenantWithBranch({
        tenantName: newTenantName,
        branchName: newTenantBranch || newTenantName,
        openTime,
        closeTime,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("เปิดกิจการใหม่แล้ว — แคตตาล็อกบริการว่าง ต้องตั้งเอง ไม่ดึงจากสาขาแรก");
      setNewTenantName("");
      setNewTenantBranch("");
      refresh();
    });
  }

  function handleSave(branch: ManagedBranch, form: HTMLFormElement) {
    const data = new FormData(form);
    startTransition(async () => {
      const res = await updateBranch({
        id: branch.id,
        name: String(data.get("name") ?? ""),
        address: String(data.get("address") ?? ""),
        phone: String(data.get("phone") ?? ""),
        openTime: String(data.get("openTime") ?? ""),
        closeTime: String(data.get("closeTime") ?? ""),
        isActive: data.get("isActive") === "on",
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("บันทึกสาขาแล้ว");
      refresh();
    });
  }

  return (
    <Card className="border-slate-200 shadow-xs dark:border-slate-800">
      <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Building2 className="h-4 w-4 text-teal-600" />
          สาขาและเวลาเปิดร้าน
        </CardTitle>
        <CardDescription>
          แต่ละสาขาตั้งชื่อและเวลาเปิด-ปิดเองได้ ไม่ดึงของสาขาแรกมาใช้ —
          SneakerCare เป็นชื่อสาขาของกิจการแรก ไม่ปนกับ LUXSU
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-4 sm:p-6">
        {isSuperAdmin && (
          <div className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">เปิดกิจการใหม่ (นิติบุคคลแยก)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={newTenantName}
                onChange={(e) => setNewTenantName(e.target.value)}
                placeholder="ชื่อกิจการ เช่น LUXSU"
              />
              <Input
                value={newTenantBranch}
                onChange={(e) => setNewTenantBranch(e.target.value)}
                placeholder="ชื่อสาขาแรก (อย่าใส่ SneakerCare)"
              />
            </div>
            <Button type="button" size="sm" disabled={pending} onClick={handleCreateTenant}>
              สร้างกิจการ + สาขาแรก
            </Button>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-4">
          {isSuperAdmin && (
            <div className="space-y-1 sm:col-span-1">
              <Label className="text-xs">กิจการ</Label>
              <select
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1 sm:col-span-1">
            <Label className="text-xs">ชื่อสาขาใหม่</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น สาขาหลัก" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">เปิด</Label>
            <Input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">ปิด</Label>
            <Input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
          </div>
        </div>
        <Button type="button" size="sm" disabled={pending || !name.trim()} onClick={handleCreate} className="gap-1">
          <Plus className="h-3.5 w-3.5" /> เพิ่มสาขา
        </Button>

        <div className="space-y-3">
          {branches.map((branch) => (
            <form
              key={branch.id}
              className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
              onSubmit={(e) => {
                e.preventDefault();
                handleSave(branch, e.currentTarget);
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {isSuperAdmin ? `${branch.tenantName} · ${branch.name}` : branch.name}
                </p>
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  <input type="checkbox" name="isActive" defaultChecked={branch.isActive} />
                  เปิดใช้งาน
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input name="name" defaultValue={branch.name} required />
                <Input name="phone" defaultValue={branch.phone} placeholder="โทร" />
                <Input name="address" defaultValue={branch.address} placeholder="ที่อยู่" className="sm:col-span-2" />
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <Input type="time" name="openTime" defaultValue={branch.openTime} />
                  <span className="text-xs text-slate-400">ถึง</span>
                  <Input type="time" name="closeTime" defaultValue={branch.closeTime} />
                </div>
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={pending}>
                บันทึกสาขานี้
              </Button>
            </form>
          ))}
          {branches.length === 0 && (
            <p className="text-sm text-slate-500">ยังไม่มีสาขา — เพิ่มด้านบนได้เลย</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
