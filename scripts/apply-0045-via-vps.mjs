#!/usr/bin/env node
/**
 * Apply migration 0045 บน production ผ่าน VPS + psql
 * (แบบเดียวกับ 0044 — เครื่อง dev ไม่มี SUPABASE_DB_URL)
 */
import { readFileSync, existsSync } from "node:fs";
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
  console.error("ต้องมี VPS_HOST / VPS_USER / VPS_PATH ใน .env.local");
  process.exit(1);
}

const sqlFile = `${remotePath}/supabase/migrations/0045_sales_service_order_link.sql`;
const remote = [
  "set -euo pipefail",
  "set -a",
  ". /home/ddservice/sneakercare-backup.env",
  "set +a",
  "echo APPLY_0045",
  `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "${sqlFile}"`,
  "echo VERIFY",
  `psql "$SUPABASE_DB_URL" -X -A -F '|' -c "select table_name || '.' || column_name from information_schema.columns where table_schema='public' and table_name='sc_sales' and column_name='service_order_id';"`,
  `psql "$SUPABASE_DB_URL" -X -A -F '|' -c "select indexname from pg_indexes where schemaname='public' and indexname='sc_sales_tenant_order_uidx';"`,
].join(" && ");

const args = [];
if (sshKey) args.push("-i", sshKey);
if (port !== "22") args.push("-p", port);
args.push(`${user}@${host}`, remote);

console.log(`apply 0045 ผ่าน ${user}@${host}`);
const res = spawnSync("ssh", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
if (res.stdout) process.stdout.write(res.stdout);
if (res.stderr) {
  const err = String(res.stderr).replace(/postgresql:\/\/[^\s]+/gi, "postgresql://***");
  process.stderr.write(err);
}
process.exit(res.status ?? 1);
