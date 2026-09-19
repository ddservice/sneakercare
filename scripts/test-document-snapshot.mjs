#!/usr/bin/env node
const {
  planSellerSnapshot,
  parseSellerSnapshot,
  embedSellerSnapshot,
  visibleNotes,
  resolveDocumentSeller,
} = await import(new URL("../.test-build/snapshot.js", import.meta.url).href);

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

const issued = planSellerSnapshot({
  name: "ร้านเอ",
  taxId: "0105558000000",
  address: "เชียงใหม่",
  phone: "053000000",
  signatoryName: "สมชาย",
  vatBranchName: "สาขาหลัก",
});
const later = planSellerSnapshot({
  name: "ร้านบี",
  taxId: "0999999999999",
  address: "กรุงเทพ",
  phone: "020000000",
  signatoryName: "สมหญิง",
  vatBranchName: "สาขาใหม่",
});

console.log("\n[snapshot] เก็บและอ่าน");
const stored = embedSellerSnapshot("หมายเหตุลูกค้า", issued);
check(visibleNotes(stored) === "หมายเหตุลูกค้า", "หมายเหตุที่คนเห็นไม่มีก้อน snapshot", `ได้ ${visibleNotes(stored)}`);
check(parseSellerSnapshot(stored)?.name === "ร้านเอ", "อ่านชื่อผู้ขายตอนออกได้", `ได้ ${parseSellerSnapshot(stored)?.name}`);
check(parseSellerSnapshot("ชำระผ่านสลิปธนาคาร") === null, "ข้อความสลิปไม่ใช่ snapshot", "จับสลิปเป็น snapshot");

console.log("\n[snapshot] หัวบิลไม่ตามร้านใหม่");
const resolved = resolveDocumentSeller(stored, later);
check(resolved.fromSnapshot, "ใช้ภาพตอนออก", "ไปใช้ร้านปัจจุบัน");
check(resolved.seller.name === "ร้านเอ", "ชื่อยังเป็นร้านเอ", `ได้ ${resolved.seller.name}`);
check(resolved.seller.taxId === "0105558000000", "เลขผู้เสียภาษียังเป็นตอนออก", `ได้ ${resolved.seller.taxId}`);

const oldDoc = resolveDocumentSeller(null, later);
check(!oldDoc.fromSnapshot && oldDoc.seller.name === "ร้านบี", "ใบเก่าที่ไม่มีภาพใช้ร้านปัจจุบัน", "ใบเก่าไม่มี fallback");

const replaced = embedSellerSnapshot(stored, later);
check(parseSellerSnapshot(replaced)?.name === "ร้านบี", "ฝังซ้ำแทนภาพเดิม ไม่ซ้อน", `ได้ ${parseSellerSnapshot(replaced)?.name}`);
check(visibleNotes(replaced) === "หมายเหตุลูกค้า", "ฝังซ้ำไม่กินหมายเหตุ", `ได้ ${visibleNotes(replaced)}`);

if (failures) {
  console.log(`\n[snapshot] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[snapshot] ผ่านทั้งหมด");
}
