import { requireProfile, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveBranches } from "@/lib/branch";
import { ROLE_LABEL, type Role } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditUserForm, InviteUserForm, UserAccountActions, type BranchOption, type UserRow } from "./user-forms";
import { withId, text, bool } from "@/lib/db-rows";

export default async function AdminUsersPage() {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = await createClient();
  let users: UserRow[] = [];
  let branches: BranchOption[] = [];

  try {
    const [{ data: userRows }, branchRows] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name, role, branch_id, is_active")
        .order("display_name"),
      getActiveBranches().catch(() => []),
    ]);

    // `profiles` ไม่มีคอลัมน์ email เลย (ระบบ auth เก็บแยกไว้) — ต้องดึงจาก
    // auth.admin.listUsers() (service_role เท่านั้น) แล้ว join ด้วย id เอง
    // ⚠️ [แก้บั๊กจริง 2026-09-17] ตารางนี้ไม่เคยแสดง email เลย ทำให้เจ้าของ/super_admin
    // หาผู้ใช้ด้วยอีเมลที่เชิญไปไม่เจอ (บัญชีมีอยู่จริง แค่ตารางไม่แสดงอีเมลเทียบให้)
    // listUsers ไม่กรอง tenant เอง — แต่แค่ใช้ทำ lookup ตาม id ที่ RLS กรองมาแล้วจาก userRows
    // เท่านั้น จึงไม่รั่วอีเมลข้าม tenant
    const emailById = new Map<string, string>();
    try {
      const admin = createAdminClient();
      const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
      for (const u of authList?.users ?? []) {
        if (u.email) emailById.set(u.id, u.email);
      }
    } catch {
      // non-fatal — ตารางยังแสดงได้ปกติแค่ไม่มีคอลัมน์อีเมล
    }

    // `profiles` เป็นตารางจริงก็จริง แต่ generate types มาเป็น nullable หลายคอลัมน์
    // จึงต้อง normalize ตรงนี้ครั้งเดียว แทนที่จะปล่อย null ไหลเข้า UI แล้วขึ้น "undefined"
    users = (userRows ?? []).map((u) => ({
      id: u.id,
      username: text(u.username),
      display_name: text(u.display_name) || text(u.username) || "ผู้ใช้",
      role: (u.role ?? "staff") as UserRow["role"],
      branch_id: u.branch_id,
      is_active: bool(u.is_active, true),
      email: emailById.get(u.id) ?? null,
    }));
    branches = withId(branchRows).map((b) => ({ id: b.id, name: text(b.name) }));
  } catch {
    users = [];
    branches = [];
  }

  const branchName = new Map(branches.map((branch) => [branch.id, branch.name]));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>ผู้ใช้และสิทธิ์</CardTitle>
        <InviteUserForm branches={branches} />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ชื่อ</TableHead>
              <TableHead>ชื่อผู้ใช้</TableHead>
              <TableHead>อีเมล</TableHead>
              <TableHead>บทบาท</TableHead>
              <TableHead>สาขา</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead className="text-right">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.display_name}</TableCell>
                <TableCell>{user.username}</TableCell>
                <TableCell className="text-muted-foreground">{user.email ?? "—"}</TableCell>
                <TableCell>{ROLE_LABEL[user.role as Role] ?? user.role}</TableCell>
                <TableCell>{user.branch_id ? branchName.get(user.branch_id) ?? "—" : "ทุกสาขา"}</TableCell>
                <TableCell>
                  <Badge variant={user.is_active ? "default" : "outline"}>
                    {user.is_active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <EditUserForm user={user} branches={branches} />
                    <UserAccountActions user={user} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  ยังไม่มีผู้ใช้
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
