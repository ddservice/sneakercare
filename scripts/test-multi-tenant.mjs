#!/usr/bin/env node
/**
 * ทดสอบ tenant boundary กับฐานข้อมูล production จริง โดยสร้าง tenant + บัญชีชั่วคราวขึ้นมา
 * แล้วลบทิ้งทั้งหมด — ด่านสุดท้ายก่อนจะกล้าเชิญนิติบุคคลที่สองเข้าระบบจริง
 *
 * ทำไมต้องมี: migration 0031 (RLS) และการกรอง tenant_id ในโค้ดแอป (0032 + 10 action file)
 * พิสูจน์ถูกต้องแล้วผ่าน PGlite (จำลอง) แต่ยังไม่เคยพิสูจน์กับ production จริง — บทเรียนจาก
 * `test:staff` (2026-09-07): บั๊กเรื่องสิทธิ์ไม่มี error ให้เห็น มีแต่ "เห็นข้อมูลที่ไม่ควรเห็น"
 * หรือ "ไม่เห็นข้อมูลที่ควรเห็น" เงียบๆ และบางบั๊ก (เช่น inv_fn_current_branch() อ่านผิดตาราง)
 * ไม่มีทางเจอถ้าทดสอบด้วย PGlite จำลองเท่านั้น เพราะ production มี schema/trigger/extension
 * บางอย่างที่จำลองไม่ครบ — ต้องยิงกับของจริงเท่านั้นถึงจะชัวร์
 *
 * ⚠️ เทสต์นี้แตะฐานข้อมูล production จริง (สร้าง/ลบ tenant + บัญชีชั่วคราว) จึงไม่ได้อยู่ใน CI
 * รันเองก่อนเชิญนิติบุคคลที่สองเข้าระบบทุกครั้ง:
 *   node --env-file=.env.local scripts/test-multi-tenant.mjs
 *
 * ข้อมูลทดสอบถูกใส่ผ่าน service_role (ไม่ใช่ผ่าน session ของบัญชีทดสอบ) โดยตั้งใจ — กันไม่ให้
 * trigger เขียน audit log ผูก performed_by กับบัญชีทดสอบ (auth.uid() เป็น null ตอนใช้
 * service_role) ไม่งั้นจะลบบัญชีทดสอบไม่ได้ติด FK เหมือนที่เคยเกิดกับบัญชี rlsverify35 มาก่อน
 * (ดู CLAUDE.md) — บัญชีทดสอบใช้แค่อ่าน (SELECT) ผ่าน session จริงเท่านั้น
 *
 * ⚠️ ข้อยกเว้นเดียว: ส่วน [7] (Telegram bot token) ต้องทดสอบ RPC ที่ "เขียน" จริง
 * (inv_fn_set_integration_secret) ผ่าน session ของบัญชีทดสอบเอง — RPC นี้ trigger เขียน
 * audit log ผูกกับ auth.uid() ของผู้เรียกเสมอ (migration 0034 แก้ให้ FK ของ audit log ชี้
 * profiles(id) แล้ว แปลว่าบัญชีที่เคยเรียก RPC นี้ **ลบไม่ได้อีกเลย** — เจอจริงตอนเขียนเทสต์นี้
 * ครั้งแรก บัญชีทดสอบตัวหนึ่งลบไม่ออกติด FK เดียวกับ rlsverify35 ทันที) แทนที่จะสร้างบัญชีใหม่
 * ทุกครั้งแล้วเป็นขยะค้างเพิ่มขึ้นเรื่อยๆ ทุกรอบที่รัน เทสต์นี้จึง **ใช้ tenant/บัญชีตายตัว
 * ซ้ำทุกครั้ง** (BOT_TEST_TENANT/BOT_TEST_USER ด้านล่าง — คือบัญชีที่ค้างจริงจากรันครั้งแรก
 * 2026-09-17) รีเซ็ตรหัสผ่านใหม่ทุกรอบแล้วล็อกอินซ้ำ ไม่สร้างบัญชีใหม่เพิ่มอีก — ขยะจึงมีแค่
 * ก้อนเดียวถาวร ไม่โตขึ้นเรื่อยๆ ตามจำนวนครั้งที่รันเทสต์นี้
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.error("ต้องรันด้วย --env-file=.env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey);
const stamp = Date.now();
const T1 = "00000000-0000-0000-0000-000000000001"; // tenant จริงที่มีอยู่แล้ว (SneakerCare)
const T2 = randomUUID(); // tenant ปลอมสำหรับเทสต์นี้เท่านั้น — ลบทิ้งได้สะอาดทุกรอบ (ไม่แตะ RPC ที่เขียน audit)

// tenant/บัญชีตายตัว ใช้ซ้ำทุกรอบเฉพาะเทสต์ RPC เขียน (ดูคำอธิบายยาวด้านบนหัวไฟล์)
const BOT_TEST_TENANT = "6ab0c7ac-6d67-4129-bff2-3fdbfb309b54";
const BOT_TEST_USER = "2d998127-2eb6-4849-8899-4a65a7d0836c";
const BOT_TEST_EMAIL = "tenanttest.botfixture@local.test";

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { console.log(`  ✗ ${m}`); failures++; };
function check(cond, okMsg, badMsg) {
  if (cond) ok(okMsg);
  else bad(badMsg);
}

const testRows = []; // { table, id } — ไว้ล้างทิ้งตอนจบ
const testUsers = []; // uid ของบัญชีทดสอบ — ไว้ล้างทิ้งตอนจบ

async function cleanup() {
  console.log("\nล้างข้อมูลทดสอบ…");
  for (const { table, match } of testRows.reverse()) {
    const { error } = await admin.from(table).delete().match(match);
    if (error) console.error(`  ลบ ${table} (${JSON.stringify(match)}) ล้มเหลว: ${error.message}`);
  }
  for (const uid of testUsers) {
    await admin.from("profiles").delete().eq("id", uid);
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error) console.error(`  ลบบัญชี ${uid} ล้มเหลว: ${error.message}`);
  }
  const { error: tenantErr } = await admin.from("tenants").delete().eq("id", T2);
  console.log(`ลบ tenant ทดสอบ: ${tenantErr ? "ล้มเหลว — " + tenantErr.message : "สำเร็จ"}`);
}

async function createLoginUser(tenantId, role, label) {
  const email = `tenanttest.${stamp}.${label}@local.test`;
  const password = randomBytes(18).toString("base64url");
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createErr) throw new Error(`สร้างบัญชี ${label} ไม่สำเร็จ: ${createErr.message}`);
  const uid = created.user.id;
  testUsers.push(uid);

  const { error: profErr } = await admin.from("profiles").insert({
    id: uid,
    username: `tenanttest_${stamp}_${label}`,
    display_name: `Tenant Test ${label}`,
    role,
    branch_id: null,
    tenant_id: tenantId,
    is_active: true,
  });
  if (profErr) throw new Error(`สร้าง profiles ของ ${label} ไม่สำเร็จ: ${profErr.message}`);

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: loginErr } = await client.auth.signInWithPassword({ email, password });
  if (loginErr) throw new Error(`ล็อกอิน ${label} ไม่สำเร็จ: ${loginErr.message}`);
  return client;
}

/** สร้าง/reuse tenant+บัญชีตายตัวสำหรับเทสต์ RPC ที่เขียน audit log (ดูคำอธิบายหัวไฟล์) —
 * upsert ทั้ง tenant/profiles แล้วรีเซ็ตรหัสผ่านใหม่ทุกรอบ (ไม่รู้รหัสผ่านเดิมจากรันครั้งก่อน)
 * แทนที่จะสร้างบัญชีใหม่ซึ่งจะเป็นขยะเพิ่มขึ้นเรื่อยๆ ทุกครั้งที่รันเทสต์นี้ */
