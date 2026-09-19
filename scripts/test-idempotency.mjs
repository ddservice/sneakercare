#!/usr/bin/env node
import { isIdempotentReplay } from "../.test-build/idempotency.js";

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

console.log("\n[idempotency] จำแนก unique ของ client_request_id");
check(isIdempotentReplay({ code: "23505", message: 'duplicate key value violates unique constraint "sc_sales_tenant_request_uidx"' }), "23505 + ชื่อคอลัมน์ = replay", "ไม่จับ 23505");
check(isIdempotentReplay({ code: "23505", message: "duplicate key value violates unique constraint sc_payments_tenant_request_uidx" }), "รับชำระซ้ำนับเป็น replay", "ไม่จับ payments");
check(!isIdempotentReplay({ code: "23505", message: "duplicate key value violates unique constraint sc_sales_pkey" }), "ชน PK คนละเรื่องไม่ใช่ replay", "จับ PK เป็น replay ผิด");
check(!isIdempotentReplay({ message: "สต๊อกไม่พอ" }), "error คลังไม่ใช่ replay", "จับ error คลังผิด");
check(!isIdempotentReplay(null), "null ไม่ใช่ replay", "จับ null");

if (failures) {
  console.log(`\n[idempotency] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[idempotency] ผ่านทั้งหมด");
}
