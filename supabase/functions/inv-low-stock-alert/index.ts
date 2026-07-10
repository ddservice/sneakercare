// Supabase Edge Function: inv-low-stock-alert
// รันตาม pg_cron ทุก 30 นาที อ่าน Telegram Bot Token จาก inv_integration_secrets ผ่าน
// service_role key (bypass RLS) เท่านั้น — ห้ามอ่านผ่าน anon/authenticated key เด็ดขาด

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: tokenRow } = await supabase
    .from("inv_integration_secrets")
    .select("value")
    .eq("key", "telegram_bot_token")
    .maybeSingle();

  if (!tokenRow?.value) {
    return new Response(
      JSON.stringify({ status: "skipped", reason: "telegram_bot_token ยังไม่ได้ตั้งค่า" }),
      { status: 200 }
    );
  }
  const botToken = tokenRow.value;

  const { data: branches } = await supabase
    .from("inv_branches")
    .select("id, name, telegram_chat_id")
    .eq("is_active", true)
    .not("telegram_chat_id", "is", null);

  const results: Record<string, unknown>[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const branch of branches ?? []) {
    const { data: lowStockItems } = await supabase
      .from("inv_v_low_stock")
      .select("item_id, name, current_qty, min_stock_level, base_unit")
      .eq("branch_id", branch.id);

    if (!lowStockItems || lowStockItems.length === 0) {
      results.push({ branch: branch.name, sent: 0 });
      continue;
    }

    const { data: alreadySent } = await supabase
      .from("inv_notification_log")
      .select("id")
      .eq("branch_id", branch.id)
      .eq("channel", "telegram")
      .gte("sent_at", `${today}T00:00:00Z`)
      .limit(1);

    if (alreadySent && alreadySent.length > 0) {
      results.push({ branch: branch.name, sent: 0, reason: "แจ้งไปแล้ววันนี้" });
      continue;
    }

    const lines = lowStockItems
      .map((i) => `• ${i.name}: เหลือ ${i.current_qty} ${i.base_unit} (ขั้นต่ำ ${i.min_stock_level})`)
      .join("\n");
    const message = `⚠️ สินค้าใกล้หมดที่สาขา ${branch.name}\n\n${lines}`;

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: branch.telegram_chat_id, text: message }),
    });

    if (tgRes.ok) {
      await supabase.from("inv_notification_log").insert(
        lowStockItems.map((i) => ({
          item_id: i.item_id,
          branch_id: branch.id,
          channel: "telegram",
          message,
        }))
      );
    }

    results.push({ branch: branch.name, sent: lowStockItems.length, telegram_ok: tgRes.ok });
  }

  return new Response(JSON.stringify({ status: "ok", results }), {
    headers: { "Content-Type": "application/json" },
  });
});
