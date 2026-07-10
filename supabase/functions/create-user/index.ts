// Supabase Edge Function: create-user
// ให้ Admin สร้างบัญชีผู้ใช้ใหม่ (ทั้ง Supabase Auth user + แถวใน sc_users) ได้ตรงจากหน้าเว็บ
// โดยไม่ต้องเข้า Supabase Dashboard เอง — service_role key (ที่มีสิทธิ์สร้าง Auth user) รันอยู่
// ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่เคยส่งไปที่ browser เลย
//
// ความปลอดภัย: ตรวจสอบก่อนเสมอว่าผู้เรียกฟังก์ชันนี้ (จาก Authorization header ที่ติดมากับ request)
// เป็น Admin จริง โดย verify ผ่าน anon key ก่อน แล้วค่อยสลับไปใช้ service_role key ทำงานจริง

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    // ตรวจสอบตัวตนผู้เรียกด้วย anon key + token ของเขาเอง (ไม่ใช่ service_role)
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authErr,
    } = await callerClient.auth.getUser();
    if (authErr || !user) return json({ error: "unauthorized" }, 401);

    const { data: callerProfile } = await callerClient
      .from("sc_users")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (callerProfile?.role !== "admin") {
      return json({ error: "เฉพาะ Admin เท่านั้นที่สร้างผู้ใช้ใหม่ได้" }, 403);
    }

    const { username, fullname, nickname, password, role } = await req.json();

    if (!username || !fullname || !nickname || !password || !role) {
      return json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" }, 400);
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return json({ error: "ชื่อผู้ใช้ใช้ได้เฉพาะตัวอักษรภาษาอังกฤษ ตัวเลข และ _ เท่านั้น" }, 400);
    }
    if (String(password).length < 6) {
      return json({ error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" }, 400);
    }
    if (!["admin", "co-admin", "manager"].includes(role)) {
      return json({ error: "สิทธิ์ไม่ถูกต้อง" }, 400);
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: existing } = await adminClient
      .from("sc_users")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (existing) return json({ error: "มีชื่อผู้ใช้นี้อยู่แล้ว" }, 400);

    const email = `${username}@ddserviceth.com`;
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr || !newUser?.user) {
      return json({ error: "สร้างบัญชีไม่สำเร็จ: " + (createErr?.message || "unknown error") }, 500);
    }

    const { error: profileErr } = await adminClient.from("sc_users").insert({
      user_id: newUser.user.id,
      username,
      fullname,
      nickname,
      role,
    });

    if (profileErr) {
      // rollback: ลบ Auth user ที่สร้างไปแล้วถ้าสร้าง profile ไม่สำเร็จ กัน user ค้างแบบไม่มี profile
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      return json({ error: "สร้าง Profile ไม่สำเร็จ: " + profileErr.message }, 500);
    }

    return json({ status: "ok", user_id: newUser.user.id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }, 500);
  }
});
