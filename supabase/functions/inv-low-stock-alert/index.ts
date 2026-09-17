// Supabase Edge Function: inv-low-stock-alert
// รันตาม pg_cron วันละครั้ง 9 โมงเช้าไทย (jobid `inv-low-stock-alert-daily-9am-th`)
//
// ⚠️ ไฟล์นี้เพิ่งถูกดึงเข้า repo ครั้งแรก 2026-09-17 ผ่าน `supabase functions download`
// (ก่อนหน้านี้ deploy อยู่จริงบน production มาก่อน repo นี้จะมี source เก็บไว้เลย — ดู CLAUDE.md
// หัวข้อ "cron สองตัว") ห้ามแก้ `supabase/functions/low-stock-alert/` (ไม่มี prefix `inv-`)
// แล้วคิดว่ามีผลกับ cron จริง — คนละไฟล์กัน ตัวนั้นไม่ได้ deploy อยู่
//
// 🏢 [multi-tenant 2026-09-17] แก้ให้ดึง Telegram Bot Token ต่อ tenant แล้ว (migration 0033
// เปลี่ยน inv_integration_secrets จาก PK (key) เดี่ยว เป็น PK (tenant_id, key)) — เดิมมีแค่
// token เดียวใช้ร่วมกันทุกสาขา/ทุก tenant ถ้าไม่แก้ตรงนี้ พอมี tenant ที่สองจริง โค้ดเดิมจะ
// อ่าน token ตัวใดตัวหนึ่งแบบสุ่ม (ORDER BY ไม่ชัดเจน) แล้วส่งข้อความของทุก tenant ผ่าน bot
// เดียวกันหมด ทั้งที่แต่ละ tenant ควรมีบอทของตัวเอง
import { createClient } from "jsr:@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // โหลด bot token ของทุก tenant ที่ตั้งค่าไว้แล้ว เป็น map (service_role bypass RLS
  // อยู่แล้ว — อ่านได้ทุกแถวในคราวเดียว ไม่ต้องวนถามทีละ tenant)
  const { data: tokenRows } = await supabase
    .from("inv_integration_secrets")
    .select("tenant_id, value")
    .eq("key", "telegram_bot_token");
  const tokenByTenant = new Map((tokenRows ?? []).map((r) => [r.tenant_id, r.value]));

  if (tokenByTenant.size === 0) {
    return new Response(
      JSON.stringify({ status: "skipped", reason: "ยังไม่มี tenant ไหนตั้งค่า telegram_bot_token เลย" }),
      { status: 200 }
    );
  }

  const { data: branches } = await supabase
    .from("inv_branches")
    .select("id, name, telegram_chat_id, tenant_id")
    .eq("is_active", true)
    .not("telegram_chat_id", "is", null);

  const results = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const branch of branches ?? []) {
    const botToken = tokenByTenant.get(branch.tenant_id);
    if (!botToken) {
      results.push({ branch: branch.name, sent: 0, reason: "tenant ของสาขานี้ยังไม่ได้ตั้งค่า telegram_bot_token" });
      continue;
    }

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
