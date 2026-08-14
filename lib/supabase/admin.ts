import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// ใช้เฉพาะ Server Action / script ที่ต้อง bypass RLS (เชิญผู้ใช้, migrate)
// ห้าม import ไฟล์นี้จาก Client Component — service_role ข้าม RLS ทั้งหมด
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("ไม่ได้ตั้ง NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
