// ตั้งรหัสผ่านใหม่ให้ผู้ใช้ 1 คน ผ่าน Supabase Auth Admin API — ใช้ตอน reset/rotate รหัสผ่านเท่านั้น
//
// ⚠️ (แก้ 2026-09-02) เดิมไฟล์นี้ hardcode service_role key และรหัสผ่านจริงของ admin ไว้ตรงๆ
// ในโค้ดที่ commit เข้า git — เป็นความเสี่ยงด้านความปลอดภัยจริง ห้ามใส่ค่าจริงกลับเข้ามาในไฟล์นี้
// อีกเด็ดขาด ใช้ env var + argument เท่านั้น
//
// วิธีใช้:
//   node --env-file=.env.local scripts/set-admin-pw.mjs <user_id> <new_password>
//
// หา user_id ได้จาก Supabase Dashboard → Authentication → Users หรือ scripts/list-users.mjs
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.argv[2];
const newPassword = process.argv[3];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("ต้องตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ก่อน (ใช้ --env-file=.env.local)");
  process.exit(1);
}
if (!userId || !newPassword) {
  console.error("วิธีใช้: node --env-file=.env.local scripts/set-admin-pw.mjs <user_id> <new_password>");
  process.exit(1);
}
if (newPassword.length < 12) {
  console.error("รหัสผ่านสั้นเกินไป — ใช้อย่างน้อย 12 ตัวอักษร");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  const { data, error } = await sb.auth.admin.updateUserById(userId, {
    password: newPassword,
    email_confirm: true,
  });

  if (error) {
    console.error("ตั้งรหัสผ่านไม่สำเร็จ:", error.message);
    process.exit(1);
  }
  console.log("ตั้งรหัสผ่านสำเร็จสำหรับ user:", data?.user?.id, data?.user?.email);
}

main();
