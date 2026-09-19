#!/usr/bin/env node
const { isFiledWithEvidence, isPreparedNotFiled, planMarkPp30Filed, planPreparePp30 } = await import(
  new URL("../.test-build/pp30-filing.js", import.meta.url).href
);

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

const paper = {
  line4TaxableSales: 950,
  line5OutputVat: 66.5,
  line6PurchaseBase: 300,
  line7InputVat: 21,
  line11NetPayable: 45.5,
  line12NetExcess: 0,
};

console.log("\n[pp30-filing] เตรียม vs ยื่น");
const prepared = planPreparePp30({
  periodYm: "2026-09",
  reviewerName: "สมชาย",
  preparedAt: "2026-09-19T10:00:00+07:00",
  paper,
});
check(prepared.ok && prepared.record.status === "prepared", "ระบุผู้ตรวจแล้วเตรียมข้อมูลได้", "เตรียมไม่ได้");
check(isPreparedNotFiled(prepared.record), "เตรียมแล้วไม่ใช่ยื่นแล้ว", "เตรียมถูกนับว่ายื่น");

const noEvidence = planMarkPp30Filed({
  current: prepared.record,
  filerName: "สมหญิง",
  filedAt: "2026-10-07",
  evidenceRef: "",
  userConfirmedExternalFiling: true,
});
check(!noEvidence.ok, "ไม่มีหลักฐานยื่นไม่ได้", "ยื่นได้โดยไม่มีหลักฐาน");

const filed = planMarkPp30Filed({
  current: prepared.record,
  filerName: "สมหญิง",
  filedAt: "2026-10-07",
  evidenceRef: "RD-REF-1",
  evidenceNote: "ยื่นที่ efiling.rd.go.th",
  userConfirmedExternalFiling: true,
});
check(filed.ok && filed.record.status === "filed", "มีผู้ยื่น วันยื่น และหลักฐานจึงบันทึกว่ายื่นแล้ว", "บันทึกยื่นไม่ได้");
check(isFiledWithEvidence(filed.record), "ยื่นแล้วต้องมีหลักฐาน", "ยื่นแล้วไม่มีหลักฐาน");

if (failures) {
  console.log(`\n[pp30-filing] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[pp30-filing] ผ่านทั้งหมด");
}
