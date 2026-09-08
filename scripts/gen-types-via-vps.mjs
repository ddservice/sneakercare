#!/usr/bin/env node
/**
 * regenerate `lib/supabase/database.types.ts` จากฐานข้อมูล production ผ่าน VPS
 *
 * ⚠️ ทำไมต้องผ่าน VPS: เครื่อง dev ไม่มี Supabase CLI และไม่มี `SUPABASE_DB_URL`
 * (ค่านั้นอยู่แค่บน VPS ที่ `/home/ddservice/sneakercare-backup.env`) — CLAUDE.md เขียนขั้นตอนนี้
 * ไว้เป็นข้อความ แต่ต้องพิมพ์เองทุกครั้ง สคริปต์นี้ทำให้เป็นคำสั่งเดียว
 *
 * ⚠️ **ห้ามแก้ส่วน `Database` ในไฟล์ types ด้วยมือ** — ต้องมาจาก generator เท่านั้น
 * สคริปต์นี้จึงเก็บ header ที่เขียนมือไว้ (ทุกอย่างก่อนบรรทัด `export type Json =`)
 * แล้วแทนที่เฉพาะส่วนที่ generate มา
 *
 * รัน: npm run gen:types
 * อ่านอย่างเดียวบน VPS — ไม่ build ไม่ restart ไม่แตะไฟล์บนนั้น
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i !== -1) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const env = loadEnvLocal();
const host = process.env.VPS_HOST || env.VPS_HOST;
const user = process.env.VPS_USER || env.VPS_USER;
const port = process.env.VPS_PORT || env.VPS_PORT || "22";
const sshKey = process.env.VPS_SSH_KEY || env.VPS_SSH_KEY;
const remotePath = process.env.VPS_PATH || env.VPS_PATH;

if (!host || !user || !remotePath) {
  console.error("\x1b[31m[ERROR] ต้องมี VPS_HOST / VPS_USER / VPS_PATH ใน .env.local\x1b[0m");
  process.exit(1);
}

// `set -a` เพื่อ export ตัวแปรจากไฟล์ env ของ backup ให้ subshell เห็น SUPABASE_DB_URL
const remote = [
  "set -a",
  ". /home/ddservice/sneakercare-backup.env",
  "set +a",
  `cd "${remotePath}"`,
  'npx --yes supabase@latest gen types typescript --db-url "$SUPABASE_DB_URL" --schema public --schema extension_layer',
].join(" && ");

const sshArgs = [];
if (sshKey) sshArgs.push("-i", sshKey);
if (port && port !== "22") sshArgs.push("-p", port);
sshArgs.push(`${user}@${host}`, remote);

console.log(`\x1b[36m⏳ generate types จาก production ผ่าน ${user}@${host} …\x1b[0m`);
const res = spawnSync("ssh", sshArgs, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

if (res.status !== 0) {
  console.error("\x1b[31m❌ ssh ล้มเหลว\x1b[0m");
  if (res.stderr) console.error(res.stderr.slice(0, 4000));
  process.exit(res.status || 1);
}

const generated = String(res.stdout ?? "");
const marker = "export type Json =";
const at = generated.indexOf(marker);
if (at === -1) {
  console.error("\x1b[31m❌ ผลลัพธ์ที่ได้ไม่มี 'export type Json =' — ไม่ใช่ types ที่ถูกต้อง\x1b[0m");
  console.error(generated.slice(0, 1500));
  process.exit(1);
}

const target = resolve(process.cwd(), "lib/supabase/database.types.ts");
const current = readFileSync(target, "utf8");
const headEnd = current.indexOf(marker);
if (headEnd === -1) {
  console.error("\x1b[31m❌ ไฟล์เดิมไม่มี 'export type Json =' — โครงสร้างเปลี่ยนไป ตรวจด้วยมือก่อน\x1b[0m");
  process.exit(1);
}

const header = current.slice(0, headEnd); // header + type ที่เขียนมือ (UserRole, ItemType, ...)
writeFileSync(target, header + generated.slice(at), "utf8");
console.log(`\x1b[32m✅ อัปเดต lib/supabase/database.types.ts แล้ว (เก็บ header ที่เขียนมือไว้ครบ)\x1b[0m`);
console.log("   ต่อไป: npm run typecheck แล้วดูว่ามีจุดไหนที่ types ใหม่ชี้ว่าโค้ดผิดบ้าง");