async function ensureBotTestFixture() {
  const { error: tErr } = await admin
    .from("tenants")
    .upsert({ id: BOT_TEST_TENANT, name: "TEST-TENANT-bot-fixture" });
  if (tErr) throw new Error(`upsert BOT_TEST_TENANT ไม่สำเร็จ: ${tErr.message}`);

  const password = randomBytes(18).toString("base64url");
  // ตั้ง email ให้ตรงกับ BOT_TEST_EMAIL ทุกรอบด้วย (บัญชีจริงที่มีอยู่ตอนนี้ยังใช้ email แบบ
  // timestamp เดิมจากรันครั้งแรก 2026-09-17 — ปรับให้ตรงกับค่าคงที่ใหม่ในรอบนี้)
  const { error: pwErr } = await admin.auth.admin.updateUserById(BOT_TEST_USER, {
    password,
    email: BOT_TEST_EMAIL,
    email_confirm: true,
  });
  if (pwErr) throw new Error(`รีเซ็ตรหัสผ่าน/email บัญชี fixture ไม่สำเร็จ: ${pwErr.message}`);

  const { error: profErr } = await admin.from("profiles").upsert({
    id: BOT_TEST_USER,
    username: "tenanttest_bot_fixture",
    display_name: "Tenant Test Bot Fixture",
    role: "admin",
    branch_id: null,
    tenant_id: BOT_TEST_TENANT,
    is_active: true,
  });
  if (profErr) throw new Error(`upsert profiles ของ fixture ไม่สำเร็จ: ${profErr.message}`);

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: loginErr } = await client.auth.signInWithPassword({ email: BOT_TEST_EMAIL, password });
  if (loginErr) throw new Error(`ล็อกอินบัญชี fixture ไม่สำเร็จ: ${loginErr.message}`);
  return client;
}

