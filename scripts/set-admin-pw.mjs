import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mdlxogfkpwejnqpzhmoy.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbHhvZ2ZrcHdlam5xcHpobW95Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzQ4ODcyMiwiZXhwIjoyMDk5MDY0NzIyfQ.dzhbyMEttIFV4TCzHp7OtJQyK6b1ZWhxNtLfS-sG1Ns";

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  const { data, error } = await sb.auth.admin.updateUserById(
    "7649a97a-2c79-41cd-9c35-27398ea73c28",
    { password: "password123", email_confirm: true }
  );

  console.log("Admin update data:", data?.user?.id, "error:", error);
}

main();
