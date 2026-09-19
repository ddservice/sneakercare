#!/usr/bin/env node
/**
 * E2E เส้นทางหน้าจอ — ไม่แทนการคลิกบัญชีจริง
 * ตั้ง E2E_BASE_URL เป็น origin ของ local/staging ที่ยืนยันว่าไม่ใช่ production
 */
const base = String(process.env.E2E_BASE_URL || "").replace(/\/$/, "");

if (!base) {
  console.log("\n[e2e-routes] ไม่รัน — ไม่มี E2E_BASE_URL (ห้ามยิง production โดยไม่ตั้งค่า)");
  process.exit(0);
}

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};

console.log(`\n[e2e-routes] ${base}`);
const routes = ["/tax-filing", "/settings", "/pos", "/invoicing"];
for (const route of routes) {
  try {
    const res = await fetch(`${base}${route}`, { redirect: "manual", signal: AbortSignal.timeout(20000) });
    const location = res.headers.get("location") || "";
    const gated = res.status === 307 || res.status === 302 || res.status === 303;
    const toLogin = /login/i.test(location);
    if (gated && toLogin) ok(`${route} ไม่มีคุกกี้แล้วเด้ง login (${res.status})`);
    else bad(`${route} status=${res.status} location=${location || "-"}`);
  } catch (err) {
    bad(`${route} เรียกไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
  }
}

try {
  const login = await fetch(`${base}/login`, { redirect: "manual", signal: AbortSignal.timeout(20000) });
  if (login.status === 200) ok("หน้า login เปิดได้");
  else bad(`login status=${login.status}`);
} catch (err) {
  bad(`login เรียกไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
}

if (failures) {
  console.log(`\n[e2e-routes] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[e2e-routes] ผ่านชุดที่รัน");
}
