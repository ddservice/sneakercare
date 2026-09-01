#!/usr/bin/env node
/**
 * ส่งออกข้อมูลรายเดือนเป็นไฟล์ CSV ที่ "คนอ่านได้" — คู่กับ backup-db-to-r2.sh ไม่ใช่แทนกัน
 *
 * ทำไมต้องมีทั้งสองอย่าง:
 *   - backup-db-to-r2.sh ทำ pg_dump (.dump) = กู้ทั้งฐานข้อมูลกลับมาได้ครบ แต่เปิดดูเองไม่ได้
 *     ต้องมี pg_restore + Postgres เวอร์ชันตรงกัน และผูกกับ schema ปัจจุบัน
 *   - ไฟล์นี้ทำ CSV = เปิดด้วย Excel/Google Sheets ได้ทันที ใช้ส่งให้ผู้ทำบัญชี ตรวจย้อนหลัง
 *     หรืออ่านได้แม้วันที่ Supabase project หายไปทั้งก้อน โดยไม่ต้องพึ่งเครื่องมืออะไรเลย
 *
 * ใส่ BOM (﻿) ไว้หน้าไฟล์เสมอ — ถ้าไม่ใส่ Excel บน Windows จะอ่านภาษาไทยเป็นตัวขยะ
 *
 * ── วิธีใช้ ────────────────────────────────────────────────────────────────
 *   node --env-file=.env.local scripts/export-monthly-csv.mjs              # เดือนที่แล้ว
 *   node --env-file=.env.local scripts/export-monthly-csv.mjs --month=2026-08
 *   node --env-file=.env.local scripts/export-monthly-csv.mjs --out=/var/backups/rrs/csv
 *
 * ต้องมี env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * (ใช้ service_role เพราะต้องอ่านข้ามทุกสาขาและข้าม RLS — สคริปต์นี้รันบนเซิร์ฟเวอร์เท่านั้น
 *  ห้ามเอา key ไปไว้ฝั่ง client และห้าม commit ไฟล์ env)
 */

import fs from "node:fs";
import path from "node:path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "ต้องตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ก่อน\n" +
      "ตัวอย่าง: node --env-file=.env.local scripts/export-monthly-csv.mjs"
  );
  process.exit(1);
}

// ── อ่าน argument ──────────────────────────────────────────────────────────
function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

