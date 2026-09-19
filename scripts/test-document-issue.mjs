#!/usr/bin/env node
const {
  consumesOfficialNumberOnCreate,
  isDraftNumber,
  planDraftNumber,
  canIssueOfficialNumber,
  issueBlockedReason,
} = await import(new URL("../.test-build/issue.js", import.meta.url).href);

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

console.log("\n[issue] ตอนสร้างกินเลขเมื่อไหร่");
check(!consumesOfficialNumberOnCreate("QUOTATION"), "ใบเสนอราคาไม่กินเลขตอนสร้าง", "QA กินเลข");
check(!consumesOfficialNumberOnCreate("INVOICE"), "ใบแจ้งหนี้ไม่กินเลขตอนสร้าง", "INV กินเลข");
check(consumesOfficialNumberOnCreate("TAX_INVOICE"), "ใบกำกับกินเลขตอนสร้าง", "TAX ไม่กินเลข");
check(consumesOfficialNumberOnCreate("CREDIT_NOTE"), "ใบลดหนี้กินเลขตอนสร้าง", "CN ไม่กินเลข");

console.log("\n[issue] เลขร่าง");
const draftNo = planDraftNumber("2026-09-19", "ab12cd");
check(draftNo === "DRAFT-20260919-AB12CD", "เลขร่างมีรูปแบบคงที่", `ได้ ${draftNo}`);
check(isDraftNumber(draftNo), "จำแนกเลขร่างได้", "จำแนกเลขร่างไม่ได้");
check(!isDraftNumber("QA-20260919-0001"), "เลขทางการไม่ใช่เลขร่าง", "จับเลขทางการเป็นร่าง");

console.log("\n[issue] ออกเลข");
check(canIssueOfficialNumber("DRAFT", draftNo), "ร่างที่มีเลขชั่วคราวออกเลขได้", "ออกเลขร่างไม่ได้");
check(!canIssueOfficialNumber("DRAFT", "QA-20260919-0001"), "มีเลขทางการแล้วออกซ้ำไม่ได้", "ออกเลขซ้ำได้");
check(!canIssueOfficialNumber("VOID", draftNo), "ยกเลิกแล้วออกเลขไม่ได้", "VOID ยังออกเลขได้");
check(issueBlockedReason("DRAFT", "QA-20260919-0001")?.includes("เลขทางการ"), "เหตุผลออกซ้ำชัด", `ได้ ${issueBlockedReason("DRAFT", "QA-20260919-0001")}`);

if (failures) {
  console.log(`\n[issue] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[issue] ผ่านทั้งหมด");
}
