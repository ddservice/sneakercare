#!/usr/bin/env node
import fs from "node:fs";

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

const deploy = fs.readFileSync("scripts/deploy-vps.mjs", "utf8");
const nextConfig = fs.readFileSync("next.config.ts", "utf8");

console.log("\n[deploy-script] กันทำลายงานและเว็บระหว่าง build");
check(!/git reset --hard/.test(deploy), "ไม่มี git reset --hard", "ยังมี reset --hard");
check(!/git checkout -- \./.test(deploy), "ไม่มี git checkout -- .", "ยังล้าง working tree");
check(!/git clean -fd/.test(deploy), "ไม่มี git clean -fd", "ยังมี clean -fd");
check(/status --porcelain/.test(deploy), "หยุดเมื่อ dirty/untracked", "ไม่เช็ค dirty");
check(/merge --ff-only/.test(deploy), "อัปเดตแบบ ff-only", "ไม่ ff-only");
check(/NEXT_DIST_DIR=\.next-new/.test(deploy), "build ไป .next-new", "ยัง build ทับ .next");
check(/mv \.next \.next-prev/.test(deploy) && deploy.indexOf("npm run build") < deploy.indexOf("mv .next .next-prev"), "ย้าย .next หลัง build ผ่าน", "ย้ายก่อน build");
check(/npm ci/.test(deploy), "ติดตั้งจาก lockfile ด้วย npm ci", "ยังใช้ npm install");
check(/git restore --worktree -- tsconfig.json/.test(deploy), "คืน tsconfig หลัง Next เขียนทับ", "ไม่คืน tsconfig");
check(/restore_release/.test(deploy) && /pm2 restart/.test(deploy), "start ไม่ผ่านแล้วคืน .next-prev และรีสตาร์ต", "ไม่มีทางกู้");
check(/NEXT_DIST_DIR/.test(nextConfig), "next.config อ่าน NEXT_DIST_DIR", "ไม่มี distDir");

if (failures) {
  console.log(`\n[deploy-script] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[deploy-script] ผ่านทั้งหมด");
}
