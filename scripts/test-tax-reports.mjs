#!/usr/bin/env node
/**
 * ล็อกรูปแบบไฟล์ ภ.ง.ด.3 / ภ.ง.ด.53 ตาม FORMAT กลาง กรมสรรพากร V2
 * (pipe + CR/LF + Header H + Detail D + ชื่อไฟล์)
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tax = require(path.join(root, ".test-build/tax-reports.js"));

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
function check(cond, okMsg, badMsg) {
  if (cond) ok(okMsg);
  else bad(badMsg);
}

const records = [
  {
    sequence: 1,
    taxId: "0105558123456",
    name: "บริษัท ตัวอย่าง จำกัด",
    address: "เชียงใหม่",
    date: "2026-09-15",
    incomeType: "ค่าบริการ",
    whtRate: 3,
    baseAmount: 1000,
    taxAmount: 30,
    payeeKind: "juristic",
  },
];

const file = tax.generatePndEFilingFile(records, {
  formType: "PND53",
  payerTaxId: "0505568021002",
  payerBranch: "000000",
  payerDeptName: "สำนักงานใหญ่",
  periodYm: "2026-09",
});

console.log("\n[tax] PND e-Filing FORMAT กลาง V2");

check(file.text.includes("\r\n"), "ขึ้นบรรทัดด้วย CR/LF", "ไม่ได้ใช้ CR/LF");
check(!file.text.startsWith("|"), "ไม่มี pipe ต้นบรรทัด", "มี pipe ต้นบรรทัด");
check(!file.text.split("\r\n")[0].endsWith("|"), "ไม่มี pipe ท้าย Header", "มี pipe ท้าย Header");

const [header, detail] = file.text.split("\r\n");
const h = header.split("|");
const d = detail.split("|");

check(h[0] === "H", "Header ขึ้นต้นด้วย H", `ได้ ${h[0]}`);
check(h[5] === "PND53", "TAX_TYPE = PND53", `ได้ ${h[5]}`);
check(h[2] === "0505568021002", "SENDER_NID 13 หลัก", `ได้ ${h[2]}`);
check(h[3] === "000000", "สาขา 6 หลัก", `ได้ ${h[3]}`);
check(h[13] === "09", "เดือนภาษี 09", `ได้ ${h[13]}`);
check(h[14] === "2569", "ปีภาษี พ.ศ.", `ได้ ${h[14]}`);
check(h[24] === "2", "FORM_FLAG = อินเทอร์เน็ต", `ได้ ${h[24]}`);
check(h[17] === "1", "TOT_NUM = 1", `ได้ ${h[17]}`);
check(h[18] === "1000.00", "TOT_AMT = 1000.00", `ได้ ${h[18]}`);
check(h[19] === "30.00", "TOT_TAX = 30.00", `ได้ ${h[19]}`);
check(h.length === 25, `Header มี 25 ฟิลด์ (ได้ ${h.length})`, `Header มี ${h.length} ฟิลด์`);

check(d[0] === "D", "Detail ขึ้นต้นด้วย D", `ได้ ${d[0]}`);
check(d[2] === "000000", "สาขาผู้หัก 6 หลัก", `ได้ ${d[2]}`);
check(d[3] === "0105558123456", "NID ผู้มีเงินได้", `ได้ ${d[3]}`);
check(d[8] === "15092569", "วันที่จ่าย ววดดปปปป พ.ศ.", `ได้ ${d[8]}`);
check(d[9] === "3.00", "อัตราภาษี 3.00", `ได้ ${d[9]}`);
check(d[13] === "1", "เงื่อนไข = หัก ณ ที่จ่าย", `ได้ ${d[13]}`);
check(d.length === 38, `Detail มี 38 ฟิลด์ (ได้ ${d.length})`, `Detail มี ${d.length} ฟิลด์`);

check(
  file.filename === "PND53_0505568021002_000000_2569_09_00_00.txt",
  `ชื่อไฟล์ตามสเปก (${file.filename})`,
  `ชื่อไฟล์ผิด: ${file.filename}`
);

check(tax.rdPaidDate("2026-01-05") === "05012569", "rdPaidDate ไม่เลื่อนวันจาก UTC", tax.rdPaidDate("2026-01-05"));
check(tax.padBranch6("1") === "000001", "pad สาขา 6 หลัก", tax.padBranch6("1"));
check(tax.classifyPayeeKind("0105558123456") === "juristic", "tax id ขึ้นต้น 0 = นิติบุคคล", "classify ผิด");
check(tax.classifyPayeeKind("1234567890123") === "person", "tax id ไม่ขึ้นต้น 0 = บุคคล", "classify ผิด");

const pnd3 = tax.generatePndEFilingFile(
  [
    {
      sequence: 1,
      taxId: "1234567890123",
      name: "นาย สมชาย ใจดี",
      address: "เชียงใหม่",
      date: "2026-09-01",
      incomeType: "ค่าบริการ",
      whtRate: 3,
      baseAmount: 2000,
      taxAmount: 60,
      payeeKind: "person",
    },
  ],
  {
    formType: "PND3",
    payerTaxId: "0505568021002",
    periodYm: "2026-09",
  }
);
const p3h = pnd3.text.split("\r\n")[0].split("|");
const p3d = pnd3.text.split("\r\n")[1].split("|");
check(p3h[5] === "PND3", "ภ.ง.ด.3 TAX_TYPE = PND3", `ได้ ${p3h[5]}`);
check(p3d[5] === "นาย", "แยกคำนำหน้าชื่อนาย", `ได้ ${p3d[5]}`);
check(p3d[6] === "สมชาย", "แยกชื่อ", `ได้ ${p3d[6]}`);
check(p3d[7] === "ใจดี", "แยกนามสกุล", `ได้ ${p3d[7]}`);
check(pnd3.filename.startsWith("PND3_"), "ชื่อไฟล์ขึ้นต้น PND3_", pnd3.filename);

if (failures) {
  console.error(`\nภาษี e-Filing ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\nภาษี e-Filing ผ่านทั้งหมด");
}
