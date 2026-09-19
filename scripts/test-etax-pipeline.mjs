#!/usr/bin/env node
const {
  claimsRealSend,
  enqueueETax,
  LIVE_ETAX_SEND_ALLOWED,
  mockETaxAdapter,
  retryETax,
  userFacingETaxStatus,
  validateETaxSnapshot,
} = await import(new URL("../.test-build/etax-pipeline.js", import.meta.url).href);

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

const snapshot = {
  docId: "doc-1",
  docNumber: "TAX-20260919-0001",
  docTypeCode: "388",
  sellerTaxId: "0505568021002",
  sellerName: "ร้านตัวอย่าง",
  buyerTaxId: "0105558123456",
  buyerName: "ลูกค้า",
  subtotal: 1000,
  vatAmount: 70,
  grandTotal: 1070,
  xml: "<xml/>",
};

console.log("\n[etax] ตรวจเอกสาร");
check(validateETaxSnapshot(snapshot).ok, "ชุดครบผ่านการตรวจ", "ชุดครบไม่ผ่าน");
check(!validateETaxSnapshot({ ...snapshot, sellerTaxId: "123" }).ok, "เลขผู้เสียภาษีสั้นไม่ผ่าน", "เลขสั้นยังผ่าน");
check(!validateETaxSnapshot({ ...snapshot, grandTotal: 1000 }).ok, "ยอดรวมผิดไม่ผ่าน", "ยอดผิดยังผ่าน");
check(LIVE_ETAX_SEND_ALLOWED === false, "ส่งจริงปิดฝั่งเซิร์ฟเวอร์", "ส่งจริงเปิด");

console.log("\n[etax] คิวและสถานะ");
check(userFacingETaxStatus({ xmlCreated: true }) === "สร้าง XML แล้ว ยังไม่ได้ส่ง", "สร้าง XML ไม่ใช่ส่งสำเร็จ", userFacingETaxStatus({ xmlCreated: true }));
check(
  userFacingETaxStatus({ httpStatus: 200 }) === "ได้คำตอบ HTTP แต่ยังไม่ใช่หลักฐานรับจากช่องทาง",
  "HTTP 200 ไม่ใช่ส่งสำเร็จ",
  userFacingETaxStatus({ httpStatus: 200 })
);
check(!claimsRealSend(userFacingETaxStatus({ xmlCreated: true, httpStatus: 200 })), "ป้ายสำเร็จห้ามมาจาก XML/HTTP", "ยังโชว์ส่งสำเร็จ");

const noChannel = enqueueETax({ id: "1", snapshot, channel: "unset", adapter: mockETaxAdapter() });
check(noChannel.status === "needs_channel", "ยังไม่เลือกช่องทาง = ยังไม่ส่ง", noChannel.status);
check(noChannel.deliveredToRd === false, "ไม่ได้ส่งกรม", "ไปส่งกรมแล้ว");

const sandbox = enqueueETax({ id: "1", snapshot, channel: "sandbox", adapter: mockETaxAdapter() });
check(sandbox.status === "queued_sandbox", "sandbox เข้าคิว", sandbox.status);
check(sandbox.deliveredToRd === false, "sandbox ไม่ถือว่าส่งจริง", "sandbox ถูกตั้งว่าส่งจริง");
check(sandbox.userStatus.includes("ไม่ได้ส่งกรมสรรพากร"), "ข้อความบอกว่าไม่ส่งจริง", sandbox.userStatus);
check(!claimsRealSend(sandbox.userStatus), "sandbox ห้ามป้ายส่งสำเร็จ", sandbox.userStatus);

const liveBlocked = enqueueETax({ id: "1", snapshot, channel: "live", adapter: mockETaxAdapter() });
check(liveBlocked.deliveredToRd === false && liveBlocked.status === "failed", "เรียก live ตรง ๆ ถูกบล็อกที่เซิร์ฟเวอร์", JSON.stringify(liveBlocked));

const retried = retryETax(sandbox, "sandbox", mockETaxAdapter());
check(retried.attempts === 2, "retry นับครั้ง", `attempts=${retried.attempts}`);
check(retried.deliveredToRd === false, "retry sandbox ยังไม่ส่งจริง", "retry ไปส่งจริง");

if (failures) {
  console.log(`\n[etax] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[etax] ผ่านทั้งหมด");
}
