#!/usr/bin/env node
const {
  DEFAULT_USAGE_FLAGS,
  guessUsageFromServiceName,
  LIVE_AUTO_ISSUE_ALLOWED,
  mayLiveAutoIssue,
  planAutoIssue,
  planLiveStockIssue,
  planReservation,
  planSaveUsageFlags,
  selectFormula,
  usageVariance,
} = await import(new URL("../.test-build/service-usage.js", import.meta.url).href);

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

const formulas = [
  { serviceId: "svc-m", itemId: "item-soap", qtyBase: 30, version: 1, effectiveFrom: "2026-01-01", approved: false, unit: "ml" },
  { serviceId: "svc-m", itemId: "item-soap", qtyBase: 40, version: 2, effectiveFrom: "2026-09-01", approved: true, unit: "ml" },
];

console.log("\n[usage] สูตรและจุดตัด");
check(guessUsageFromServiceName("Package M") === null, "ห้ามเดาปริมาณจากชื่อบริการ", "เดาจากชื่อได้");
check(LIVE_AUTO_ISSUE_ALLOWED === false, "เส้นตัดจริงปิดทั้งระบบ", "เส้นตัดจริงเปิดอยู่");
check(mayLiveAutoIssue({ autoIssueEnabled: true, cutPoint: "receive" }) === false, "เปิดธงแล้วยังไม่ตัดจริง", "ถูกอนุญาตตัดจริง");
check(!planLiveStockIssue({ flags: { autoIssueEnabled: true, cutPoint: "receive" }, requestedPoint: "receive" }).ok, "planLiveStockIssue ปิดฝั่งเซิร์ฟเวอร์", "ตัดได้");
check(!planSaveUsageFlags({ autoIssueEnabled: true, cutPoint: "receive" }).ok, "บันทึกเปิดตัดอัตโนมัติไม่ได้", "เปิดตัดได้");
check(planSaveUsageFlags({ autoIssueEnabled: false, cutPoint: "complete" }).ok, "บันทึกจุดตัดที่ต้องการได้โดยไม่เปิดตัด", "บันทึกจุดตัดไม่ได้");
check(selectFormula(formulas, "svc-m", "2026-08-01") === null, "สูตรที่ยังไม่อนุมัติใช้ไม่ได้", "สูตรไม่อนุมัติถูกใช้");
check(selectFormula(formulas, "svc-m", "2026-09-19")?.qtyBase === 40, "ใช้สูตรที่อนุมัติแล้วตามวันมีผล", "เลือกสูตรผิด");

const reserved = planReservation(formulas, ["svc-m"], "2026-09-19");
check(reserved.ok && reserved.lines[0].qtyBase === 40, "จองจากสูตรที่อนุมัติ", JSON.stringify(reserved));

const autoOff = planAutoIssue({
  flags: DEFAULT_USAGE_FLAGS,
  requestedPoint: "receive",
  reservation: reserved.lines,
});
check(!autoOff.ok, "ค่าเริ่มต้นยังไม่ตัดอัตโนมัติ", "ตัดอัตโนมัติทั้งที่ยังไม่เปิด");
check(usageVariance(40, 35).delta === -5, "บันทึกส่วนต่างจากสูตรได้", "ส่วนต่างผิด");

if (failures) {
  console.log(`\n[usage] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[usage] ผ่านทั้งหมด");
}
