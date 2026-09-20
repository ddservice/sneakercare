#!/usr/bin/env node
/**
 * สอง connection ของ Postgres จริง สำหรับลงสมุดใบเสร็จ
 * ไม่ใช้ production · ไม่มี URL แล้วพยายามขึ้น embedded-postgres
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ledger = await import(new URL("../.test-build/receipt-ledger.js", import.meta.url).href);
const isProductionDatabaseUrl = ledger.isProductionDatabaseUrl;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function sqlWithoutComments(text) {
  return String(text).replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}
const sql = sqlWithoutComments(
  fs.readFileSync(path.join(root, "supabase/migrations/0046_receipt_posts_and_live_guards.sql"), "utf8")
);
const rollback = sqlWithoutComments(
  fs.readFileSync(path.join(root, "supabase/migrations/rollback/0046_rollback.sql"), "utf8")
);
const T1 = "00000000-0000-0000-0000-000000000001";

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};

async function loadPg() {
  try {
    return (await import("pg")).default;
  } catch {
    return null;
  }
}

async function startEmbedded() {
  let EmbeddedPostgres;
  try {
    ({ default: EmbeddedPostgres } = await import("embedded-postgres"));
  } catch {
    return null;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rrs-pg-"));
  const port = 55432 + Math.floor(Math.random() * 200);
  const server = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: false,
    initdbFlags: ["--encoding=UTF8"],
    onLog: () => {},
    onError: (msg) => console.log(`  • embedded-postgres: ${msg}`),
  });
  console.log("  • initialise embedded-postgres");
  await server.initialise();
  console.log("  • start embedded-postgres");
  await server.start();
  return {
    url: `postgres://postgres:postgres@127.0.0.1:${port}/postgres`,
    stop: async () => {
      await server.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function runRace(url) {
  const pg = await loadPg();
  if (!pg) {
    bad("มี URL แต่ไม่มีแพ็กเกจ pg");
    return;
  }
  const a = new pg.Client({ connectionString: url });
  const b = new pg.Client({ connectionString: url });
  process.env.PGCLIENTENCODING = "UTF8";
  try {
    await a.connect();
    await b.connect();
    await a.query("set client_encoding to 'UTF8'");
    await b.query("set client_encoding to 'UTF8'");
    await a.query("set statement_timeout = '15s'");
    await b.query("set statement_timeout = '15s'");
    await a.query("set lock_timeout = '8s'");
    await b.query("set lock_timeout = '8s'");
    console.log("  • ใส่ migration 0046");
    await a.query(sql);
    console.log("  • แข่งสอง session");
    const raced = await Promise.allSettled([
      a.query("select public.sc_fn_post_receipt($1,'r-race','req-a','fp',10,1,null)", [T1]),
      b.query("select public.sc_fn_post_receipt($1,'r-race','req-b','fp',10,1,null)", [T1]),
    ]);
    const won = raced.filter((row) => row.status === "fulfilled").length;
    const lost = raced.filter((row) => row.status === "rejected").length;
    const n = await a.query("select count(*)::int as n from public.sc_receipt_posts where receipt_id = 'r-race'");
    if (Number(n.rows[0].n) === 1 && won === 1 && lost === 1) {
      ok("สอง connection ลงใบเดียวกันได้หนึ่งแถว");
    } else {
      bad(`แข่งไม่จบที่หนึ่งแถว n=${n.rows[0].n} won=${won} lost=${lost}`);
    }
    await a.query(rollback);
  } catch (err) {
    bad(`Postgres ทดสอบพัง: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await a.end().catch(() => {});
    await b.end().catch(() => {});
  }
}

console.log("\n[receipt-pg] สอง connection");
const given = process.env.TEST_DATABASE_URL || "";
if (given && isProductionDatabaseUrl(given)) {
  bad("TEST_DATABASE_URL ชี้ production — ปฏิเสธ");
} else if (given) {
  await runRace(given);
} else {
  let embedded = null;
  try {
    embedded = await startEmbedded();
  } catch (err) {
    console.log(`  • ขึ้น embedded-postgres ไม่ได้: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!embedded) {
    console.log("  • ไม่รัน — ไม่มี TEST_DATABASE_URL และขึ้น Postgres ฝังไม่ได้");
  } else {
    try {
      await runRace(embedded.url);
    } finally {
      await embedded.stop();
    }
  }
}

if (failures) {
  console.log(`\n[receipt-pg] ล้ม ${failures} ข้อ`);
  process.exit(1);
} else {
  console.log("\n[receipt-pg] ผ่านชุดที่รัน");
}
