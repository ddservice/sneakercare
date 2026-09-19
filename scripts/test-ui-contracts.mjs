#!/usr/bin/env node
/**
 * สัญญาสิทธิ์และเส้นทาง live ฝั่งเซิร์ฟเวอร์ — ไม่แทนการคลิกเบราว์เซอร์
 */
import fs from "node:fs";

const { canIssueOfficialNumber, consumesOfficialNumberOnCreate } = await import(
  new URL("../.test-build/issue.js", import.meta.url).href
);
const { LIVE_ETAX_SEND_ALLOWED, enqueueETax, mockETaxAdapter } = await import(
  new URL("../.test-build/etax-pipeline.js", import.meta.url).href
);
const { LIVE_AUTO_ISSUE_ALLOWED, planLiveStockIssue } = await import(
  new URL("../.test-build/service-usage.js", import.meta.url).href
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

const perm = fs.readFileSync("lib/permissions.ts", "utf8");
function moduleRoles(key, field) {
  const match = perm.match(new RegExp(`key:\\s*"${key}"[\\s\\S]*?${field}:\\s*\\[([^\\]]*)\\]`));
  return match ? [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
}

console.log("\n[ui-contracts] สิทธิ์และเส้นทาง live");
const taxView = moduleRoles("tax-filing", "viewRoles");
const taxWrite = moduleRoles("tax-filing", "writeRoles");
const settingsView = moduleRoles("settings", "viewRoles");
const posWrite = moduleRoles("pos", "writeRoles");
const invWrite = moduleRoles("invoicing", "writeRoles");
check(taxView.includes("admin") && !taxView.includes("staff") && !taxView.includes("co_admin"), "staff/co_admin ไม่มีสิทธิ์ดู /tax-filing", taxView.join(","));
check(taxWrite.includes("admin") && !taxWrite.includes("staff"), "staff เขียนภาษีไม่ได้", taxWrite.join(","));
check(settingsView.includes("admin") && !settingsView.includes("staff"), "staff เข้า /settings ไม่ได้", settingsView.join(","));
check(posWrite.includes("staff"), "staff เขียน /pos ได้", posWrite.join(","));
check(invWrite.includes("co_admin") && !invWrite.includes("staff"), "staff ออกเอกสารไม่ได้", invWrite.join(","));
check(!consumesOfficialNumberOnCreate("CREDIT_NOTE"), "สร้าง CN ไม่กินเลขทางการ", "CN กินเลข");
check(!canIssueOfficialNumber("DRAFT", "DRAFT-1", "CREDIT_NOTE"), "ปุ่มออกเลข CN ต้องปิดฝั่งสูตร", "CN ออกเลขได้");
check(LIVE_ETAX_SEND_ALLOWED === false, "e-Tax ส่งจริงปิด", "e-Tax ส่งจริงเปิด");
check(
  enqueueETax({
    id: "x",
    snapshot: {
      docId: "x",
      docNumber: "TAX-1",
      docTypeCode: "388",
      sellerTaxId: "0505568021002",
      sellerName: "ร้าน",
      buyerTaxId: "",
      buyerName: "ลูกค้า",
      subtotal: 100,
      vatAmount: 7,
      grandTotal: 107,
      xml: "<xml/>",
    },
    channel: "live",
    adapter: mockETaxAdapter(),
  }).deliveredToRd === false,
  "เรียกช่องทาง live ตรง ๆ ไม่ส่งกรม",
  "หลบ UI แล้วส่งได้"
);
check(LIVE_AUTO_ISSUE_ALLOWED === false && !planLiveStockIssue().ok, "ตัดสต๊อกอัตโนมัติปิดฝั่งเซิร์ฟเวอร์", "ตัดอัตโนมัติเปิด");

const taxClient = fs.readFileSync("app/(app)/tax-filing/tax-filing-client.tsx", "utf8");
check(!/toast\.success\([^)]*ส่งสำเร็จ/.test(taxClient), "หน้าภาษีไม่ป้ายส่งสำเร็จจาก toast", "ยังมี toast ส่งสำเร็จ");
check(taxClient.includes("คิว sandbox") && taxClient.includes("แอปนี้ไม่ได้ยื่นแทน"), "หน้าจอบอก sandbox และไม่ได้ยื่นแทน", "ข้อความไม่ครบ");
const pos = fs.readFileSync("app/actions/pos.ts", "utf8");
check(pos.includes("planLiveStockIssue"), "POS เรียกปิดเส้นตัดฝั่งเซิร์ฟเวอร์", "POS ไม่ได้ปิดเส้นตัด");
const issueAction = fs.readFileSync("app/actions/smartacc-documents.ts", "utf8");
check(issueAction.includes("correctionOfficialIssueBlockedReason"), "ออกเลข CN ถูกบล็อกใน server action", "action ไม่อ้างตัวบล็อก CN");
const invoicingClient = fs.readFileSync("app/(app)/invoicing/invoicing-client.tsx", "utf8");
check(!invoicingClient.includes("ใบลด-เพิ่มหนี้ออกเลขทันที"), "หน้าเอกสารไม่บอกว่า CN ออกเลขทันที", "ยังบอกว่า CN ออกเลขทันที");
const ocrAction = fs.readFileSync("app/actions/smartacc-expenses.ts", "utf8");
check(ocrAction.includes("planInAppReceiptOcr") && !ocrAction.includes("Math.random()"), "OCR ในแอปไม่เดายอด", "OCR ยังสุ่มยอด");

if (failures) {
  console.log(`\n[ui-contracts] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[ui-contracts] ผ่านทั้งหมด — ยังไม่ใช่การคลิกเบราว์เซอร์");
}