/** เดือนที่แล้วในเขตเวลาไทย — สคริปต์นี้ตั้งใจให้รันวันที่ 1 ของเดือนถัดไป */
function previousMonth() {
  const now = new Date();
  const bangkok = new Date(now.getTime() + 7 * 3600 * 1000); // UTC+7
  const y = bangkok.getUTCFullYear();
  const m = bangkok.getUTCMonth(); // 0-based ของเดือนปัจจุบัน
  const prev = new Date(Date.UTC(y, m - 1, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
}

const monthArg = arg("month") ?? previousMonth();
if (!/^\d{4}-\d{2}$/.test(monthArg)) {
  console.error(`รูปแบบ --month ต้องเป็น YYYY-MM (ได้รับ "${monthArg}")`);
  process.exit(1);
}

const [yearStr, monthStr] = monthArg.split("-");
const year = Number(yearStr);
const month = Number(monthStr);

// ขอบเขตเดือนแบบ [เริ่ม, ก่อนวันแรกของเดือนถัดไป) — ใช้ครึ่งเปิดเสมอ
// ถ้าใช้ <= วันสุดท้ายของเดือน แถวที่มีเวลา 23:30 น. ของวันสุดท้ายจะหลุดหายไปเงียบๆ
const rangeStart = `${yearStr}-${monthStr}-01`;
const nextMonth = month === 12 ? `${year + 1}-01` : `${yearStr}-${String(month + 1).padStart(2, "0")}`;
const rangeEndExclusive = `${nextMonth}-01`;

/** คีย์เดือนแบบที่ระบบเดิม (Google Sheets) ใช้ใน sc_opex คือ "MM/YYYY" */
const opexMonthKey = `${monthStr}/${yearStr}`;

const outDir = arg("out") ?? path.join(process.cwd(), "exports", monthArg);

// ── ตารางที่ส่งออก ─────────────────────────────────────────────────────────
// required: false = ถ้าตารางยังไม่มีในฐานข้อมูลนี้ ให้ข้ามพร้อมเตือน ไม่ใช่ล้มทั้งงาน
const TABLES = [
  {
    table: "sc_sales",
    file: "ยอดขายรายวัน",
    order: "date",
    filters: [`date=gte.${rangeStart}`, `date=lt.${rangeEndExclusive}`],
    required: true,
  },
  {
    table: "sc_payments",
    file: "รับชำระค้างจ่าย",
    order: "received_date",
    filters: [`received_date=gte.${rangeStart}`, `received_date=lt.${rangeEndExclusive}`],
    required: true,
  },
  {
    table: "sc_opex",
    file: "ค่าใช้จ่ายและเงินเดือน",
    order: "id",
    filters: [`month=eq.${encodeURIComponent(opexMonthKey)}`],
    required: true,
  },
  {
    table: "sc_audit_logs",
    file: "audit-log-แอป",
    order: "created_at",
    filters: [`created_at=gte.${rangeStart}`, `created_at=lt.${rangeEndExclusive}`],
    required: false, // ต้องรัน migration 0011 ก่อนถึงจะมี
  },
  {
    table: "audit_logs",
    file: "audit-log-คลังสินค้า",
    order: "performed_at",
    filters: [`performed_at=gte.${rangeStart}`, `performed_at=lt.${rangeEndExclusive}`],
    required: false,
  },
  {
    table: "stock_transactions",
    file: "ความเคลื่อนไหวสต๊อก",
    order: "created_at",
    filters: [`created_at=gte.${rangeStart}`, `created_at=lt.${rangeEndExclusive}`],
    required: false,
  },
];

const PAGE = 1000; // PostgREST คืนสูงสุดครั้งละ 1000 แถวโดย default จึงต้องวนดึงเป็นหน้าๆ

async function fetchAll({ table, order, filters }) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const qs = ["select=*", `order=${order}.asc`, ...filters].join("&");
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Range: `${offset}-${offset + PAGE - 1}`,
        "Range-Unit": "items",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`${res.status} ${body.slice(0, 300)}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }

    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

/** หนีอักขระตามมาตรฐาน RFC 4180 — คั่นด้วย , ครอบด้วย " และ " ข้างในเป็น "" */
function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  if (rows.length === 0) return "﻿";
  // รวมคีย์จากทุกแถว เผื่อบางแถวมี column ที่แถวแรกไม่มี (jsonb ที่เป็น null ฯลฯ)
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h])).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

// ── ทำงานจริง ──────────────────────────────────────────────────────────────
fs.mkdirSync(outDir, { recursive: true });

console.log(`ส่งออกข้อมูลเดือน ${monthArg} (${rangeStart} ถึงก่อน ${rangeEndExclusive})`);
console.log(`ปลายทาง: ${outDir}\n`);

let written = 0;
let skipped = 0;
let failed = 0;
const summary = [];

for (const spec of TABLES) {
  try {
    const rows = await fetchAll(spec);
    const file = path.join(outDir, `${monthArg}_${spec.file}.csv`);
    fs.writeFileSync(file, toCsv(rows), "utf8");
    written++;
    summary.push(`  ✔ ${spec.file.padEnd(24)} ${String(rows.length).padStart(6)} แถว  → ${path.basename(file)}`);
  } catch (err) {
    const missing =
      err.status === 404 || /PGRST205|does not exist|schema cache/i.test(err.body ?? err.message ?? "");
    if (missing && !spec.required) {
      skipped++;
      summary.push(`  – ${spec.file.padEnd(24)} ข้าม (ไม่มีตาราง ${spec.table} ในฐานข้อมูลนี้)`);
      continue;
    }
    failed++;
    summary.push(`  ✘ ${spec.file.padEnd(24)} ล้มเหลว: ${err.message}`);
  }
}

console.log(summary.join("\n"));
console.log(`\nสรุป: เขียน ${written} ไฟล์, ข้าม ${skipped}, ล้มเหลว ${failed}`);

// exit code ต้องไม่เป็น 0 เมื่อมีตารางที่ "ต้องมี" ล้มเหลว — ไม่งั้น cron จะคิดว่าสำเร็จ
// แล้วเราจะได้ไฟล์สำรองที่ขาดข้อมูลการเงินโดยไม่มีใครรู้
if (failed > 0) process.exit(1);
