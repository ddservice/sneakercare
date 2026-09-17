"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, MapPin } from "lucide-react";
import { setActiveBranch } from "@/app/actions/branch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from "@/components/ui/select";

const ALL = "all";

export type BranchOption = { id: string; name: string; tenantName?: string };

function groupByTenant(branches: BranchOption[]) {
  const order: string[] = [];
  const map = new Map<string, BranchOption[]>();
  for (const branch of branches) {
    const key = branch.tenantName ?? "";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(branch);
  }
  return order.map((tenantName) => ({ tenantName, branches: map.get(tenantName)! }));
}

export function BranchPicker({
  branches,
  selectedBranchId,
  fullWidth = false,
}: {
  branches: BranchOption[];
  selectedBranchId: string | null;
  fullWidth?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [currentId, setCurrentId] = useState(selectedBranchId ?? ALL);
  const [prevSelected, setPrevSelected] = useState(selectedBranchId);

  if (selectedBranchId !== prevSelected) {
    setPrevSelected(selectedBranchId);
    setCurrentId(selectedBranchId ?? ALL);
  }

  const selected = currentId === ALL ? null : branches.find((b) => b.id === currentId);
  const groups = groupByTenant(branches);
  const showTenantGroups = groups.some((g) => g.tenantName);

  function handleChange(value: string | null) {
    if (value == null || value === currentId) return;
    setCurrentId(value);
    startTransition(async () => {
      await setActiveBranch(value === ALL ? "" : value);
      router.refresh();
    });
  }

  return (
    <Select value={currentId} onValueChange={handleChange} disabled={pending} modal={false}>
      <SelectTrigger
        aria-label="สาขาที่กำลังดู"
        className={
          fullWidth
            ? "h-9 w-full max-w-none gap-2 rounded-xl border-slate-200 bg-white px-2.5 shadow-sm hover:bg-slate-50 data-[size=default]:h-9 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800/80"
            : "h-9 max-w-[9.5rem] gap-2 rounded-full border-slate-200 bg-white px-2.5 shadow-sm hover:bg-slate-50 data-[size=default]:h-9 sm:max-w-[16rem] dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800/80"
        }
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MapPin className="h-3.5 w-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-xs font-semibold leading-tight text-slate-800 dark:text-slate-100">
            {selected
              ? selected.tenantName && selected.tenantName !== selected.name
                ? selected.tenantName
                : selected.name
              : "ทุกสาขา"}
          </span>
          <span className="block truncate text-[10px] leading-tight text-slate-500 dark:text-slate-400">
            {selected
              ? selected.tenantName && selected.tenantName !== selected.name
                ? `สาขา ${selected.name}`
                : (selected.tenantName ?? "กำลังทำงานที่สาขานี้")
              : "ดูภาพรวม · อ่านอย่างเดียว"}
          </span>
        </span>
      </SelectTrigger>
      <SelectContent
        align="end"
        alignItemWithTrigger={false}
        className="min-w-64 p-1"
      >
        <SelectGroup>
          <SelectItem value={ALL} className="rounded-lg py-2">
            <span className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <span className="flex flex-col">
                <span className="font-medium">ทุกสาขา</span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  ดูภาพรวม · งานรับ-เบิก-ปรับต้องเลือกสาขาก่อน
                </span>
              </span>
            </span>
          </SelectItem>
        </SelectGroup>
        <SelectSeparator />
        {groups.map((group) => (
          <SelectGroup key={group.tenantName || "branches"}>
            {showTenantGroups && group.tenantName ? (
              <SelectLabel className="px-2 pt-1.5 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
                {group.tenantName}
              </SelectLabel>
            ) : (
              <SelectLabel className="px-2 pt-1.5 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
                สาขา
              </SelectLabel>
            )}
            {group.branches.map((branch) => (
              <SelectItem key={branch.id} value={branch.id} className="rounded-lg py-2">
                <span className="flex flex-col">
                  <span className="font-medium">{branch.name}</span>
                  {branch.tenantName ? (
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {branch.tenantName}
                    </span>
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
