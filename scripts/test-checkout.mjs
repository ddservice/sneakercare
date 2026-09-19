#!/usr/bin/env node
const { planCheckout, planStockOuts, shouldPostSale } = await import(
  new URL("../.test-build/checkout.js", import.meta.url).href
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

const base = {
  orderId: "11111111-1111-1111-1111-111111111111",
  orderNo: "SC-20260919-100",
  date: "2026-09-19",
  gross: 400,
  discount: 0,
  net: 400,
  cash: 0,
  transfer: 0,
  serviceNames: ["Package M"],
};

console.log("\n[checkout] ลงบัญชีเมื่อไหร่");
check(!shouldPostSale("unpaid"), "ยังไม่รับเงิน = ยังไม่ลงบัญชี", "unpaid ถูกตั้งให้ลงบัญชี");
check(shouldPostSale("cash"), "เงินสดลงบัญชี", "เงินสดไม่ลง");
check(shouldPostSale("transfer"), "โอนลงบัญชี", "โอนไม่ลง");
check(shouldPostSale("credit"), "บัตรเครดิตลงบัญชี", "บัตรไม่ลง");

console.log("\n[checkout] แผนขาย");
check(planCheckout({ ...base, paymentMethod: "unpaid" }).sale === null, "unpaid ไม่มีแถวขาย", "unpaid ยังมีแถวขาย");

const cash = planCheckout({ ...base, paymentMethod: "cash" }).sale;
check(cash?.amountPaid === 400, "เงินสด amountPaid = 400", `ได้ ${cash?.amountPaid}`);
check(cash?.cash === 400 && cash?.transfer === 0, "เงินสดเข้าช่อง cash", "เงินสดไม่เข้าช่อง cash");
check(cash?.paymentStatus === "ชำระครบ", "เงินสดสถานะชำระครบ", `ได้ ${cash?.paymentStatus}`);
check(cash?.clientRequestId === base.orderId, "คีย์กันซ้ำ = id ใบรับงาน", `ได้ ${cash?.clientRequestId}`);
check(cash?.extraItems.includes("SC-20260919-100"), "extra อ้างเลขใบรับงาน", `ได้ ${cash?.extraItems}`);

const credit = planCheckout({ ...base, paymentMethod: "credit" }).sale;
check(credit?.amountPaid === 400, "บัตร amountPaid = 400", `ได้ ${credit?.amountPaid}`);
check(credit?.transfer === 400 && credit?.cash === 0, "บัตรเข้าช่องโอน", "บัตรไม่เข้าช่องโอน");
check(credit?.paymentStatus === "ชำระครบ", "บัตรสถานะชำระครบ", `ได้ ${credit?.paymentStatus}`);

const again = planCheckout({ ...base, paymentMethod: "cash" }).sale;
check(
  again?.clientRequestId === cash?.clientRequestId,
  "วางแผนซ้ำได้คีย์เดิม (ลงบัญชีครั้งเดียว)",
  "คีย์ไม่คงที่"
);

console.log("\n[checkout] แผนเบิกคลัง");
const empty = planStockOuts([]);
check(empty.ok && empty.ok && empty.lines.length === 0, "ไม่มีบรรทัดเบิก = ว่าง", "แผนเบิกว่างผิด");
const good = planStockOuts([{ itemId: "item-1", qty: 2 }]);
check(good.ok && good.lines[0]?.qty === 2, "เบิก 2 หน่วยได้", "แผนเบิกดีไม่ได้");
const badQty = planStockOuts([{ itemId: "item-1", qty: 0 }]);
check(!badQty.ok, "เบิก 0 ถูกปฏิเสธ", "เบิก 0 ยังผ่าน");

if (failures) {
  console.log(`\n[checkout] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[checkout] ผ่านทั้งหมด");
}
