#!/usr/bin/env node
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const holidays = require("../.test-build/thai-holidays.js");
const roster = require("../.test-build/roster-generate.js");

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

console.log("\n[roster-dynamic] ปฏิทินกลาง + จัดเวรอัตโนมัติ");

const y2026 = holidays.thaiPublicHolidays(2026);
check(y2026["2026-01-01"] === "วันขึ้นปีใหม่", "ปีใหม่ 2026", "ขาดปีใหม่");
check(y2026["2026-04-13"] === "วันสงกรานต์", "สงกรานต์ 2026", "ขาดสงกรานต์");
check(y2026["2026-12-05"] === "วันพ่อแห่งชาติ", "วันพ่อ 2026", "ขาดวันพ่อ");
check(holidays.thaiHolidayName("2026-03-03") === "วันมาฆบูชา", "มาฆบูชาจากปฏิทินจันทรคติ", "ขาดมาฆบูชา");
check(holidays.thaiHolidayName("2027-04-14") === "วันสงกรานต์", "สงกรานต์ข้ามปี", "ข้ามปีไม่ได้");

const four = roster.assignWeeklyDayOffs(4);
check(four.length === 4, "4 คนได้ 4 วันหยุด", `ได้ ${four.length}`);
check(new Set(four).size === 4, "4 คนหยุดคนละวัน", `วันหยุด = ${four.join(",")}`);

const eight = roster.assignWeeklyDayOffs(8);
check(eight[0] === eight[7], "คนที่ 8 วนวันเดียวกับคนที่ 1", `${eight[0]} vs ${eight[7]}`);

const plan = roster.generateRosterPlan(3, 2);
check(plan.warnings.length === 0, "ร้าน 3 คน / อยู่ 2 คน ไม่เตือน", `warnings ${plan.warnings.length}`);

const tight = roster.generateRosterPlan(2, 2);
check(tight.warnings.length > 0, "ร้าน 2 คน / อยู่ 2 คนต้องเตือนวันที่ใครหยุด", "ไม่เตือนทั้งที่วันหยุดมีคนออก");

const hours = roster.shiftsFromShopHours("10:00", "19:00");
check(hours.open === "10:00" && hours.close === "19:00", "เก็บเวลาเปิด-ปิดของสาขา", JSON.stringify(hours));
check(hours.morning.startsWith("09:30"), "กะเช้าเลื่อนตามร้าน (เตรียม 30 นาที)", hours.morning);
check(hours.late.endsWith("19:30"), "กะสายเลื่อนตามร้าน (เคลียร์ 30 นาที)", hours.late);

if (failures) {
  console.log(`\n[roster-dynamic] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[roster-dynamic] ผ่านทั้งหมด");
}
