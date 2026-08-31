#!/usr/bin/env node
/**
 * scripts/deploy-vps.mjs
 * Script สำหรับ Deploy โค้ดไปยัง VPS ผ่าน SSH อัตโนมัติ
 * อ่านค่าตั้งค่าจาก .env.local หรือ Environment Variables
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

console.log(`\x1b[36m🚀 กำลังเตรียม Deploy ไปยัง VPS: ${user}@${host}:${port} (${remotePath})\x1b[0m`);

const remoteCommands = [
  `set -e`,
  `echo "==> [1/4] เข้าสู่ไดเรกทอรีโปรเจกต์"`,
  `cd "${remotePath}"`,
  `echo "==> [2/4] Pull โค้ดล่าสุดจาก origin/master"`,
  `git checkout -- .`,
  `git fetch origin master`,
  `git reset --hard origin/master`,
  `echo "==> [3/4] ติดตั้ง dependencies และ Clean Build (ห้ามถอด --webpack)"`,
  `npm install`,
  `rm -rf .next`,
  `npm run build`,
  `echo "==> [4/4] รีสตาร์ต PM2 Process '${pm2App}'"`,
  `pm2 restart "${pm2App}"`,
  `echo "==> ✅ Deploy เสร็จสมบูรณ์เรียบร้อย!"`,
].join(" && ");

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
    console.log(`\n\x1b[32m✨ สำเร็จ: Deploy ไปยัง VPS เรียบร้อยแล้ว\x1b[0m`);
  } else {
    console.error(`\n\x1b[31m❌ ผิดพลาด: SSH exited with code ${code}\x1b[0m`);
    process.exit(code || 1);
  }
});
