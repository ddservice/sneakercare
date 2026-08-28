/**
 * ทดสอบว่าแถบเตือน "ประมาณการ" ในหน้าภาพรวมของ legacy ยังทำงานอยู่
 *
 *   node scripts/test-legacy-estimate-banner.mjs
 *
 * ทำไมต้องมี: หน้าภาพรวมใน legacy/sneakercare_dashboard.html เดา 2 ค่าจาก config
 * ปัจจุบันเมื่อช่วงเวลาที่เลือกยังบันทึก opex ไม่ครบ (ค่าเช่าห้อง + ประกันสังคม) เดิมมัน
 * เดาแบบเงียบๆ ทำให้ยอด "กำไรสุทธิ" ผิดไป 250 บาทโดยไม่มีอะไรบอก — เสียเวลาไล่หาสาเหตุ
 * ไปหนึ่งรอบเต็ม (ดู CLAUDE.md) ตอนนี้มีแถบเตือนแล้ว เทสต์นี้กันไม่ให้ใครลบทิ้งโดยไม่รู้ตัว
 *
 * ดึงฟังก์ชัน updateSummaryData ออกมาจากไฟล์ HTML จริงแล้วรันบน DOM ปลอมใน Node
 * (จงใจไม่ copy โค้ดมาเขียนใหม่ เพราะนั่นจะทดสอบแค่สำเนา ไม่ใช่ของที่ deploy จริง)
 *
 * exit 0 = ผ่าน / exit 1 = แถบเตือนพังหรือหายไป
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// อ้างอิงจากตำแหน่งไฟล์นี้ ไม่ใช่ cwd — จะได้รันได้ทั้งจาก root ของ repo และจาก CI
const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(HERE, "..", "legacy", "sneakercare_dashboard.html");
const text = fs.readFileSync(HTML, "utf-8");

// ตัดฟังก์ชันออกมาด้วยการนับวงเล็บปีกกา — ทนต่อการที่ไฟล์เลื่อนบรรทัด
// (hardcode เลขบรรทัดแล้วพังทันทีที่มีคนแก้ไฟล์ข้างบน ซึ่งเพิ่งเกิดจริง)
function extractFn(name) {
  const start = text.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`ไม่พบฟังก์ชัน ${name}`);
  let i = text.indexOf("{", start);
  let depth = 0;
  for (; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`วงเล็บของ ${name} ไม่ปิด`);
}

const SRC_UPDATE = extractFn("updateSummaryData");
const SRC_MONTHS = extractFn("_monthsInRange");
const SRC_ISO = extractFn("_isoDate");

// ── DOM ปลอม: จำค่าที่ถูกเขียนลงแต่ละ id ไว้ให้ตรวจได้ ────────────────────
const els = new Map();
function el(id) {
  if (!els.has(id)) {
    els.set(id, {
      id,
      _text: "",
      _html: "",
      value: "",
      className: "",
      style: {},
      get textContent() { return this._text; },
      set textContent(v) { this._text = String(v); },
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = String(v); },
    });
  }
  return els.get(id);
}

globalThis.document = { getElementById: (id) => el(id) };
globalThis.console = console;

// ── ข้อมูลตั้งต้น: เดือน 08/2026 มียอดขาย 1 บิล และบันทึกค่าแรงพนักงานไว้ ──
globalThis.DEFAULT_SIZE_PRICES = { S: 200, M: 400, L: 600, XL: 800 };
globalThis.saleSaved = [
  { date: "05/08/2026", size_s: 1, size_m: 0, size_l: 0, size_xl: 0,
    total_amount: 20000, payment_status: "ชำระครบ", received_amount: 20000 },
];
globalThis.expenseSaved = [];
globalThis._getReceivedForDate = () => 0;
globalThis._roomsConfig = [];
globalThis.employeesList = [];
globalThis.opexSaved = [];
globalThis.thaiDate = (d) => String(d);
globalThis._deductList = {};

// indirect eval → ประกาศฟังก์ชันลง global scope ให้เรียกได้จริง
// (eval ตรงๆ ใน ES module จะสร้างไว้ในขอบเขตของ eval เองแล้วเรียกไม่ได้)
const geval = eval;
geval(SRC_MONTHS);
geval(SRC_ISO);
geval(SRC_UPDATE);
const updateSummaryData = globalThis.updateSummaryData;

function run(label, setup) {
  els.clear();
  // ค่าเริ่มต้นของช่วงวันที่
  el("sum_date_from").value = "2026-08-01";
  el("sum_date_to").value = "2026-08-31";
  setup();
  updateSummaryData();
  const warn = el("sum_estimate_warning");
  const sub = el("sum_profit_sub");
  console.log(`\n=== ${label} ===`);
  console.log(`  กำไรสุทธิ      : ${el("sum_profit").textContent}`);
  console.log(`  แถบเตือนแสดง   : ${warn.style.display === "" ? "ใช่" : "ไม่"}`);
  console.log(`  badge ประมาณการ: ${sub.innerHTML.includes("ประมาณการ") ? "ใช่" : "ไม่"}`);
  if (warn.style.display === "") {
    const notes = warn.innerHTML.split("<br>").filter((l) => l.startsWith("• "));
    for (const n of notes) console.log(`    ${n.replace(/<[^>]+>/g, "")}`);
  }
  return { warn, sub };
}

let failures = 0;
const assert = (cond, msg) => {
  console.log(`  ${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
};

// [1] ข้อมูลครบ ไม่มีอะไรต้องเดา → ต้องไม่มีแถบเตือน
{
  const { warn, sub } = run("[1] opex ครบ (ไม่ควรมีแถบเตือน)", () => {
    globalThis._roomsConfig = [];
    globalThis.employeesList = [];
    globalThis.opexSaved = [
      { month: "08/2026", category: "ค่าดำเนินการ", key: "rent", name: "ค่าเช่าร้าน", amount: 5000 },
    ];
  });
  assert(warn.style.display === "none", "ไม่แสดงแถบเตือน");
  assert(!sub.innerHTML.includes("ประมาณการ"), "ไม่มี badge");
}

// [2] ค่าเช่าไม่ได้บันทึก แต่มี config ห้องเช่าอยู่ → fallback ต้องทำงาน + เตือน
{
  const { warn, sub } = run("[2] ค่าเช่าใช้ config ปัจจุบัน (ต้องเตือน)", () => {
    globalThis._roomsConfig = [{ tenant: "ผู้เช่า A", rent: 3500 }];
    globalThis.employeesList = [];
    globalThis.opexSaved = [];
  });
  assert(warn.style.display === "", "แสดงแถบเตือน");
  assert(sub.innerHTML.includes("ประมาณการ"), "มี badge ประมาณการ");
  assert(warn.innerHTML.includes("รายรับค่าเช่าห้อง"), "ระบุว่าค่าเช่าเป็นตัวที่ถูกเดา");
}

// [3] เคสจริงที่เจอ: บันทึกค่าแรงแล้วแต่ไม่มีแถว SSO → เดาจากเงินเดือนปัจจุบัน
{
  const { warn, sub } = run("[3] SSO เดาจากเงินเดือนปัจจุบัน (ต้องเตือน)", () => {
    globalThis._roomsConfig = [];
    globalThis.employeesList = [{ name: "สมชาย", status: "Active", salary: 2500 }];
    globalThis.opexSaved = [
      { month: "08/2026", category: "ค่าแรงพนักงาน", key: "emp_สมชาย",
        name: "เงินจ่ายพนักงาน: สมชาย", amount: 2375 },
    ];
  });
  assert(warn.style.display === "", "แสดงแถบเตือน");
  assert(sub.innerHTML.includes("ประมาณการ"), "มี badge ประมาณการ");
  assert(warn.innerHTML.includes("ประกันสังคม"), "ระบุว่า SSO เป็นตัวที่ถูกเดา");
  assert(warn.innerHTML.includes("250.00"), "แสดงยอดที่เดา = 125×2 = 250 บาท");
}

// [4] เดาทั้งสองอย่างพร้อมกัน → ต้องขึ้นทั้งคู่ ไม่ใช่แค่ตัวแรก
{
  const { warn } = run("[4] เดาทั้งค่าเช่าและ SSO (ต้องขึ้นครบ 2 ข้อ)", () => {
    globalThis._roomsConfig = [{ tenant: "ผู้เช่า A", rent: 3500 }];
    globalThis.employeesList = [{ name: "สมชาย", status: "Active", salary: 2500 }];
    globalThis.opexSaved = [
      { month: "08/2026", category: "ค่าแรงพนักงาน", key: "emp_สมชาย",
        name: "เงินจ่ายพนักงาน: สมชาย", amount: 2375 },
    ];
  });
  const count = warn.innerHTML.split("<br>").filter((l) => l.startsWith("• ")).length;
  assert(count === 2, `ขึ้นครบ 2 ข้อ (ได้ ${count})`);
}

// [5] เปลี่ยนกลับมาเป็นข้อมูลครบ → แถบเตือนต้องหายไป ไม่ค้างจากรอบก่อน
{
  const { warn, sub } = run("[5] กลับมาข้อมูลครบ (แถบต้องหาย ไม่ค้าง)", () => {
    globalThis._roomsConfig = [];
    globalThis.employeesList = [];
    globalThis.opexSaved = [
      { month: "08/2026", category: "ค่าดำเนินการ", key: "rent", name: "ค่าเช่าร้าน", amount: 5000 },
    ];
  });
  assert(warn.style.display === "none", "แถบเตือนหายไป");
  assert(warn.innerHTML === "", "ล้างข้อความเก่าทิ้ง");
  assert(!sub.innerHTML.includes("ประมาณการ"), "badge หายไป");
}

console.log(`\n${failures === 0 ? "✅ ผ่านทั้งหมด" : `❌ ล้มเหลว ${failures} ข้อ`}`);
process.exit(failures === 0 ? 0 : 1);
