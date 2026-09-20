#!/usr/bin/env node
/**
 * E2E เส้นทางหน้าจอ — ไม่แทนการคลิกบัญชีจริง และห้ามยิง production
 */
import fs from "node:fs";

const base = String(process.env.E2E_BASE_URL || "").replace(/\/$/, "");

if (!base) {
  console.log("\n[e2e-routes] ไม่รัน — ไม่มี E2E_BASE_URL (ห้ามยิง production โดยไม่ตั้งค่า)");
  process.exit(0);
}

if (/sneakercare\.ddserviceth\.com|supabase\.co/i.test(base)) {
  console.log("\n[e2e-routes] ปฏิเสธ — E2E_BASE_URL ชี้ production");
  process.exit(1);
}

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};

async function get(path, init = {}) {
  return fetch(`${base}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
    ...init,
  });
}

console.log(`\n[e2e-routes] ${base}`);
const gated = [
  "/dashboard",
  "/pos",
  "/pos/daily-entry",
  "/invoicing",
  "/inventory",
  "/expenses",
  "/roster",
  "/tax-filing",
  "/settings",
  "/stock-out",
  "/stock-in",
  "/adjustments",
  "/admin/users",
];
for (const route of gated) {
  try {
    const res = await get(route);
    const location = res.headers.get("location") || "";
    const bounced = [307, 302, 303].includes(res.status) && /login/i.test(location);
    if (bounced) ok(`${route} ไม่มีคุกกี้แล้วเด้ง login (${res.status})`);
    else bad(`${route} status=${res.status} location=${location || "-"}`);
  } catch (err) {
    bad(`${route} เรียกไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
  }
}

try {
  const first = await get("/login");
  const retry = await get("/login");
  const html = await first.text();
  if (first.status === 200 && retry.status === 200) ok("หน้า login เปิดได้และกดซ้ำได้");
  else bad(`login status=${first.status}/${retry.status}`);
  const formSrc = fs.readFileSync("app/login/login-form.tsx", "utf8");
  if (formSrc.includes('name="password"') && formSrc.includes("จดจำชื่อผู้ใช้") && formSrc.includes('autoComplete="username"')) {
    ok("ซอร์สฟอร์ม login มีช่องผู้ใช้ รหัส และจดจำชื่อ");
  } else {
    bad("ซอร์สฟอร์ม login ไม่ครบ");
  }
  if (html.length > 200 && /login|เข้าสู่ระบบ|DD-Management/i.test(html)) {
    ok("HTML หน้า login มีหัวระบบ");
  } else {
    bad("HTML หน้า login ว่างหรือไม่ใช่หน้าเข้าสู่ระบบ");
  }
} catch (err) {
  bad(`login เรียกไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
}

try {
  const stale = await get("/pos", { headers: { cookie: "sb-access-token=expired; sc_active_branch=x" } });
  const location = stale.headers.get("location") || "";
  if ([307, 302, 303].includes(stale.status) && /login/i.test(location)) {
    ok("คุกกี้ปลอม/หมดอายุแล้วเด้ง login");
  } else {
    bad(`/pos คุกกี้ปลอม status=${stale.status} location=${location || "-"}`);
  }
} catch (err) {
  bad(`คุกกี้ปลอม เรียกไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
}

if (failures) {
  console.log(`\n[e2e-routes] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[e2e-routes] ผ่านชุดที่รัน");
}
