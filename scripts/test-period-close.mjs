#!/usr/bin/env node
const {
  parseClosedPeriods,
  canEditPeriod,
  isPeriodClosed,
  periodYmFromDate,
  serializeClosedPeriods,
  closedPeriodMessage,
  planClosePeriod,
  planReopenPeriod,
} = await import(new URL("../.test-build/period-close.js", import.meta.url).href);

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

console.log("\n[period-close] ค่าเริ่มต้น");
check(parseClosedPeriods(null).length === 0, "ยังไม่เคยตั้ง = ไม่มีงวดปิด", "null ถูกนับว่างวดปิด");
check(parseClosedPeriods("").length === 0, "ค่าว่าง = ไม่มีงวดปิด", "ค่าว่างถูกนับว่างวดปิด");
check(parseClosedPeriods("not-json").length === 0, "JSON พัง = ไม่มีงวดปิด", "JSON พังถูกนับว่างวดปิด");

console.log("\n[period-close] วันที่และบัญชี");
check(periodYmFromDate("2026-09-19") === "2026-09", "แปลงวันที่ขาย", `ได้ ${periodYmFromDate("2026-09-19")}`);
check(periodYmFromDate("09/2026") === "2026-09", "แปลงเดือนรายจ่าย", `ได้ ${periodYmFromDate("09/2026")}`);
check(canEditPeriod("2026-09", []), "งวดที่ยังไม่ปิดแก้ได้", "งวดเปิดแก้ไม่ได้");
check(!canEditPeriod("2026-08", ["2026-08"]), "งวดที่ปิดแก้ไม่ได้", "งวดปิดยังแก้ได้");
check(isPeriodClosed("2026-08", ["2026-08"]), "จำแนกงวดปิดได้", "จำแนกงวดปิดไม่ได้");
check(serializeClosedPeriods(["2026-09", "2026-08"]) === '["2026-08","2026-09"]', "เรียงงวดปิด", `ได้ ${serializeClosedPeriods(["2026-09", "2026-08"])}`);
check(closedPeriodMessage("2026-08").includes("ปิดแล้ว"), "ข้อความห้ามแก้ชัด", `ได้ ${closedPeriodMessage("2026-08")}`);

console.log("\n[period-close] แผนปิด/เปิด");
const closed = planClosePeriod([], "2026-08");
check(closed.ok && closed.next.join(",") === "2026-08", "ปิดงวดครั้งแรกได้", "ปิดงวดครั้งแรกไม่ได้");
const again = planClosePeriod(["2026-08"], "2026-08");
check(!again.ok, "ปิดซ้ำไม่ได้", "ปิดซ้ำได้");
const reopened = planReopenPeriod(["2026-08"], "2026-08");
check(reopened.ok && reopened.next.length === 0, "เปิดงวดที่ปิดแล้วได้", "เปิดงวดไม่ได้");
const notClosed = planReopenPeriod([], "2026-08");
check(!notClosed.ok, "เปิดงวดที่ยังไม่ปิดไม่ได้", "เปิดงวดว่างได้");
check(!planClosePeriod([], "2026-13").ok, "เดือนผิดรูปไม่ปิด", "เดือน 13 ถูกปิด");

if (failures) {
  console.log(`\n[period-close] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[period-close] ผ่านทั้งหมด");
}
