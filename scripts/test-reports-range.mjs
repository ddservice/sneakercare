/**
 * เทสต์ตรรกะบริสุทธิ์ของหน้ารายงานและการแบ่งหน้า
 *
 *   node scripts/test-reports-range.mjs
 *
 * ครอบส่วนที่พลาดง่ายที่สุดและมองไม่เห็นด้วยตาเปล่า: คณิตศาสตร์ขอบเดือน (ตกหล่นเดือน
 * สุดท้าย, ข้ามปี), การ escape CSV, และเลขหน้า — ทั้งหมดไม่ต้องต่อ Supabase และไม่ต้อง
 * ล็อกอิน จึงรันใน CI ได้
 *
 * ใช้ type stripping ของ Node (>=22.6) import ไฟล์ .ts ตรงๆ ไม่ต้องมี build step
 */
import {
  boundsFor,
  currentMonthKey,
  formatMonthLabel,
  resolveMonthRange,
  shiftMonth,
  sanitizeMonthKey,
  toCsv,
} from "../lib/reports-range.ts";
import {
  DEFAULT_PAGE_SIZE,
  hasNext,
  hasPrev,
  pageInfo,
  parsePage,
  rangeFor,
  rangeLabel,
  totalPages,
} from "../lib/pagination.ts";

let failures = 0;
let checks = 0;
function eq(actual, expected, label) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : `\n      คาดหวัง ${e}\n      ได้จริง ${a}`}`);
}

const NOW = new Date("2026-08-28T00:00:00Z");

console.log("\n=== ช่วงเดือน ===");
eq(currentMonthKey(NOW), "2026-08", "เดือนปัจจุบันจาก UTC");
eq(shiftMonth("2026-08", 1), "2026-09", "เลื่อนไป 1 เดือน");
eq(shiftMonth("2026-12", 1), "2027-01", "ข้ามปีขึ้น");
eq(shiftMonth("2026-01", -1), "2025-12", "ข้ามปีลง");
eq(shiftMonth("2026-08", -11), "2025-09", "ถอย 11 เดือน");

eq(sanitizeMonthKey("2026-08"), "2026-08", "รูปแบบถูกต้อง");
eq(sanitizeMonthKey("2026-13"), null, "เดือน 13 ไม่ผ่าน");
eq(sanitizeMonthKey("2026-00"), null, "เดือน 00 ไม่ผ่าน");
eq(sanitizeMonthKey("abcd-ef"), null, "ตัวอักษรไม่ผ่าน");
eq(sanitizeMonthKey("2026-8"), null, "ไม่เติมศูนย์หน้าไม่ผ่าน");
eq(sanitizeMonthKey(undefined), null, "ค่าว่างไม่ผ่าน");
eq(sanitizeMonthKey("'; drop table items;--"), null, "ค่าที่จงใจก่อกวนไม่ผ่าน");

console.log("\n=== resolveMonthRange ===");
eq(resolveMonthRange(undefined, undefined, NOW), { from: "2025-09", to: "2026-08" },
  "ค่าเริ่มต้น = 12 เดือนล่าสุด (นับรวมเดือนนี้)");
eq(resolveMonthRange("2026-01", "2026-03", NOW), { from: "2026-01", to: "2026-03" },
  "ระบุครบใช้ตามนั้น");
eq(resolveMonthRange("2026-06", "2026-02", NOW), { from: "2026-02", to: "2026-06" },
  "กรอกกลับหัวแล้วสลับให้");
eq(resolveMonthRange("ขยะ", "2026-03", NOW), { from: "2025-04", to: "2026-03" },
  "from เสียแล้วถอยจาก to 12 เดือน");
eq(resolveMonthRange("2026-05", "ขยะ", NOW), { from: "2026-05", to: "2026-08" },
  "to เสียแล้วใช้เดือนปัจจุบัน");
eq(resolveMonthRange("2026-08", "2026-08", NOW), { from: "2026-08", to: "2026-08" },
  "เดือนเดียว");

console.log("\n=== ขอบ query (จุดที่พลาดง่ายที่สุด) ===");
eq(boundsFor({ from: "2026-08", to: "2026-08" }),
  { gte: "2026-08-01T00:00:00.000Z", lt: "2026-09-01T00:00:00.000Z" },
  "เดือนเดียวต้องครอบทั้งเดือน ไม่ใช่แค่วันที่ 1");
eq(boundsFor({ from: "2026-11", to: "2026-12" }),
  { gte: "2026-11-01T00:00:00.000Z", lt: "2027-01-01T00:00:00.000Z" },
  "จบเดือน ธ.ค. ขอบบนต้องข้ามไปปีถัดไป");

// ตรวจว่าเดือนสุดท้ายไม่ตกหล่นจริง โดยจำลองแถวจาก v_monthly_cogs
//
// ต้องเทียบด้วย Date.parse ไม่ใช่เทียบสตริงตรงๆ เพราะ PostgREST ส่งขอบไปให้ Postgres
// เทียบเป็น timestamptz ไม่ใช่ text — และการเทียบสตริงให้ผลผิดจริงตรงนี้ด้วย ("+00:00"
// ของ Postgres กับ ".000Z" ของ toISOString ต่างกันที่อักขระ '+' (0x2B) กับ '.' (0x2E))
{
  const { gte, lt } = boundsFor({ from: "2026-07", to: "2026-08" });
  const rows = [
    { month: "2026-06-01T00:00:00+00:00" },
    { month: "2026-07-01T00:00:00+00:00" },
    { month: "2026-08-01T00:00:00+00:00" },
    { month: "2026-09-01T00:00:00+00:00" },
  ];
  const gteMs = Date.parse(gte);
  const ltMs = Date.parse(lt);
  const kept = rows
    .filter((r) => Date.parse(r.month) >= gteMs && Date.parse(r.month) < ltMs)
    .map((r) => r.month.slice(0, 7));
  eq(kept, ["2026-07", "2026-08"], "กรองได้ ก.ค.+ส.ค. ไม่กินเดือนข้างเคียง");
}

console.log("\n=== formatMonthLabel ===");
eq(typeof formatMonthLabel("2026-08-01T00:00:00+00:00"), "string", "คืนสตริงได้ไม่ throw");

console.log("\n=== CSV ===");
eq(toCsv(["a"], []).startsWith("﻿"), true, "มี BOM นำหน้า (กัน Excel อ่านไทยเป็นตัวขยะ)");
eq(toCsv(["เดือน", "ยอด"], [["สิงหาคม 2569", 1234.5]]),
  "﻿เดือน,ยอด\r\nสิงหาคม 2569,1234.5\r\n", "แถวปกติ + CRLF");
eq(toCsv(["a"], [["มี,คอมมา"]]), "﻿a\r\n\"มี,คอมมา\"\r\n", "ค่าที่มีคอมมาถูกครอบด้วยอัญประกาศ");
eq(toCsv(["a"], [['มี"อัญประกาศ']]), "﻿a\r\n\"มี\"\"อัญประกาศ\"\r\n", "อัญประกาศถูก escape เป็นคู่");
eq(toCsv(["a"], [["มี\nขึ้นบรรทัด"]]), "﻿a\r\n\"มี\nขึ้นบรรทัด\"\r\n", "ขึ้นบรรทัดใหม่ถูกครอบ");

console.log("\n=== เลขหน้า ===");
eq(parsePage(undefined), 1, "ไม่ระบุ = หน้า 1");
eq(parsePage("3"), 3, "ตัวเลขปกติ");
eq(parsePage("0"), 1, "หน้า 0 ตกกลับเป็น 1");
eq(parsePage("-5"), 1, "ติดลบตกกลับเป็น 1");
eq(parsePage("abc"), 1, "ตัวอักษรตกกลับเป็น 1");
eq(parsePage(["2", "9"]), 2, "array ใช้ตัวแรก");
eq(rangeFor(1), { from: 0, to: 49 }, "หน้า 1 = แถว 0-49");
eq(rangeFor(3), { from: 100, to: 149 }, "หน้า 3 = แถว 100-149");

{
  const mid = pageInfo(2, 50, 342, 50);
  eq(hasPrev(mid), true, "หน้า 2 มีก่อนหน้า");
  eq(hasNext(mid), true, "หน้า 2 จาก 342 แถว มีถัดไป");
  eq(totalPages(mid), 7, "342 แถว = 7 หน้า");
  eq(rangeLabel(mid), "แสดง 51–100 จาก 342 รายการ", "ข้อความบอกช่วง");

  const last = pageInfo(7, 50, 342, 42);
  eq(hasNext(last), false, "หน้าสุดท้ายไม่มีถัดไป");
  eq(rangeLabel(last), "แสดง 301–342 จาก 342 รายการ", "หน้าสุดท้ายจบพอดีที่ 342");

  const exact = pageInfo(2, 50, 100, 50);
  eq(hasNext(exact), false, "แถวหารลงตัวพอดี ต้องไม่มีหน้าถัดไปหลอน");

  const unknown = pageInfo(1, 50, null, 50);
  eq(hasNext(unknown), true, "ไม่รู้ total แต่หน้าเต็ม = เดาว่ามีต่อ (ดีกว่าซ่อนข้อมูล)");
  eq(pageInfo(1, 50, null, 12) && hasNext(pageInfo(1, 50, null, 12)), false,
    "ไม่รู้ total และหน้าไม่เต็ม = จบแล้ว");

  eq(rangeLabel(pageInfo(1, 50, 0, 0)), "ไม่มีรายการ", "ไม่มีข้อมูล");
  eq(DEFAULT_PAGE_SIZE, 50, "ขนาดหน้าเริ่มต้น");
}

console.log(`\n${failures === 0 ? `✅ ผ่านทั้งหมด ${checks} ข้อ` : `❌ ล้มเหลว ${failures}/${checks} ข้อ`}`);
process.exit(failures === 0 ? 0 : 1);
