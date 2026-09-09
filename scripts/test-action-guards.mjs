#!/usr/bin/env node
/**
 * ตรวจว่า **ทุก Server Action มีการ์ดสิทธิ์ที่แรงพอ** — รันแบบ static ไม่แตะฐานข้อมูล
 *
 * ⚠️ ทำไมเทสต์นี้ถึงจำเป็น (บทเรียนจริง 2026-09-09):
 * Server Action ของ Next.js คือ **HTTP endpoint สาธารณะ** ที่ใครก็ยิงเข้ามาตรงๆ ได้
 * ไม่ได้ถูกกันด้วย `requireModuleView()` ที่หน้าเว็บเลย — การ์ดที่หน้าเว็บกันแค่ "คนกดผ่าน UI"
 * ตอนตรวจรอบนี้พบ **25 action ที่ใช้ service_role (ข้าม RLS ทั้งหมด) แต่การ์ดมีแค่
 * requireProfile() = แค่ล็อกอิน** ⇒ พนักงานคนไหนก็อ่านเงินเดือน/เลขบัตร/เลขบัญชีของทุกคน
 * และแก้ยอดเงินได้ ถ้ารู้ชื่อ action
 *
 * `requireProfile()` **ไม่นับว่าเป็นการ์ด** ในเทสต์นี้ เพราะมันแปลว่า "ล็อกอินแล้ว" เท่านั้น
 * ไม่ได้บอกว่า role ไหนทำอะไรได้ — ต้องมี requireAdmin / requireModuleView / requireModuleWrite
 * หรือการเช็ค role ด้วยวิธีอื่น (canWrite / canRecordWaste) เสมอ
 *
 * รัน: npm run test:guards
 */
import fs from "node:fs";
import path from "node:path";

const ACTIONS_DIR = "app/actions";
const PERMISSIONS = fs.readFileSync("lib/permissions.ts", "utf8");

/** module key ที่มีอยู่จริงใน lib/permissions.ts — กันสะกดผิดแล้วการ์ดกลายเป็นไม่ทำงาน */
const VALID_MODULES = new Set(
  [...PERMISSIONS.matchAll(/key:\s*"([\w-]+)"/g)].map((m) => m[1])
);

/**
 * action ที่ "ล็อกอินอย่างเดียวก็พอ" โดยตั้งใจ — ต้องมีเหตุผลกำกับทุกตัว
 * ห้ามเติมชื่อลงลิสต์นี้เพื่อให้เทสต์ผ่าน ถ้ายังตอบไม่ได้ว่าทำไมพนักงานทุกคนควรเรียกได้
 */
const INTENTIONALLY_OPEN = {
  "auth.ts:login": "ต้องเรียกได้ตอนยังไม่ล็อกอิน",
  "auth.ts:logout": "ต้องเรียกได้เสมอ",
  "users.ts:changeOwnPassword": "ทุก role เปลี่ยนรหัสผ่านของตัวเองได้ และต้องกรอกรหัสเดิมยืนยัน",
  "shop-settings.ts:fetchShopProfile": "ชื่อ/ที่อยู่/เลขผู้เสียภาษีของร้าน อยู่บนหัวเอกสารที่พิมพ์ให้ลูกค้าอยู่แล้ว",
  "shop-settings.ts:fetchBackupHeartbeatEnabled": "คืนแค่ true/false ว่าเปิดแจ้งเตือน backup ไว้ไหม",
};

const STRONG_GUARDS = [
  /requireAdmin\s*\(/,
  /requireModuleView\s*\(\s*\w+\s*,\s*"([\w-]+)"/,
  /requireModuleWrite\s*\(\s*\w+\s*,\s*"([\w-]+)"/,
  /canWrite\s*\(/,
  /canRecordWaste\s*\(/,
  /canSeeCost\s*\(/,
];

let failures = 0;
let checked = 0;
const rows = [];

function fail(msg) {
  console.log(`  ✗ ${msg}`);
  failures++;
}

for (const file of fs.readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".ts")).sort()) {
  const src = fs.readFileSync(path.join(ACTIONS_DIR, file), "utf8");
  if (!src.includes('"use server"')) continue;

  const marks = [...src.matchAll(/export async function (\w+)/g)];
  for (let i = 0; i < marks.length; i++) {
    const name = marks[i][1];
    const body = src.slice(marks[i].index, i + 1 < marks.length ? marks[i + 1].index : src.length);
    const id = `${file}:${name}`;
    checked++;

    const strong = STRONG_GUARDS.find((re) => re.test(body));
    const moduleKey = body.match(/requireModule(?:View|Write)\s*\(\s*\w+\s*,\s*"([\w-]+)"/)?.[1];

    if (moduleKey && !VALID_MODULES.has(moduleKey)) {
      fail(`${id} → การ์ดอ้าง module "${moduleKey}" ที่ไม่มีใน lib/permissions.ts (สะกดผิด = การ์ดไม่ทำงาน)`);
      continue;
    }

    if (strong) {
      rows.push([id, moduleKey ? `${moduleKey}` : "role check", "✓"]);
      continue;
    }

    if (INTENTIONALLY_OPEN[id]) {
      if (!/requireProfile\s*\(/.test(body) && !file.startsWith("auth")) {
        fail(`${id} → อยู่ในลิสต์ยกเว้น แต่ไม่ได้เรียก requireProfile() เลยแม้แต่น้อย`);
        continue;
      }
      rows.push([id, "ยกเว้นโดยตั้งใจ", "—"]);
      continue;
    }

    const only = /requireProfile\s*\(/.test(body) ? "มีแค่ requireProfile() = แค่ล็อกอิน" : "ไม่มีการ์ดเลย";
    const svc = /createAdminClient\s*\(/.test(body) ? " · ใช้ service_role ⇒ ข้าม RLS ทั้งหมด" : "";
    fail(`${id} → ${only}${svc}`);
  }
}

const w = Math.max(...rows.map((r) => r[0].length), 10);
for (const [id, mod, ok] of rows) console.log(`  ${ok} ${id.padEnd(w)}  ${mod}`);

console.log(
  failures === 0
    ? `\n✅ Server Action ทั้ง ${checked} ตัวมีการ์ดสิทธิ์ครบ`
    : `\n❌ พบ ${failures} action ที่การ์ดไม่พอ (จากทั้งหมด ${checked})`
);
process.exitCode = failures === 0 ? 0 : 1;