try {
  console.log("[1] เตรียม tenant ทดสอบ + ข้อมูลทดสอบ (ผ่าน service_role เท่านั้น)");
  const { error: tenantErr } = await admin.from("tenants").insert({ id: T2, name: `TEST-TENANT-${stamp}` });
  if (tenantErr) throw new Error(`สร้าง tenant ทดสอบไม่สำเร็จ: ${tenantErr.message}`);
  ok(`สร้าง tenant ทดสอบ ${T2}`);

  // 1 แถวทดสอบต่อตาราง ผูกกับ T2 — ยอดเงิน/ชื่อใช้ค่าที่มองออกว่าเป็นข้อมูลทดสอบชัดเจน
  const sale = await admin.from("sc_sales")
    .insert({ date: "2000-01-01", total_revenue: 1, recorded_by: "TEST", tenant_id: T2 })
    .select("id").single();
  if (sale.error) throw new Error(`สร้าง sc_sales ทดสอบไม่สำเร็จ: ${sale.error.message}`);
  testRows.push({ table: "sc_sales", match: { id: sale.data.id } });

  const opex = await admin.from("sc_opex")
    .insert({ month: "01/2000", category: "TEST", key: `test_${stamp}`, name: "TEST ROW", amount: 1, tenant_id: T2 })
    .select("id").single();
  if (opex.error) throw new Error(`สร้าง sc_opex ทดสอบไม่สำเร็จ: ${opex.error.message}`);
  testRows.push({ table: "sc_opex", match: { id: opex.data.id } });

  const item = await admin.from("items")
    .insert({ name: `TEST-ITEM-${stamp}`, base_unit: "ชิ้น", purchase_unit: "ชิ้น", item_type: "consumable", category: "TEST", tenant_id: T2 })
    .select("id").single();
  if (item.error) throw new Error(`สร้าง items ทดสอบไม่สำเร็จ: ${item.error.message}`);
  testRows.push({ table: "items", match: { id: item.data.id } });

  console.log("\n[2] สร้างบัญชีล็อกอินจริง — admin ของ tenant จริง (T1) และ admin ของ tenant ทดสอบ (T2)");
  const asT1 = await createLoginUser(T1, "admin", "t1admin");
  ok("ล็อกอินเป็น admin ของ tenant จริง (T1) สำเร็จ");
  const asT2 = await createLoginUser(T2, "admin", "t2admin");
  ok("ล็อกอินเป็น admin ของ tenant ทดสอบ (T2) สำเร็จ");

  console.log("\n[3] admin ของ T1 ต้องไม่เห็นข้อมูลทดสอบของ T2 เลย");
  {
    const r = await asT1.from("sc_sales").select("id").eq("id", sale.data.id);
    check(!r.error && (r.data ?? []).length === 0, "sc_sales: T1 มองไม่เห็นแถวทดสอบของ T2", `T1 เห็นแถวของ T2! ${JSON.stringify(r.data)} / ${r.error?.message}`);

    const r2 = await asT1.from("sc_opex").select("id").eq("id", opex.data.id);
    check(!r2.error && (r2.data ?? []).length === 0, "sc_opex: T1 มองไม่เห็นแถวทดสอบของ T2", `T1 เห็นแถวของ T2! ${JSON.stringify(r2.data)}`);

    const r3 = await asT1.from("items").select("id").eq("id", item.data.id);
    check(!r3.error && (r3.data ?? []).length === 0, "items: T1 มองไม่เห็นแถวทดสอบของ T2", `T1 เห็นแถวของ T2! ${JSON.stringify(r3.data)}`);

    const r4 = await asT1.from("profiles").select("username").eq("tenant_id", T2);
    check(!r4.error && (r4.data ?? []).length === 0, "profiles: T1 มองไม่เห็นผู้ใช้ของ T2 เลย", `T1 เห็นผู้ใช้ของ T2! ${JSON.stringify(r4.data)}`);
  }

  console.log("\n[4] admin ของ T2 ต้องไม่เห็นข้อมูลจริงของ T1 เลย (เช็คนับแถว ไม่ดึงยอดเงินจริงออกมาโชว์)");
  {
    // T2 มีแถวทดสอบของตัวเอง 1 แถวอยู่แล้ว (สร้างไว้ในขั้นตอน [1]) — เช็คว่าทุกแถวที่ T2 มองเห็น
    // เป็นของ T2 เองเท่านั้น (ไม่ใช่เช็คว่าเห็น 0 แถว เพราะมีข้อมูลของตัวเองอยู่จริง)
    const realCount = await admin.from("sc_sales").select("id", { count: "exact", head: true }).eq("tenant_id", T1);
    const asT2Rows = await asT2.from("sc_sales").select("tenant_id");
    const t2SalesTenants = new Set((asT2Rows.data ?? []).map((r) => r.tenant_id));
    check(
      t2SalesTenants.size === 1 && t2SalesTenants.has(T2),
      `sc_sales: T2 เห็นแค่แถวของตัวเอง (ของจริงใน T1 มี ${realCount.count} แถว แต่ T2 ไม่เห็นเลย)`,
      `T2 เห็นข้อมูลของ tenant อื่นรั่ว! tenant_id ที่เห็น: ${[...t2SalesTenants].join(", ")}`
    );

    const asT2Items = await asT2.from("items").select("id", { count: "exact", head: true });
    check(asT2Items.count === 1, `items: T2 เห็นแค่ 1 แถว (ของตัวเองเท่านั้น)`, `T2 เห็น ${asT2Items.count} แถว (ควรเห็นแค่ 1)`);

    const asT2Profiles = await asT2.from("profiles").select("username");
    const usernames = (asT2Profiles.data ?? []).map((r) => r.username);
    check(
      usernames.every((u) => u.includes(`t2admin`)),
      "profiles: T2 เห็นแค่ผู้ใช้ของตัวเอง",
      `T2 เห็นผู้ใช้ที่ไม่ใช่ของตัวเอง: ${JSON.stringify(usernames)}`
    );
  }

  console.log("\n[5] admin ของแต่ละ tenant ยังเห็นข้อมูลของตัวเองได้ปกติ (ไม่ได้บล็อกเกินจริง)");
  {
    const t1Own = await asT1.from("sc_sales").select("id", { count: "exact", head: true });
    check((t1Own.count ?? 0) > 0, `T1 ยังเห็นข้อมูลจริงของตัวเอง (${t1Own.count} แถว)`, "T1 เห็น 0 แถว — บล็อกเกินจริงจนเห็นข้อมูลตัวเองไม่ได้!");

    const t2Own = await asT2.from("sc_opex").select("id, amount").eq("id", opex.data.id).maybeSingle();
    check(t2Own.data?.amount === 1, "T2 อ่านแถวทดสอบของตัวเองได้ถูกต้อง", `T2 อ่านข้อมูลตัวเองไม่ได้: ${JSON.stringify(t2Own)}`);
  }

  console.log("\n[6] insert ข้าม tenant ต้องถูกปฏิเสธ (ทดสอบผ่าน session จริง — ไม่ผ่าน audit trigger)");
  {
    const r = await asT2.from("items").insert({ name: "HACK-ATTEMPT", base_unit: "x", tenant_id: T1 });
    check(!!r.error, `T2 พยายาม insert ลง tenant T1 ถูกปฏิเสธจริง → ${r.error?.message?.slice(0, 60)}`, "T2 insert ลง T1 สำเร็จ! ช่องโหว่จริง");
  }

  console.log("\n[7] Telegram bot token ต่อ tenant (migration 0033) — เทสต์ผ่าน RPC จริงกับ production");
  {
    // ⚠️ ห้ามเรียก inv_fn_set_integration_secret ในฐานะ T1 เด็ดขาด — T1 คือ tenant จริงของธุรกิจ
    // ที่ใช้งานอยู่ และมี bot token จริงตั้งไว้แล้ว การ "set" ทับจะไปทำลาย token จริงที่ใช้ส่ง
    // แจ้งเตือนสต๊อกต่ำเข้ากลุ่มพนักงานทุกวัน — ทดสอบฝั่งเขียนกับบัญชี fixture ตายตัวเท่านั้น
    // (ดูคำอธิบายหัวไฟล์ว่าทำไมต้องเป็นบัญชีตายตัว ไม่ใช่ T2 ที่สร้างใหม่ทุกรอบ)
    // ฝั่ง T1 ทดสอบแค่ "อ่าน" เพื่อพิสูจน์ว่ายังอ่านค่าจริงของตัวเองได้ปกติ (ไม่ได้ถูกงานนี้ทำพัง)
    const asBotFixture = await ensureBotTestFixture();
    ok("เตรียม/ล็อกอินบัญชี fixture ตายตัวสำหรับเทสต์ RPC เขียนสำเร็จ");

    const setR = await asBotFixture.rpc("inv_fn_set_integration_secret", {
      p_key: "telegram_bot_token",
      p_value: `TEST_TOKEN_${stamp}`,
    });
    check(!setR.error, "บัญชี fixture ตั้งค่า telegram_bot_token ของตัวเองผ่าน RPC จริงสำเร็จ", `ตั้งค่าไม่สำเร็จ: ${setR.error?.message}`);
    // DELETE ไม่ trigger audit log (ตรวจแล้วว่า trigger ผูกแค่ AFTER INSERT OR UPDATE) ⇒ ลบแถวนี้
    // ทิ้งได้สะอาดทุกรอบ โดยไม่เพิ่มขยะใน audit log ซ้อนขึ้นไปอีก (มีแค่ 1 แถว audit จาก insert/
    // update ครั้งแรกเท่านั้นที่ผูกกับบัญชีนี้ถาวร)
    testRows.push({ table: "inv_integration_secrets", match: { tenant_id: BOT_TEST_TENANT, key: "telegram_bot_token" } });

    const statusFixture = await asBotFixture.rpc("inv_fn_integration_secret_status", { p_key: "telegram_bot_token" });
    const expectedSuffix = `TEST_TOKEN_${stamp}`.slice(-4);
    check(
      statusFixture.data?.[0]?.is_set === true && statusFixture.data?.[0]?.value_suffix === expectedSuffix,
      `บัญชี fixture อ่านสถานะ token ของตัวเองถูกต้อง (4 ตัวท้าย '${expectedSuffix}')`,
      `ได้ ${JSON.stringify(statusFixture.data)} / ${statusFixture.error?.message}`
    );

    const statusT1 = await asT1.rpc("fn_integration_secret_status", { p_key: "telegram_bot_token" });
    check(
      statusT1.data?.[0]?.is_set === true && statusT1.data?.[0]?.value_suffix !== expectedSuffix,
      "T1 (tenant จริง) ยังอ่านสถานะ token จริงของตัวเองได้ปกติ ไม่ปนกับ fixture",
      `T1 อ่านสถานะผิดปกติหลังแก้ migration 0033: ${JSON.stringify(statusT1.data)} / ${statusT1.error?.message}`
    );
  }
} catch (err) {
  console.error("\nข้อผิดพลาดระหว่างเทสต์:", err.message);
  failures++;
} finally {
  await cleanup();
}

console.log(
  failures === 0
    ? "\n✅ tenant boundary ทำงานถูกต้องครบทุกข้อกับ production จริง — ปลอดภัยที่จะเชิญนิติบุคคลที่สองเข้าระบบ (หลังปิดช่องว่าง ext_*/bot token ที่ยังเหลืออยู่)"
    : `\n❌ พบ ${failures} ข้อที่ไม่ผ่าน — ห้ามเชิญนิติบุคคลที่สองเข้าระบบจนกว่าจะแก้`
);
process.exitCode = failures === 0 ? 0 : 1;
