#!/usr/bin/env node
/**
 * scripts/deploy-vps.mjs
 * Deploy โค้ด origin/master ไป VPS ผ่าน SSH
 * ไม่ใช้ reset --hard / checkout -- . / clean -fd
 * สร้างที่ .next-new จนกว่าจะผ่าน แล้วค่อยสลับ — ไม่ย้าย .next ระหว่าง build
 * ห้ามรันถ้าไม่ได้สั่ง deploy โดยตรง
 */
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return {};

  const content = readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      env[key] = val;
    }
  }
  return env;
}

const localEnv = loadEnvLocal();
const host = process.env.VPS_HOST || localEnv.VPS_HOST;
const port = process.env.VPS_PORT || localEnv.VPS_PORT || "22";
const user = process.env.VPS_USER || localEnv.VPS_USER;
const sshKey = process.env.VPS_SSH_KEY || localEnv.VPS_SSH_KEY;
const remotePath = process.env.VPS_PATH || localEnv.VPS_PATH;
const pm2App = process.env.VPS_PM2_APP || localEnv.VPS_PM2_APP;

if (!host || !user || !remotePath || !pm2App) {
  console.error(`\x1b[31m[ERROR] ข้อมูลสำหรับ VPS ยังไม่ครบถ้วน!\x1b[0m`);
  console.error(`กรุณากรอกค่าต่อไปนี้ใน .env.local:`);
  console.error(`  VPS_HOST    = (ปัจจุบัน: ${host || "ว่าง"})`);
  console.error(`  VPS_USER    = (ปัจจุบัน: ${user || "ว่าง"})`);
  console.error(`  VPS_PORT    = (ปัจจุบัน: ${port})`);
  console.error(`  VPS_PATH    = (ปัจจุบัน: ${remotePath || "ว่าง"})`);
  console.error(`  VPS_PM2_APP = (ปัจจุบัน: ${pm2App || "ว่าง"})`);
  console.error(`  VPS_SSH_KEY = (ปัจจุบัน: ${sshKey || "ไม่ได้ระบุ - ใช้ default/agent"})`);
  process.exit(1);
}

const remoteCommands = `
set -euo pipefail
cd "${remotePath}"
echo "==> [1/6] ตรวจ Git บน VPS ก่อนทิ้งงาน"
if [ -n "$(git status --porcelain)" ]; then
  echo "หยุด: มีไฟล์ dirty หรือ untracked — ห้าม checkout/reset ทับ"
  git status --short
  exit 2
fi
PREV="$(git rev-parse HEAD)"
echo "release ปัจจุบัน \${PREV}"
echo "==> [2/6] fetch origin/master"
git fetch origin master
REMOTE_HEAD="$(git rev-parse origin/master)"
echo "origin/master \${REMOTE_HEAD}"
AHEAD="$(git rev-list --count origin/master..HEAD)"
if [ "\${AHEAD}" -gt 0 ]; then
  echo "หยุด: VPS มี commit ที่ยังไม่อยู่บน origin/master (\${AHEAD})"
  git log --oneline origin/master..HEAD
  exit 3
fi
if [ "\${PREV}" != "\${REMOTE_HEAD}" ]; then
  git merge --ff-only origin/master
else
  echo "HEAD ตรง origin/master แล้ว"
fi
RELEASE="$(git rev-parse HEAD)"
echo "จะปล่อย \${RELEASE}"
echo "==> [3/6] ติดตั้ง dependencies (ยังเสิร์ฟ .next เดิม)"
npm install
echo "==> [4/6] build ไป .next-new ไม่ย้าย .next ที่กำลังเสิร์ฟ (ห้ามถอด --webpack)"
rm -rf .next-new
restore_source() {
  echo "==> คืนซอร์สเป็น \${PREV}"
  git switch --quiet -C master "\${PREV}"
}
restore_release() {
  echo "==> กู้คืน commit \${PREV} และ .next ชุดก่อนหน้า"
  restore_source
  if [ -d .next-prev ]; then
    rm -rf .next
    mv .next-prev .next
  fi
}
if ! NEXT_DIST_DIR=.next-new npm run build; then
  echo "build ไม่ผ่าน — ไม่แตะ .next ที่กำลังเสิร์ฟ"
  restore_source
  exit 4
fi
echo "==> สลับ .next หลัง build ผ่าน"
rm -rf .next-prev
if [ -d .next ]; then
  mv .next .next-prev
fi
mv .next-new .next
echo "==> [5/6] รีสตาร์ต PM2 ${pm2App}"
pm2 restart "${pm2App}"
sleep 3
echo "==> [6/6] ตรวจ /login บน 127.0.0.1:3003"
if ! curl -sf -o /dev/null --max-time 20 http://127.0.0.1:3003/login; then
  echo "start ไม่ผ่าน — กู้คืน release เดิม"
  restore_release
  pm2 restart "${pm2App}"
  exit 5
fi
echo "==> สำเร็จ release \${RELEASE}"
echo "กู้คืนฉุกเฉิน: mv .next-prev .next && git switch -C master \${PREV} && pm2 restart ${pm2App}"
`.trim();

console.log(`\x1b[36mกำลังเตรียม Deploy ไปยัง VPS: ${user}@${host}:${port} (${remotePath})\x1b[0m`);

const sshArgs = [];
if (sshKey) {
  sshArgs.push("-i", sshKey);
}
if (port && port !== "22") {
  sshArgs.push("-p", port);
}
sshArgs.push(`${user}@${host}`, remoteCommands);

const sshProc = spawn("ssh", sshArgs, { stdio: "inherit" });

sshProc.on("close", (code) => {
  if (code === 0) {
    console.log(`\n\x1b[32mสำเร็จ: Deploy ไปยัง VPS เรียบร้อยแล้ว\x1b[0m`);
  } else {
    console.error(`\n\x1b[31mผิดพลาด: SSH exited with code ${code}\x1b[0m`);
    process.exit(code || 1);
  }
});
