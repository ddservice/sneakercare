#!/usr/bin/env node
/**
 * รัน migration 0039 (ย้าย FK ของ ext_documents.branch_id ไปสาขาจริงของแอป) ผ่าน PGlite
 *
 * สิ่งที่ตรวจ:
 *   1. ก่อนแก้: ใส่ UUID ของ inv_branches แล้วโดน FK ปฏิเสธ (จำลองบั๊ก production)
 *   2. หลังแก้: ใส่ UUID เดียวกันได้, UUID ที่ไม่มีในสาขาจริงยังโดนปฏิเสธ
 *   3. รันซ้ำได้ (idempotent)
 *   4. โลกที่ไม่มี inv_branches มีแค่ branches (local/CI) ก็ผูก FK ได้
 *   5. rollback คืนไปชี้ ext_branches แล้ว UUID ของ inv_branches โดนปฏิเสธอีกครั้ง
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql0039 = fs.readFileSync(
  path.join(root, "supabase/migrations/0039_ext_documents_branch_fk.sql"),
  "utf8"
);
const rollback0039 = fs.readFileSync(
  path.join(root, "supabase/migrations/rollback/0039_rollback.sql"),
  "utf8"
);

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
function check(cond, okMsg, badMsg) {
  if (cond) ok(okMsg);
  else bad(badMsg);
}

const REAL_BRANCH = "10000000-0000-0000-0000-0000000000b1";
const GHOST_BRANCH = "20000000-0000-0000-0000-0000000000b2";

async function fkTarget(db) {
  const r = await db.query(`
    select c.confrelid::regclass::text as target
    from pg_constraint c
    where c.conname = 'ext_documents_branch_id_fkey'
  `);
  return r.rows[0]?.target ?? null;
}

async function canInsert(db, branchId) {
  try {
    await db.query(`insert into extension_layer.ext_documents (branch_id) values ($1)`, [branchId]);
    await db.query(`delete from extension_layer.ext_documents`);
    return true;
  } catch {
    return false;
  }
}

console.log("\n[1] โลก A: production (มี inv_branches + ext_branches ว่าง)");
{
  const db = new PGlite();
  await db.exec(`
    create schema extension_layer;
    create table extension_layer.ext_branches (id uuid primary key);
    create table public.inv_branches (id uuid primary key);
    create table extension_layer.ext_documents (
      id uuid primary key default gen_random_uuid(),
      branch_id uuid references extension_layer.ext_branches(id)
    );
    insert into public.inv_branches (id) values ('${REAL_BRANCH}');
  `);

  check(
    (await fkTarget(db)) === "extension_layer.ext_branches",
    "ก่อนแก้ FK ชี้ ext_branches",
    `ก่อนแก้ FK ชี้ ${(await fkTarget(db))}`
  );
  check(
    !(await canInsert(db, REAL_BRANCH)),
    "ก่อนแก้ ใส่ UUID ของ inv_branches ไม่ได้ (บั๊กที่เจอจริง)",
    "ก่อนแก้ ใส่ UUID ของ inv_branches ได้ — เทสต์จำลอง FK ผิด"
  );

  await db.exec(sql0039);
  check(
    (await fkTarget(db)) === "inv_branches" || (await fkTarget(db)) === "public.inv_branches",
    "หลังแก้ FK ชี้ inv_branches",
    `หลังแก้ FK ชี้ ${await fkTarget(db)}`
  );
  check(await canInsert(db, REAL_BRANCH), "หลังแก้ ใส่ UUID ของสาขาจริงได้", "หลังแก้ยังใส่สาขาจริงไม่ได้");
  check(!(await canInsert(db, GHOST_BRANCH)), "UUID ที่ไม่มีในสาขาจริงยังถูกปฏิเสธ", "รับ UUID มั่วได้");

  await db.exec(sql0039);
  check(
    (await fkTarget(db)) === "inv_branches" || (await fkTarget(db)) === "public.inv_branches",
    "รันซ้ำได้ (idempotent)",
    "รันซ้ำแล้ว FK หายหรือชี้ผิด"
  );

  await db.exec(rollback0039);
  check(
    (await fkTarget(db)) === "extension_layer.ext_branches",
    "rollback คืนไปชี้ ext_branches",
    `rollback แล้ว FK ชี้ ${await fkTarget(db)}`
  );
  check(!(await canInsert(db, REAL_BRANCH)), "หลัง rollback ใส่สาขาจริงไม่ได้เหมือนเดิม", "rollback ไม่คืนพฤติกรรมเดิม");
  await db.close();
}

console.log("\n[2] โลก B: local/CI (มีแค่ public.branches ไม่มี inv_branches)");
{
  const db = new PGlite();
  await db.exec(`
    create schema extension_layer;
    create table extension_layer.ext_branches (id uuid primary key);
    create table public.branches (id uuid primary key);
    create table extension_layer.ext_documents (
      id uuid primary key default gen_random_uuid(),
      branch_id uuid references extension_layer.ext_branches(id)
    );
    insert into public.branches (id) values ('${REAL_BRANCH}');
  `);
  await db.exec(sql0039);
  check(
    (await fkTarget(db)) === "branches" || (await fkTarget(db)) === "public.branches",
    "โลก B ผูก FK ไป public.branches",
    `โลก B FK ชี้ ${await fkTarget(db)}`
  );
  check(await canInsert(db, REAL_BRANCH), "โลก B ใส่สาขาจริงได้", "โลก B ใส่สาขาจริงไม่ได้");
  await db.close();
}

console.log(
  failures === 0
    ? `\n✅ migration 0039 ผ่านทุกข้อ — FK ย้ายไปสาขาจริงของแอปทั้งสองโลก, idempotent, rollback สะอาด`
    : `\n❌ พบ ${failures} ข้อที่ไม่ผ่าน`
);
process.exitCode = failures === 0 ? 0 : 1;
