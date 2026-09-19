#!/usr/bin/env node
/**
 * 0046: unique ลงสมุดซื้อ + ปิดเส้นทาง live ที่ DB
 * PGlite เอนจินเดียว — สอง INSERT ตามลำดับใน connection เดียว
 * ถ้ามี TEST_DATABASE_URL จะลองสอง connection ของ Postgres จริง
 */
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0046_receipt_posts_and_live_guards.sql"), "utf8");
const rollback = fs.readFileSync(path.join(root, "supabase/migrations/rollback/0046_rollback.sql"), "utf8");

const T1 = "00000000-0000-0000-0000-000000000001";
const T2 = "00000000-0000-0000-0000-000000000002";

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
function isReplay(row) {
  return row?.replay === true || row?.replay === "t" || row?.replay === "true";
}

async function runSuite(name, exec, query) {
  console.log(`\n[0046 ${name}]`);
  await exec(sql);
  await exec(`select public.sc_fn_post_receipt('${T1}', 'r1', 'req-1', 'fp-a', 1070, 70, null);`);
  const first = await query("select count(*)::int as n from public.sc_receipt_posts where tenant_id = $1", [T1]);
  check(Number(first.rows[0].n) === 1, "ลงสมุดครั้งแรกสำเร็จ", "ครั้งแรกไม่ลง");

  const replay = await query("select * from public.sc_fn_post_receipt($1,'r1','req-1','fp-a',1070,70,null)", [T1]);
  check(isReplay(replay.rows[0]), "คีย์เดิม replay ไม่เพิ่มแถว", JSON.stringify(replay.rows[0]));

  let dupReceipt = false;
  try {
    await query("select * from public.sc_fn_post_receipt($1,'r1','req-2','fp-a',1070,70,null)", [T1]);
  } catch {
    dupReceipt = true;
  }
  check(dupReceipt, "ใบเดียวกันคีย์ใหม่โดนปฏิเสธ", "ลงซ้ำได้");

  let payloadConflict = false;
  try {
    await query("select * from public.sc_fn_post_receipt($1,'r1','req-1','fp-other',1070,70,null)", [T1]);
  } catch {
    payloadConflict = true;
  }
  check(payloadConflict, "คีย์เดิม payload ต่าง = conflict", "payload ต่างยังผ่าน");

  let dupKey = false;
  try {
    await exec(
      `insert into public.sc_receipt_posts (tenant_id, receipt_id, request_id, fingerprint, purchase_amount, vat_credit) values ('${T1}', 'r2', 'req-1', 'fp-b', 1, 0)`
    );
  } catch {
    dupKey = true;
  }
  check(dupKey, "คีย์กันซ้ำไปใช้ใบอื่นไม่ได้", "คีย์เดิมสร้างแถวใหม่ได้");

  await exec(`select public.sc_fn_post_receipt('${T2}', 'r1', 'req-1', 'fp-a', 1070, 70, null);`);
  const other = await query("select count(*)::int as n from public.sc_receipt_posts where tenant_id = $1", [T2]);
  check(Number(other.rows[0].n) === 1, "กิจการอื่นลงของตัวเองได้", "ข้าม tenant แล้วโดนกันผิด");

  let liveBlocked = 0;
  for (const feature of ["etax_live", "auto_issue", "cn_official"]) {
    try {
      await exec(`select public.sc_fn_guard_live_feature('${feature}')`);
    } catch {
      liveBlocked += 1;
    }
  }
  check(liveBlocked === 3, "เส้นทาง live สามเส้นถูกบล็อกที่ DB", `บล็อกได้ ${liveBlocked}`);

  await exec("begin");
  await exec(`select public.sc_fn_post_receipt('${T1}', 'r-partial', 'req-partial', 'fp-p', 10, 1, null);`);
  await exec("rollback");
  const afterRollback = await query("select count(*)::int as n from public.sc_receipt_posts where receipt_id = 'r-partial'");
  check(Number(afterRollback.rows[0].n) === 0, "rollback กลางทางไม่เหลือแถวบางส่วน", "มี partial posting");

  const rls = await query(`
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'sc_receipt_posts'
  `);
  check(
    rls.rows[0]?.relrowsecurity === true || rls.rows[0]?.relrowsecurity === "t",
    "เปิด RLS บน sc_receipt_posts",
    JSON.stringify(rls.rows[0])
  );

  await exec(sql);
  check(true, "รัน migration ซ้ำได้", "รันซ้ำพัง");
  await exec(rollback);
  const gone = await query(
    "select count(*)::int as n from information_schema.tables where table_schema='public' and table_name='sc_receipt_posts'"
  );
  check(Number(gone.rows[0].n) === 0, "rollback ลบตาราง", "rollback ไม่ลบ");
}

const db = new PGlite();
await runSuite(
  "PGlite fresh",
  (s) => db.exec(s),
  (s, params = []) => db.query(s, params)
);

{
  console.log("\n[0046 upgrade]");
  const prior = new PGlite();
  await prior.exec(`
    create table public.sc_settings (
      tenant_id uuid not null,
      key text not null,
      value text,
      primary key (tenant_id, key)
    );
    insert into public.sc_settings (tenant_id, key, value)
    values ('${T1}', 'receipt_staging', '[]');
  `);
  await prior.exec(sql);
  const both = await prior.query(`
    select
      (select count(*)::int from information_schema.tables where table_schema='public' and table_name='sc_receipt_posts') as posts,
      (select count(*)::int from public.sc_settings) as settings
  `);
  check(Number(both.rows[0].posts) === 1 && Number(both.rows[0].settings) === 1, "upgrade จาก schema เดิมไม่ลบ sc_settings", JSON.stringify(both.rows[0]));
}

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.log("\n[0046 postgres] ไม่รัน — ไม่มี TEST_DATABASE_URL (ฐานทดสอบแยกจาก production)");
} else {
  console.log("\n[0046 postgres] สอง connection");
  let pg;
  try {
    ({ default: pg } = await import("pg"));
  } catch {
    console.log("  • ไม่มีแพ็กเกจ pg — ไม่รันสอง connection");
    pg = null;
  }
  if (pg) {
    const a = new pg.Client({ connectionString: url });
    const b = new pg.Client({ connectionString: url });
    try {
      await a.connect();
      await b.connect();
      await a.query(sql);
      await a.query("begin");
      await b.query("begin");
      const raced = await Promise.allSettled([
        a.query("select public.sc_fn_post_receipt($1,'r-race','req-a','fp',10,1,null)", [T1]),
        b.query("select public.sc_fn_post_receipt($1,'r-race','req-b','fp',10,1,null)", [T1]),
      ]);
      const won = raced.filter((row) => row.status === "fulfilled").length;
      const lost = raced.filter((row) => row.status === "rejected").length;
      await a.query("commit").catch(() => a.query("rollback").catch(() => {}));
      await b.query("commit").catch(() => b.query("rollback").catch(() => {}));
      const n = await a.query("select count(*)::int as n from public.sc_receipt_posts where receipt_id = 'r-race'");
      check(
        Number(n.rows[0].n) === 1 && won === 1 && lost === 1,
        "สอง connection ลงใบเดียวกันได้หนึ่งแถว",
        JSON.stringify({ n: n.rows, raced })
      );
      await a.query(rollback);
    } catch (err) {
      bad(`Postgres ทดสอบพัง: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await a.end().catch(() => {});
      await b.end().catch(() => {});
    }
  }
}

if (failures) {
  console.log(`\n[0046] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[0046] ผ่านชุดที่รัน");
}
