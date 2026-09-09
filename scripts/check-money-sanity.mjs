#!/usr/bin/env node
/**
 * ตรวจว่าไม่มี "ตัวเลขที่ไม่ใช่เงิน" หลุดเข้าไปอยู่ในคอลัมน์เงินของ production
 *
 * ⚠️ ทำไมต้องมี: `sc_opex` เป็น key-value store ที่เก็บของหลายอย่างปนกัน และเคยมีแถว
 * `category='payslip_detail'` `key='audit_log'` ที่เอา **timestamp (1,787,827,245,489)
 * ไปใส่ในคอลัมน์ `amount`** — รอดมาได้เพราะโค้ดมี guard `amt < 10000000` กับ blacklist
 * ของ category ถ้าใครถอด guard ตัวใดตัวหนึ่งออก ยอดเงินทั้งระบบจะระเบิดทันที
 *
 * ตรวจ production เมื่อ 2026-09-09 แล้วพบว่า **ตอนนี้แถวพวกนั้นเป็น 0 หมดแล้ว** (ปลดชนวนแล้ว)
 * แต่ระบบเดิม (GAS) ยังเขียนแถวกลุ่มนี้อยู่ ⇒ มันกลับมาได้อีกทุกเมื่อ
 * เทสต์นี้จึงมีไว้แทน "คำเตือนในเอกสาร" ที่ไม่มีใครรัน — คำเตือนที่รันไม่ได้ ไม่ได้กันอะไรเลย
 *
 * รัน: npm run check:money  · อ่านอย่างเดียว ไม่เขียนอะไรทั้งสิ้น
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

/** เพดานเดียวกับ guard ในโค้ด (lib/expense-totals.ts, lib/expense-mirror.ts, migration 0024) */
const MAX_AMOUNT = 10_000_000;

function loadEnv() {
  const out = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}
const env = loadEnv();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const baht = (n) => Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

let failures = 0;
const fail = (m) => { console.log(`  ✗ ${m}`); failures++; };
const ok = (m) => console.log(`  ✓ ${m}`);

/** ตารางที่มีคอลัมน์เงิน + ชื่อคอลัมน์ที่ต้องอยู่ในช่วงที่สมเหตุสมผล */
const TARGETS = [
  { table: "sc_opex", cols: ["amount"], label: "ค่าใช้จ่าย/เงินเดือน (ตารางหลักของเงิน)" },
  { table: "sc_expense_entries", cols: ["amount"], label: "ค่าใช้จ่าย (ตารางใหม่)" },
  { table: "sc_payslips", cols: ["net_pay", "base_salary", "deduction_total"], label: "สลิปเงินเดือน" },
  { table: "sc_rental_records", cols: ["income_amount", "rent_amount"], label: "ห้องเช่า" },
];

for (const { table, cols, label } of TARGETS) {
  const { data, error } = await sb.from(table).select(["id", ...cols].join(", "));
  if (error) {
    // ตารางใหม่บางตัวอาจยังไม่มีบนฐานข้อมูลที่รันเทสต์นี้ — ไม่ใช่ความล้มเหลว
    console.log(`  – ${table}: อ่านไม่ได้ (${error.message}) ข้ามไป`);
    continue;
  }
  const rows = data ?? [];
  const bad = [];
  let max = 0;
  for (const r of rows) {
    for (const c of cols) {
      const v = Number(r[c] ?? 0);
      if (!Number.isFinite(v) || v < 0 || v >= MAX_AMOUNT) bad.push(`id=${r.id} ${c}=${r[c]}`);
      if (v > max) max = v;
    }
  }
  if (bad.length > 0) {
    fail(`${table} (${label}) มีค่าเงินนอกช่วง ${bad.length} จุด: ${bad.slice(0, 5).join(" · ")}`);
  } else {
    ok(`${table.padEnd(20)} ${String(rows.length).padStart(4)} แถว · สูงสุด ${baht(max).padStart(13)} · อยู่ในช่วง 0–${baht(MAX_AMOUNT)}`);
  }
}

console.log(
  failures === 0
    ? "\n✅ ไม่มีตัวเลขแปลกปลอมในคอลัมน์เงินสักจุด"
    : `\n❌ พบ ${failures} จุด — อย่าเพิ่งแตะ guard \`amt < ${MAX_AMOUNT}\` ในโค้ด ให้ไปแก้ที่ข้อมูลต้นทางก่อน`
);
process.exitCode = failures === 0 ? 0 : 1;
