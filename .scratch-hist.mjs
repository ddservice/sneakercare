import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: hist } = await sb.from("sc_opex_history").select("*").order("saved_at");
const { data: opex } = await sb.from("sc_opex").select("id, month, category, key, name, amount");
const nowSet = new Set(opex.map((r) => `${r.month}|${r.key}`));

// รวมทุก snapshot เข้าด้วยกัน แล้วเก็บ "ยอดที่เคยเห็นสูงสุด" ของแต่ละ (เดือน,key)
const everSeen = new Map();
for (const h of hist) {
  let items = [];
  try { items = JSON.parse(String(h.items ?? "[]")); } catch { continue; }
  for (const it of items) {
    const month = String(it.month ?? h.month);
    const k = `${month}|${it.key}`;
    const prev = everSeen.get(k);
    const amt = Number(it.amount || 0);
    if (!prev || amt > prev.amount) everSeen.set(k, { month, key: it.key, name: it.name, category: it.category, amount: amt, seenAt: h.saved_at });
  }
}
console.log(`snapshot ${hist.length} ชุด · (เดือน,key) ที่เคยมีทั้งหมด ${everSeen.size} รายการ`);
console.log(`ช่วงเวลาที่ snapshot ครอบคลุม: ${String(hist[0]?.saved_at).slice(0,10)} → ${String(hist.at(-1)?.saved_at).slice(0,10)}\n`);

const gone = [...everSeen.values()].filter((v) => !nowSet.has(`${v.month}|${v.key}`));
const goneWithMoney = gone.filter((v) => v.amount > 0 && v.key !== "audit_log");
console.log(`=== รายการที่เคยมีใน snapshot แต่ตอนนี้ไม่มีใน sc_opex แล้ว ===`);
if (gone.length === 0) console.log("  ✓ ไม่มีเลย — ไม่มีอะไรหายไประหว่างทาง");
else {
  console.log(`  ทั้งหมด ${gone.length} รายการ (มียอดเงิน > 0 จำนวน ${goneWithMoney.length} รายการ)`);
  for (const v of gone.sort((a, b) => (a.month < b.month ? -1 : 1))) {
    console.log(`   ${v.amount > 0 ? "⚠️" : "  "} ${v.month}  ${String(v.key).slice(0, 40).padEnd(42)} ${String(v.name ?? "").slice(0, 30).padEnd(32)} ${Number(v.amount).toFixed(2).padStart(12)}`);
  }
}

// เดือนที่ snapshot ครอบคลุม
const monthsInHist = [...new Set([...everSeen.values()].map((v) => v.month))].sort();
console.log(`\nเดือนที่มีใน snapshot: ${monthsInHist.join(", ")}`);
const monthsNow = [...new Set(opex.map((r) => r.month))].sort();
console.log(`เดือนที่มีใน sc_opex ตอนนี้: ${monthsNow.join(", ")}`);
