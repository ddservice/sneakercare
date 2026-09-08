#!/usr/bin/env node
/**
 * ตรวจว่า "เงินที่จ่ายซื้อของเข้าคลัง" กับ "ค่าใช้จ่ายที่บันทึกไว้ในหน้าการเงิน" ตรงกันหรือไม่
 *
 * ⚠️ ทำไมต้องมี (2026-09-08): ระบบนี้มี ledger เงินสองสายที่แยกกันโดยสิ้นเชิง
 *   • `inv_stock_transactions` = ของเข้าคลัง (จำนวน + ต้นทุน) — หน้า /inventory, /stock-in
 *   • `sc_opex`                = เงินที่จ่ายออก — หน้า /expenses, /dashboard
 * และ **หน้าการเงินไม่เคยอ่าน ledger คลังสินค้าเลย** ⇒ ของที่ซื้อแล้วบันทึกแค่ฝั่งคลัง
 * จะ "หายไป" จากยอดค่าใช้จ่ายเงียบๆ ไม่มี error ให้เห็น
 *
 * เจอจริงตอนกระทบยอดกับ Excel ของเจ้าของ: ก.พ.–ก.ค. 69 ทุกเดือนขาดยอดตรงกับ ledger เป๊ะ
 * (ก.พ. 4,803 · มี.ค. 4,899.01 · เม.ย. 830 · พ.ค. 4,956 · มิ.ย. 3,561 · ก.ค. 2,284)
 *
 * ธรรมเนียมที่ตกลงกันแล้ว: **ของที่ซื้อเข้าร้านต้องบันทึกทั้งสองที่**
 *   ฝั่งคลัง = จำนวนของ/ต้นทุนถัวเฉลี่ย · ฝั่ง sc_opex = เงินที่จ่ายออกจริงในเดือนนั้น
 * สคริปต์นี้คือด่านที่คอยจับว่ามีเดือนไหนบันทึกไม่ครบทั้งสองฝั่ง
 *
 * รัน: npm run check:stock-vs-expenses
 * ต้องมี .env.local (ใช้ service_role อ่านอย่างเดียว ไม่เขียนอะไรทั้งสิ้น)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

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

// ── 1) เงินที่จ่ายซื้อของเข้าคลัง แยกตามเดือน ─────────────────────────────
const { data: txn, error: txnErr } = await sb
  .from("inv_stock_transactions")
  .select("id, transaction_date, txn_type, status, corrects_txn_id, total_cost, item_id");
if (txnErr) {
  console.error("อ่าน inv_stock_transactions ไม่สำเร็จ:", txnErr.message);
  process.exitCode = 1;
} else {
  // แถวที่ถูก "แก้ไขทับ" ไปแล้ว (มีแถวใหม่อ้าง corrects_txn_id มาที่มัน) ห้ามนับซ้ำ
  const superseded = new Set(txn.filter((t) => t.corrects_txn_id).map((t) => t.corrects_txn_id));

  const stockByMonth = {};
  for (const t of txn) {
    if (t.txn_type !== "stock_in" || t.status === "rejected") continue;
    if (superseded.has(t.id)) continue;
    const m = String(t.transaction_date || "").slice(0, 7);
    if (!m) continue;
    stockByMonth[m] = (stockByMonth[m] || 0) + Math.abs(Number(t.total_cost || 0));
  }

  // ── 2) ค่าใช้จ่ายฝั่งการเงินของเดือนเดียวกัน ─────────────────────────────
  const { data: opex, error: opexErr } = await sb.from("sc_opex").select("month, category, key, name, amount");
  if (opexErr) {
    console.error("อ่าน sc_opex ไม่สำเร็จ:", opexErr.message);
    process.exitCode = 1;
  } else {
    // หมวดที่ใช้บันทึก "ของที่ซื้อเข้าร้าน" — ถ้าเพิ่มหมวดใหม่ในอนาคตต้องมาเติมที่นี่
    const SUPPLY_CATEGORIES = new Set(["น้ำยา & วัสดุสิ้นเปลือง", "ดำเนินงาน & เบ็ดเตล็ด"]);
    const supplyByMonth = {};
    for (const r of opex) {
      if (!SUPPLY_CATEGORIES.has(String(r.category ?? ""))) continue;
      const [mm, yyyy] = String(r.month ?? "").split("/");
      if (!mm || !yyyy) continue;
      const key = `${yyyy}-${mm}`;
      supplyByMonth[key] = (supplyByMonth[key] || 0) + Number(r.amount || 0);
    }

    const months = [...new Set([...Object.keys(stockByMonth), ...Object.keys(supplyByMonth)])].sort();
    let mismatches = 0;

    console.log("\nเดือน     ซื้อเข้าคลัง (ledger)   ค่าใช้จ่ายหมวดของใช้   ต่าง");
    console.log("─".repeat(68));
    for (const m of months) {
      const stock = stockByMonth[m] || 0;
      const supply = supplyByMonth[m] || 0;
      const diff = supply - stock;
      const flag = Math.abs(diff) < 0.02 ? "✓" : "⚠️";
      if (flag === "⚠️") mismatches++;
      console.log(
        `${m}   ${baht(stock).padStart(16)}   ${baht(supply).padStart(18)}   ${baht(diff).padStart(12)} ${flag}`
      );
    }

    console.log("─".repeat(68));
    if (mismatches === 0) {
      console.log("✅ ทุกเดือนบันทึกครบทั้งสองฝั่ง");
    } else {
      console.log(`⚠️  มี ${mismatches} เดือนที่สองฝั่งไม่ตรงกัน`);
      console.log("   ติดลบ = ซื้อของเข้าคลังแล้วแต่ไม่ได้ลงค่าใช้จ่าย ⇒ กำไรในระบบสูงเกินจริง");
      console.log("   เป็นบวก = ลงค่าใช้จ่ายไว้แต่ไม่ได้รับของเข้าคลัง (อาจเป็นของที่ไม่ต้องสต๊อก ซึ่งปกติ)");
      console.log("   ตัวเลขนี้เป็นสัญญาณให้ไปดู ไม่ใช่คำตัดสินว่าผิด — ของบางอย่างไม่ต้องเข้าคลังจริงๆ");
    }
  }
}
