#!/usr/bin/env node
const { needsPhysicalReturn, planCorrectionBooksEffect, planPhysicalReturn, planReturnCost } = await import(
  new URL("../.test-build/correction-effects.js", import.meta.url).href
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

console.log("\n[cn-effects] เงิน vs ของ");
check(!needsPhysicalReturn("price_adjustment"), "ลดราคาไม่ต้องรับคืนของ", "ลดราคากลับสต๊อก");
check(!needsPhysicalReturn("service_compensation"), "ชดเชยค่าบริการไม่ต้องรับคืนของ", "ชดเชยกลับสต๊อก");

const books = planCorrectionBooksEffect({ hasGeneralLedger: false, reverseScSalesRequested: true });
check(books.reverseGl === false && books.reverseScSales === false, "ไม่มี GL แล้วห้ามอ้างว่ากลับบัญชีครบ", JSON.stringify(books));

const priceOnly = planPhysicalReturn({
  reason: "price_adjustment",
  confirmed: true,
  lines: [{ itemId: "item-1", qty: 1, condition: "sellable", costBasis: "original", originalUnitCost: 80 }],
  requestId: "cn-1",
});
check(priceOnly.ok && priceOnly.stock === false, "ลดราคาไม่เพิ่มสต๊อกแม้มีรายการของ", JSON.stringify(priceOnly));

check(!planReturnCost({ originalUnitCost: null, sellingPrice: 500 }).ok, "ไม่มีต้นทุนเดิมห้ามใช้ราคาขาย", "ใช้ราคาขายได้");
check(planReturnCost({ originalUnitCost: 80, sellingPrice: 500 }).ok, "มีต้นทุนที่ตัดจากบิลเดิมใช้ได้", "ต้นทุนเดิมใช้ไม่ได้");

const noCost = planPhysicalReturn({
  reason: "physical_return",
  confirmed: true,
  lines: [{ itemId: "item-1", qty: 1, condition: "sellable", costBasis: "original" }],
  requestId: "cn-3",
});
check(!noCost.ok, "ยังไม่มีต้นทุนอ้างอิงห้ามเข้าคลัง", "เข้าคลังได้โดยไม่เลือกต้นทุน");

const okReturn = planPhysicalReturn({
  reason: "physical_return",
  confirmed: true,
  lines: [{ itemId: "item-1", qty: 1, condition: "sellable", costBasis: "original", originalUnitCost: 80 }],
  requestId: "cn-4",
});
check(okReturn.ok && okReturn.stock === true, "ยืนยันรับคืน มีสภาพและต้นทุน จึงวางแผนเข้าคลังได้", JSON.stringify(okReturn));

if (failures) {
  console.log(`\n[cn-effects] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[cn-effects] ผ่านทั้งหมด");
}
