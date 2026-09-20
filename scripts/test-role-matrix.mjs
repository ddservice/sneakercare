#!/usr/bin/env node
import fs from "node:fs";

const perm = fs.readFileSync("lib/permissions.ts", "utf8");
function moduleRoles(key, field) {
  const match = perm.match(new RegExp(`key:\\s*"${key}"[\\s\\S]*?${field}:\\s*\\[([^\\]]*)\\]`));
  return match ? [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
}

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
function check(cond, yes, no) {
  if (cond) ok(yes);
  else bad(no);
}

console.log("\n[roles] แยกสิทธิ์ต่อ role / โมดูล");
const taxView = moduleRoles("tax-filing", "viewRoles");
const taxWrite = moduleRoles("tax-filing", "writeRoles");
const posWrite = moduleRoles("pos", "writeRoles");
const stockOutWrite = moduleRoles("stock-out", "writeRoles");
const invWrite = moduleRoles("invoicing", "writeRoles");
const stockInView = moduleRoles("stock-in", "viewRoles");
const expensesView = moduleRoles("expenses", "viewRoles");
const reportsView = moduleRoles("reports", "viewRoles");
const settingsView = moduleRoles("settings", "viewRoles");
const usersWrite = moduleRoles("users", "writeRoles");

check(taxView.includes("admin") && !taxView.includes("staff") && !taxView.includes("co_admin"), "staff/co_admin ไม่ดูภาษี", taxView.join(","));
check(taxWrite.includes("admin") && !taxWrite.includes("staff"), "staff ไม่เขียนภาษี", taxWrite.join(","));
check(posWrite.includes("staff") && stockOutWrite.includes("staff"), "staff รับงานและเบิกได้", `${posWrite}|${stockOutWrite}`);
check(!invWrite.includes("staff") && !stockInView.includes("staff"), "staff ไม่ออกเอกสารและไม่รับของเข้า", `${invWrite}|${stockInView}`);
check(!expensesView.includes("staff") && !reportsView.includes("staff") && !settingsView.includes("staff"), "staff ไม่เห็นค่าใช้จ่าย รายงาน ตั้งค่า", `${expensesView}|${reportsView}|${settingsView}`);
check(usersWrite.includes("admin") && !usersWrite.includes("staff") && !usersWrite.includes("co_admin"), "เชิญผู้ใช้ได้แค่ admin", usersWrite.join(","));
check(perm.includes('return role === "admin" || role === "co_admin" || isSuperAdmin(role)') && perm.includes("canSeeCost"), "staff ไม่เห็นต้นทุนในสูตร", "สูตรต้นทุนไม่ชัด");
check(perm.includes("function isSuperAdmin") && perm.includes('role === "super_admin"'), "super_admin ผ่านชั้น UI ที่จุดเดียว", "ไม่มี super_admin gate");

if (failures) {
  console.log(`\n[roles] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[roles] ผ่านทั้งหมด — สูตรสิทธิ์ ไม่ใช่คลิกเบราว์เซอร์");
}
