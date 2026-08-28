import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";

function loadEnv() {
  const envPath = ".env.local";
  if (!existsSync(envPath)) return {};
  const content = readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log("No Supabase URL or Service Key");
  process.exit(1);
}

const sb = createClient(url, key);

async function main() {
  const { data: profiles, error: pErr } = await sb.from("profiles").select("id, username, display_name, role");
  console.log("Profiles in DB:", profiles, pErr);

  const { data: { users }, error: uErr } = await sb.auth.admin.listUsers();
  console.log("Auth Users in DB:", users?.map(u => ({ id: u.id, email: u.email, created_at: u.created_at })), uErr);
}

main();
