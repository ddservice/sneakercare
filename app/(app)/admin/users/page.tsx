import { requireProfile, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBranches } from "@/lib/branch";
import { ROLE_LABEL } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditUserForm, InviteUserForm } from "./user-forms";

export default async function AdminUsersPage() {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = await createClient();
  const [{ data: users }, branches] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, role, branch_id, is_active")
      .order("display_name"),
    getActiveBranches(),
  ]);

  const branchName = new Map((branches ?? []).map((branch) => [branch.id, branch.name]));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>ผู้ใช้และสิทธิ์</CardTitle>
        <InviteUserForm branches={branches ?? []} />
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
            {(users ?? []).map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.display_name}</TableCell>
                <TableCell>{user.username}</TableCell>
                <TableCell>{ROLE_LABEL[user.role]}</TableCell>
                <TableCell>{user.branch_id ? branchName.get(user.branch_id) ?? "—" : "ทุกสาขา"}</TableCell>
                <TableCell>
                  <Badge variant={user.is_active ? "default" : "outline"}>
                    {user.is_active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <EditUserForm user={user} branches={branches ?? []} />
                </TableCell>
              </TableRow>
            ))}
            {(!users || users.length === 0) && (
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
