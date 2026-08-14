import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

// สร้าง client ใหม่ทุกครั้งต่อ request เสมอ (ห้าม cache/แชร์ข้าม request) ตามคำแนะนำของ @supabase/ssr
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // หมายเหตุ: setAll() ของ @supabase/ssr รับ headers เป็นพารามิเตอร์ที่ 2 ด้วย (สำหรับ
          // Cache-Control ของ response ที่มีการ set auth cookie) แต่ Server Component เซ็ต response
          // header เองไม่ได้ (ต่างจาก proxy.ts ที่คุม NextResponse เต็มรูปแบบ) จึง apply เฉพาะ cookies
          // ที่นี่ ส่วน headers ปล่อยให้ proxy.ts เป็นผู้รับผิดชอบหลัก (รันทุก request ก่อน component เสมอ)
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // เรียกจาก Server Component ที่ set cookie ไม่ได้ (จะไม่เป็นไรถ้า proxy.ts refresh session ให้แล้ว)
          }
        },
      },
    }
  );
}
