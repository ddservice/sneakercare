#!/usr/bin/env node
/**
 * สร้างบัญชีทดสอบชั่วคราว + ขอลิงก์ recovery จริงจาก Supabase Admin API ตรงๆ (ไม่ต้องเช็คอีเมล)
 * ใช้ทดสอบ AuthGate/SetPasswordForm ที่ /login ว่าจัดการลิงก์จริงได้ถูกต้องหรือไม่
 *
 * รัน: node --env-file=.env.local scripts/gen-test-recovery-link.mjs
 * ลบบัญชีทดสอบเองด้วย: node --env-file=.env.local scripts/gen-test-recovery-link.mjs --cleanup <uid>
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("ต้องรันด้วย --env-file=.env.local");
  process.exit(1);
}
const admin = createClient(url, serviceKey);

if (process.argv[2] === "--cleanup") {
  const uid = process.argv[3];
  if (!uid) { console.error("ต้องระบุ uid"); process.exit(1); }
  await admin.from("profiles").delete().eq("id", uid);
  const { error } = await admin.auth.admin.deleteUser(uid);
  console.log(error ? `ลบไม่สำเร็จ: ${error.message}` : "ลบบัญชีทดสอบสำเร็จ");
  process.exit(error ? 1 : 0);
}

const stamp = Date.now();
const email = `authgatetest.${stamp}@local.test`;
const password = randomBytes(18).toString("base64url");

const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (createErr) {
  console.error("สร้างบัญชีทดสอบไม่สำเร็จ:", createErr.message);
  process.exit(1);
}
const uid = created.user.id;

const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "recovery",
  email,
  options: { redirectTo: "https://sneakercare.ddserviceth.com/login" },
});
if (linkErr) {
  console.error("ขอลิงก์ไม่สำเร็จ:", linkErr.message);
  process.exit(1);
}

console.log("UID:", uid);
console.log("ACTION_LINK:", linkData.properties.action_link);
console.log("\nลบบัญชีทดสอบทีหลังด้วย:");
console.log(`  node --env-file=.env.local scripts/gen-test-recovery-link.mjs --cleanup ${uid}`);
