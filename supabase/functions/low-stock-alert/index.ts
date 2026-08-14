// Supabase Edge Function: low-stock-alert
// รันตาม cron (pg_cron หรือ Supabase Scheduled Functions) ทุก 30-60 นาที
// อ่าน Telegram Bot Token จาก integration_secrets ผ่าน service_role key (bypass RLS) เท่านั้น —
// ห้ามอ่านผ่าน anon/authenticated key เด็ดขาด ดู docs/architecture.md §2.1

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("integration_secrets")
    .select("value")
    .eq("key", "telegram_bot_token")
    .maybeSingle();

  if (tokenErr || !tokenRow?.value) {
    return new Response(
      JSON.stringify({ status: "skipped", reason: "telegram_bot_token ยังไม่ได้ตั้งค่า" }),
      { status: 200 }
    );
  }
  const botToken = tokenRow.value;

  const { data: branches, error: branchErr } = await supabase
    .from("branches")
    .select("id, name, telegram_chat_id")
    .eq("is_active", true)
    .not("telegram_chat_id", "is", null);

  if (branchErr) {
    return new Response(JSON.stringify({ status: "error", message: branchErr.message }), { status: 500 });
  }

  const results: Record<string, unknown>[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const branch of branches ?? []) {
    // query ตารางตรงด้วย service_role ไม่ใช้ v_low_stock เพราะ view กรองด้วย fn_current_role()
    // ซึ่ง cron ไม่มี auth.uid() จะได้ 0 แถว — service_role ยัง SELECT item_stock ได้ (REVOKE แค่ authenticated)
    const { data: stockRows, error: lowStockErr } = await supabase
      .from("item_stock")
      .select("item_id, current_qty, min_stock_level, items!inner(name, base_unit, is_active)")
      .eq("branch_id", branch.id);

    const lowStockItems = (stockRows ?? [])
      .map((row) => {
        const item = row.items as { name: string; base_unit: string; is_active: boolean } | null;
        return {
          item_id: row.item_id as string,
          name: item?.name ?? "",
          current_qty: Number(row.current_qty),
          min_stock_level: Number(row.min_stock_level),
          base_unit: item?.base_unit ?? "",
          is_active: item?.is_active ?? false,
        };
      })
      .filter((row) => row.is_active && row.current_qty <= row.min_stock_level);

    if (lowStockErr || !lowStockItems || lowStockItems.length === 0) {
      results.push({ branch: branch.name, sent: 0 });
      continue;
    }

    // กันแจ้งซ้ำ: เช็คว่าวันนี้เคยแจ้งสาขานี้ไปแล้วหรือยัง (แจ้งเป็นชุดเดียวรวมทุกรายการต่อวันต่อสาขา)
    const { data: alreadySent } = await supabase
      .from("notification_log")
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
      await supabase.from("notification_log").insert(
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
