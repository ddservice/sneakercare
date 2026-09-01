// ทดสอบว่า credential หนึ่งชุดล็อกอินเข้าระบบได้จริงหรือไม่ — ใช้ตอนตั้งรหัสผ่านใหม่/ตรวจ debug เท่านั้น
//
// ⚠️ (แก้ 2026-09-02) เดิมไฟล์นี้ hardcode service_role key, อีเมล และรหัสผ่านจริงของ admin
// ไว้ตรงๆ ในโค้ดที่ commit เข้า git — เป็นความเสี่ยงด้านความปลอดภัยจริง (ใครก็ตามที่เข้าถึง repo
// ได้ก็ได้ credential เต็มไปด้วย) ห้ามใส่ค่าจริงกลับเข้ามาในไฟล์นี้อีกเด็ดขาด ใช้ env var เท่านั้น
//
// วิธีใช้:
//   node --env-file=.env.local scripts/test-login.mjs <email> <password>
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];
const password = process.argv[3];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("ต้องตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ก่อน (ใช้ --env-file=.env.local)");
  process.exit(1);
}
if (!email || !password) {
  console.error("วิธีใช้: node --env-file=.env.local scripts/test-login.mjs <email> <password>");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  console.log("LOGIN SUCCESS:", !!data?.session, "User:", data?.user?.email, "Error:", error?.message ?? null);
}

main();
