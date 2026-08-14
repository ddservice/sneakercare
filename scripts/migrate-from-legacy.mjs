#!/usr/bin/env node
/**
 * One-time import จาก CSV ที่ export มาจาก Google Sheets ระบบเดิม
 *
 * ชีตที่รองรับ:
 *   SC_Stock_Status: name, category, unit, qty, last_price, min_alert
 *     (หัวคอลัมน์ไทย: รายการวัสดุ, หมวดหมู่, หน่วย, คงเหลือ, ราคาล่าสุด, จุดสั่งซื้อขั้นต่ำ)
 *   SC_Stock_Transactions: date, type, item_name, qty, price_per_unit, total, ...
 *
 * ห้าม copy รหัสผ่านจาก SC_Users — เชิญผู้ใช้ใหม่ผ่านหน้า /admin/users
 *
 * ใช้ service_role จาก .env.local (bypass RLS) แล้วยิง insert เข้า stock_transactions
 * เพื่อให้ trigger คำนวณยอด/ต้นทุนถัวเฉลี่ยเอง ห้าม UPDATE item_stock ตรงๆ
 *
 * ตัวอย่าง:
 *   node --env-file=.env.local scripts/migrate-from-legacy.mjs --branch-id <uuid> --performed-by <admin-uuid> --stock ./import/SC_Stock_Status.csv --dry-run
 *   node --env-file=.env.local scripts/migrate-from-legacy.mjs --branch-id <uuid> --performed-by <admin-uuid> --stock ./import/SC_Stock_Status.csv --txns ./import/SC_Stock_Transactions.csv
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell.trim());
    if (row.some((value) => value !== "")) rows.push(row);
  }
  return rows;
}

function headerIndex(header) {
  const map = new Map(header.map((name, i) => [name.toLowerCase(), i]));
  const pick = (...aliases) => {
    for (const alias of aliases) {
      const i = map.get(alias.toLowerCase());
      if (i !== undefined) return i;
    }
    return -1;
  };
  return { pick };
}

function guessItemType(category, unit) {
  const text = `${category} ${unit}`.toLowerCase();
  if (/(ml|ก\.?มล|กรัม|g\b|น้ำยา|เคมี)/i.test(text)) return "consumable";
  return "inventory";
}

function toIsoDate(value) {
  if (!value) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return new Date(value).toISOString();
  const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00`).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

const branchId = arg("--branch-id");
const performedBy = arg("--performed-by");
const stockPath = arg("--stock");
const txnsPath = arg("--txns");
const dryRun = hasFlag("--dry-run");

if (!branchId || !performedBy) {
  console.error("ต้องระบุ --branch-id และ --performed-by (uuid ของ Admin ใน profiles)");
  process.exit(1);
}
if (!stockPath && !txnsPath) {
  console.error("ต้องระบุอย่างน้อย --stock และ/หรือ --txns เป็นไฟล์ CSV");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("ตั้ง NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน .env.local แล้วรันด้วย node --env-file=.env.local");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: branch, error: branchError } = await supabase.from("branches").select("id, name").eq("id", branchId).single();
if (branchError || !branch) {
  console.error("ไม่พบสาขา:", branchError?.message);
  process.exit(1);
}

console.log(`สาขา: ${branch.name} (${branch.id})`);
if (dryRun) console.log("โหมด dry-run — จะไม่เขียนลงฐานข้อมูล");

async function loadItemsByName() {
  const { data, error } = await supabase.from("items").select("id, name");
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((item) => [item.name.trim().toLowerCase(), item.id]));
}

let nameToId = await loadItemsByName();

if (stockPath) {
  const rows = parseCsv(readFileSync(stockPath, "utf8"));
  const { pick } = headerIndex(rows[0] ?? []);
  const iName = pick("name", "รายการวัสดุ", "สินค้า");
  const iCat = pick("category", "หมวดหมู่");
  const iUnit = pick("unit", "หน่วย");
  const iQty = pick("qty", "คงเหลือ");
  const iPrice = pick("last_price", "ราคาล่าสุด");
  const iMin = pick("min_alert", "จุดสั่งซื้อขั้นต่ำ");
  if (iName < 0) {
    console.error("CSV สต๊อกต้องมีคอลัมน์ name / รายการวัสดุ");
    process.exit(1);
  }

  for (const row of rows.slice(1)) {
    const name = row[iName];
    if (!name) continue;
    const category = iCat >= 0 ? row[iCat] || "ทั่วไป" : "ทั่วไป";
    const unit = iUnit >= 0 ? row[iUnit] || "ชิ้น" : "ชิ้น";
    const qty = iQty >= 0 ? Number(row[iQty]) || 0 : 0;
    const price = iPrice >= 0 ? Number(row[iPrice]) || 0 : 0;
    const min = iMin >= 0 ? Number(row[iMin]) || 0 : 0;
    const itemType = guessItemType(category, unit);

    console.log(`item: ${name} qty=${qty} ${unit} type=${itemType}`);
    if (dryRun) continue;

    let itemId = nameToId.get(name.toLowerCase());
    if (!itemId) {
      const { data, error } = await supabase
        .from("items")
        .insert({
          name,
          item_type: itemType,
          category,
          base_unit: unit,
          purchase_unit: unit,
          purchase_unit_qty: 1,
          default_min_stock_level: min,
        })
        .select("id")
        .single();
      if (error) {
        console.error(`  สร้างสินค้าไม่สำเร็จ: ${error.message}`);
        continue;
      }
      itemId = data.id;
      nameToId.set(name.toLowerCase(), itemId);
    }

    if (qty > 0) {
      const { error } = await supabase.from("stock_transactions").insert({
        item_id: itemId,
        branch_id: branchId,
        txn_type: "stock_in",
        quantity_delta: qty,
        unit_cost_snapshot: price,
        reference_type: "manual",
        reference_note: "opening balance จาก SC_Stock_Status",
        performed_by: performedBy,
      });
      if (error) console.error(`  เปิดยอดไม่สำเร็จ: ${error.message}`);
    }
  }
}

if (txnsPath) {
  nameToId = await loadItemsByName();
  const rows = parseCsv(readFileSync(txnsPath, "utf8"));
  const { pick } = headerIndex(rows[0] ?? []);
  const iDate = pick("date", "วันที่");
  const iType = pick("type", "ประเภท");
  const iName = pick("item_name", "สินค้า", "รายการ");
  const iQty = pick("qty", "จำนวน");
  const iPrice = pick("price_per_unit", "ราคาต่อหน่วย");
  const iTotal = pick("total", "total_amount", "ยอดรวม");

  const body = rows.slice(1).filter((row) => row[iName]);
  body.sort((a, b) => new Date(toIsoDate(a[iDate])).getTime() - new Date(toIsoDate(b[iDate])).getTime());

  for (const row of body) {
    const name = row[iName];
    const typeRaw = String(row[iType] ?? "");
    const isIn = /ซื้อ|รับเข้า|in/i.test(typeRaw);
    const qty = Math.abs(Number(row[iQty]) || 0);
    if (!qty) continue;
    const total = Number(row[iTotal]) || 0;
    const price = Number(row[iPrice]) || (qty ? total / qty : 0);
    const itemId = nameToId.get(name.trim().toLowerCase());
    if (!itemId) {
      console.error(`ข้ามรายการ ไม่พบสินค้า: ${name}`);
      continue;
    }

    console.log(`txn: ${toIsoDate(row[iDate])} ${isIn ? "stock_in" : "stock_out"} ${name} ${qty}`);
    if (dryRun) continue;

    const { error } = await supabase.from("stock_transactions").insert({
      item_id: itemId,
      branch_id: branchId,
      txn_type: isIn ? "stock_in" : "stock_out",
      quantity_delta: isIn ? qty : -qty,
      unit_cost_snapshot: isIn ? price : 0,
      reference_type: "manual",
      reference_note: `migrate จาก SC_Stock_Transactions ${row[iDate] ?? ""}`.trim(),
      performed_by: performedBy,
    });
    if (error) console.error(`  บันทึกไม่สำเร็จ: ${error.message}`);
  }
}

console.log("เสร็จแล้ว");
