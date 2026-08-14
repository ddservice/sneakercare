"use client";

import { setActiveBranch } from "@/app/actions/branch";

type BranchOption = { id: string; name: string };

export function BranchPicker({
  branches,
  selectedBranchId,
}: {
  branches: BranchOption[];
  selectedBranchId: string | null;
}) {
  return (
    <form action={setActiveBranch}>
      <label className="sr-only" htmlFor="active_branch_id">
        สาขาที่กำลังดู
      </label>
      <select
        id="active_branch_id"
        name="branch_id"
        defaultValue={selectedBranchId ?? ""}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="h-8 max-w-56 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">ทุกสาขา (ดูอย่างเดียว)</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </form>
  );
}
