"use client";

import { useActionState, useState } from "react";
import { inviteUser, updateUser, sendPasswordReset, deleteUser, type UserActionState } from "@/app/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { UserRole } from "@/lib/supabase/database.types";

export type BranchOption = { id: string; name: string };

export type UserRow = {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  branch_id: string | null;
  is_active: boolean;
};

function BranchFields({
  branches,
  defaultRole,
  defaultBranchId,
}: {
  branches: BranchOption[];
  defaultRole?: UserRole;
  defaultBranchId?: string | null;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="role">บทบาท</Label>
        <Select name="role" required defaultValue={defaultRole ?? "staff"}>
          <SelectTrigger id="role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="co_admin">Co-Admin</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="branch_id">สาขา (Admin ปล่อยว่างได้)</Label>
        <Select name="branch_id" defaultValue={defaultBranchId ?? "none"}>
          <SelectTrigger id="branch_id" className="w-full">
            <SelectValue placeholder="ไม่ผูกสาขา" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">ไม่ผูกสาขา (Admin)</SelectItem>
            {branches.map((branch) => (
              <SelectItem key={branch.id} value={branch.id}>
                {branch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

export function InviteUserForm({ branches }: { branches: BranchOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<UserActionState, FormData>(inviteUser, undefined);
  const [prev, setPrev] = useState(state);
  if (state !== prev) {
    setPrev(state);
    if (state?.success) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>เชิญผู้ใช้ใหม่</Button>} />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>เชิญผู้ใช้ทางอีเมล</DialogTitle>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">อีเมล</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="display_name">ชื่อที่แสดง</Label>
            <Input id="display_name" name="display_name" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">ชื่อผู้ใช้ (ไม่กรอกจะใช้ส่วนหน้าอีเมล)</Label>
            <Input id="username" name="username" />
          </div>
          <BranchFields branches={branches} />
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "กำลังส่งคำเชิญ..." : "ส่งคำเชิญ"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditUserForm({
  user,
  branches,
}: {
  user: UserRow;
  branches: BranchOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<UserActionState, FormData>(updateUser, undefined);
  const [prev, setPrev] = useState(state);
  if (state !== prev) {
    setPrev(state);
    if (state?.success) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline">แก้ไข</Button>} />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>แก้ไข {user.display_name}</DialogTitle>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={user.id} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`display_name_${user.id}`}>ชื่อที่แสดง</Label>
            <Input
              id={`display_name_${user.id}`}
              name="display_name"
              defaultValue={user.display_name}
              required
            />
          </div>
          <BranchFields branches={branches} defaultRole={user.role} defaultBranchId={user.branch_id} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`is_active_${user.id}`}>สถานะ</Label>
            <Select name="is_active" required defaultValue={user.is_active ? "true" : "false"}>
              <SelectTrigger id={`is_active_${user.id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">ใช้งานอยู่</SelectItem>
                <SelectItem value="false">ปิดใช้งาน</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ปุ่มจัดการบัญชีที่ระบบเดิม (Google Apps Script) มีแต่ระบบใหม่ยังไม่มี
 * — ตราบใดที่ยังไม่มี เจ้าของก็ต้องเปิดหน้าเดิมค้างไว้ (ดู docs/sc-opex-refactor-plan.md ขั้นที่ 6)
 */
export function UserAccountActions({ user }: { user: UserRow }) {
  const [resetState, resetAction, resetPending] = useActionState<UserActionState, FormData>(
    sendPasswordReset,
    undefined
  );
  const [delOpen, setDelOpen] = useState(false);
  const [delState, delAction, delPending] = useActionState<UserActionState, FormData>(deleteUser, undefined);
  const [prevDel, setPrevDel] = useState(delState);
  if (delState !== prevDel) {
    setPrevDel(delState);
    if (delState?.success) setDelOpen(false);
  }

  return (
    <div className="flex items-center gap-2">
      {/* ส่งลิงก์ให้เจ้าตัวตั้งรหัสเอง — จงใจไม่ให้แอดมินตั้งรหัสให้คนอื่นตรงๆ
          ไม่งั้นแอดมินจะเข้าระบบในนามคนอื่นได้โดยที่ audit log บันทึกเป็นชื่อคนนั้น */}
      <form action={resetAction}>
        <input type="hidden" name="id" value={user.id} />
        <Button type="submit" size="sm" variant="outline" disabled={resetPending}>
          {resetPending ? "กำลังส่ง…" : "ส่งลิงก์ตั้งรหัสใหม่"}
        </Button>
      </form>

      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogTrigger
          render={
            <Button size="sm" variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-50">
              ลบ
            </Button>
          }
        />
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ลบบัญชี {user.display_name}?</DialogTitle>
          </DialogHeader>
          <form action={delAction} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={user.id} />
            <p className="text-xs text-slate-600 leading-relaxed">
              การลบนี้ย้อนกลับไม่ได้ · ถ้าบัญชีนี้เคยทำรายการในระบบคลังสินค้าไว้ ระบบจะปฏิเสธ
              และให้ใช้ <strong>&ldquo;ปิดใช้งาน&rdquo;</strong> แทน เพราะการลบเท่ากับแก้ไขประวัติย้อนหลัง
            </p>
            {delState?.error && (
              <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 leading-relaxed">{delState.error}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDelOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" size="sm" variant="destructive" disabled={delPending}>
                {delPending ? "กำลังลบ…" : "ยืนยันลบ"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {resetState?.success && <span className="text-[11px] text-emerald-700 font-semibold">ส่งอีเมลแล้ว</span>}
      {resetState?.error && <span className="text-[11px] text-rose-700">{resetState.error}</span>}
    </div>
  );
}
