import { requireProfile, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBranches } from "@/lib/branch";
import { ROLE_LABEL, type Role } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditUserForm, InviteUserForm, type BranchOption, type UserRow } from "./user-forms";
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
    // `profiles` เป็นตารางจริงก็จริง แต่ generate types มาเป็น nullable หลายคอลัมน์
    // จึงต้อง normalize ตรงนี้ครั้งเดียว แทนที่จะปล่อย null ไหลเข้า UI แล้วขึ้น "undefined"
    users = (userRows ?? []).map((u) => ({
      id: u.id,
      username: text(u.username),
      display_name: text(u.display_name) || text(u.username) || "ผู้ใช้",
      role: (u.role ?? "staff") as UserRow["role"],
      branch_id: u.branch_id,
      is_active: bool(u.is_active, true),
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
                <TableCell>{ROLE_LABEL[user.role as Role] ?? user.role}</TableCell>
                <TableCell>{user.branch_id ? branchName.get(user.branch_id) ?? "—" : "ทุกสาขา"}</TableCell>
                <TableCell>
                  <Badge variant={user.is_active ? "default" : "outline"}>
                    {user.is_active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <EditUserForm user={user} branches={branches} />
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
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
