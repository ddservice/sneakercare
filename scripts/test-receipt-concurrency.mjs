#!/usr/bin/env node
/**
 * กันลงสมุดซ้ำที่ชั้น unique ของ Postgres ในฐานทดสอบ
 * PGlite คิวคำสั่งในเอนจินเดียว — ไม่ใช่สอง session ของ Postgres จริง
 */
import { PGlite } from "@electric-sql/pglite";

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

const db = new PGlite();
console.log("\n[receipt-db] unique ลงสมุดใบซื้อ");

await db.exec(`
  create table receipt_posts (
    tenant_id text not null,
    receipt_id text not null,
    request_id text not null,
    fingerprint text not null,
    vat_credit numeric not null,
    unique (tenant_id, receipt_id),
    unique (tenant_id, request_id)
  );
`);

const insert = (tenant, receipt, request, fingerprint) =>
  db.query(
    "insert into receipt_posts (tenant_id, receipt_id, request_id, fingerprint, vat_credit) values ($1,$2,$3,$4,70)",
    [tenant, receipt, request, fingerprint]
  );

const countFor = async (tenant) => {
  const res = await db.query("select count(*)::int as n from receipt_posts where tenant_id = $1", [tenant]);
  return Number(res.rows[0].n);
};

await insert("t1", "r1", "req-1", "fp-a");
check((await countFor("t1")) === 1, "ลงสมุดครั้งแรกสำเร็จ", "ครั้งแรกไม่ลง");

let duplicateReceipt = false;
try {
  await insert("t1", "r1", "req-2", "fp-a");
} catch {
  duplicateReceipt = true;
}
check(duplicateReceipt, "อนุมัติใบเดียวกันซ้ำโดน unique receipt_id", "ลงสมุดซ้ำได้");

let duplicateKey = false;
try {
  await insert("t1", "r2", "req-1", "fp-b");
} catch {
  duplicateKey = true;
}
check(duplicateKey, "คีย์กันซ้ำเดิม payload ต่างโดน unique request_id", "คีย์เดิมสร้างแถวใหม่ได้");

await insert("t2", "r1", "req-1", "fp-a");
check((await countFor("t2")) === 1, "กิจการอื่นลงใบของตัวเองได้", "ข้าม tenant แล้วโดนกันผิด");

const count = await db.query("select tenant_id, count(*)::int as n from receipt_posts group by tenant_id order by tenant_id");
check(
  count.rows.length === 2 && count.rows[0].n === 1 && count.rows[1].n === 1,
  "แต่ละกิจการมีหนึ่งแถว ไม่มี partial ซ้ำ",
  JSON.stringify(count.rows)
);

if (failures) {
  console.log(`\n[receipt-db] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[receipt-db] ผ่านทั้งหมด — PGlite เอนจินเดียว ไม่ใช่สอง session");
}
