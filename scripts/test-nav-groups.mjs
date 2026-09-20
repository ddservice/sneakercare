#!/usr/bin/env node
import fs from "node:fs";

const perm = fs.readFileSync("lib/permissions.ts", "utf8");
const nav = fs.readFileSync("lib/nav-groups.ts", "utf8");

function moduleRoles(key, field) {
  const match = perm.match(new RegExp(`key:\\s*"${key}"[\\s\\S]*?${field}:\\s*\\[([^\\]]*)\\]`));
  return match ? [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
}

function isMainTab(key) {
  const block = perm.match(new RegExp(`key:\\s*"${key}"[\\s\\S]*?\\},`));
  return Boolean(block && block[0].includes("isMainTab: true"));
}

function canSee(role, key) {
  if (role === "super_admin") return true;
  return moduleRoles(key, "viewRoles").includes(role);
}

const GROUP_RE =
  /\{\s*id:\s*"(?<id>[^"]+)",\s*label:\s*"(?<label>[^"]+)",\s*keys:\s*\[(?<keys>[^\]]*)\]/g;
const groups = [...nav.matchAll(GROUP_RE)].map((m) => ({
  id: m.groups.id,
  label: m.groups.label,
  keys: [...m.groups.keys.matchAll(/"([^"]+)"/g)].map((k) => k[1]),
}));

function groupsFor(role) {
  return groups
    .map((g) => ({ ...g, keys: g.keys.filter((k) => isMainTab(k) && canSee(role, k)) }))
    .filter((g) => g.keys.length > 0);
}

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};

console.log("\n[nav-groups] จัดกลุ่มเมนูตามสิทธิ์");

const staff = groupsFor("staff");
const staffKeys = staff.flatMap((g) => g.keys);
if (
  staffKeys.includes("pos") &&
  staffKeys.includes("dashboard") &&
  !staffKeys.includes("tax-filing") &&
  !staffKeys.includes("expenses") &&
  !staffKeys.includes("invoicing") &&
  !staffKeys.includes("settings")
) {
  ok("staff เห็นงานบริการ/ภาพรวม ไม่เห็นเงินเอกสาร ภาษี ตั้งค่า");
} else {
  bad(`staff keys=${staffKeys.join(",")}`);
}

const staffMoney = staff.find((g) => g.id === "money");
if (staffMoney && staffMoney.keys.length === 1 && staffMoney.keys[0] === "dashboard") {
  ok("staff กลุ่มเงินเหลือภาพรวมอย่างเดียว — จะโชว์เป็นลิงก์ไม่ใช่เมนูย่อย");
} else {
  bad("staff กลุ่มเงินไม่เหลือแค่ภาพรวม");
}

const admin = groupsFor("admin");
if (admin.map((g) => g.id).join(",") === "service,money,inventory,people,settings") {
  ok("admin ได้ห้ากลุ่มตามลำดับงาน");
} else {
  bad(`admin groups=${admin.map((g) => g.id).join(",")}`);
}

const moneyKeys = admin.find((g) => g.id === "money")?.keys ?? [];
if (moneyKeys.join(",") === "dashboard,invoicing,expenses,tax-filing,statistics") {
  ok("กลุ่มเงินเรียงภาพรวม เอกสาร ค่าใช้จ่าย ภาษี สถิติ");
} else {
  bad(`money=${moneyKeys.join(",")}`);
}

if (nav.includes("visible.length > 0") && nav.includes("navGroupsFor")) {
  ok("กลุ่มว่างถูกตัดในสูตร");
} else {
  bad("ไม่เห็นการตัดกลุ่มว่าง");
}

const mainKeys = [...perm.matchAll(/key:\s*"([^"]+)"/g)]
  .map((m) => m[1])
  .filter((key) => isMainTab(key));
const grouped = new Set(groups.flatMap((g) => g.keys));
const missing = mainKeys.filter((k) => !grouped.has(k));
if (missing.length === 0) ok("แท็บหลักทุกอันอยู่ในกลุ่ม");
else bad(`แท็บหลักตกกลุ่ม: ${missing.join(",")}`);

if (failures) {
  console.log(`\n[nav-groups] ล้ม ${failures} ข้อ`);
  process.exit(1);
}
console.log("\n[nav-groups] ผ่านทั้งหมด");
