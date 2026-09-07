#!/usr/bin/env node
/**
 * ทดสอบสิทธิ์ของ role `staff` กับฐานข้อมูลจริง โดยสร้างบัญชีชั่วคราวขึ้นมาแล้วลบทิ้ง
 *
 * ทำไมต้องมี: กฎข้อ 5 ใน CLAUDE.md ("Staff ต้องไม่เห็นข้อมูลต้นทุนเด็ดขาด") เป็นกฎที่
 * **ตรวจด้วยตาไม่ได้** — ต้องล็อกอินเป็น staff จริงแล้วยิง query ดู และความผิดพลาดของกฎนี้
 * ไม่มี error ให้เห็น มีแต่ "เห็นข้อมูลที่ไม่ควรเห็น" หรือ "ไม่เห็นข้อมูลที่ควรเห็น" เงียบๆ
 *
 * ตัวอย่างจริงที่เทสต์นี้จับได้ตอนเขียน (2026-09-07):
 *   • profiles มี CHECK constraint ที่ไม่รับค่า 'staff' ⇒ เชิญพนักงานเข้าระบบไม่ได้เลย (0022)
 *   • inv_fn_current_branch() ยังอ่านจาก sc_users ⇒ staff เห็นสต๊อกเป็น 0 ทุกช่อง (0023)
 * ทั้งสองอย่างไม่มีทางเจอถ้าทดสอบด้วยบัญชี admin เพราะ admin ผ่านทุกเงื่อนไขอยู่แล้ว
 *
 * ⚠️ เทสต์นี้แตะฐานข้อมูล production จริง (สร้าง/ลบบัญชีชั่วคราว) จึงไม่ได้อยู่ใน CI
 * รันเองเมื่อแก้อะไรที่เกี่ยวกับ RLS / role / staff-safe view:
 *   node --env-file=.env.local scripts/test-staff-permissions.mjs
 *
 * บัญชีทดสอบจะถูกลบทิ้งเสมอ (เทสต์นี้อ่านอย่างเดียว ไม่เขียน audit log จึงไม่ติด FK
 * เหมือนบัญชี rlsverify เดิมที่ลบไม่ได้ — ดู CLAUDE.md)
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.error("ต้องรันด้วย --env-file=.env.local");
  process.exit(1);
}

/** ตารางที่ staff ต้องอ่านได้ ไม่งั้นใช้หน้าคลังสินค้าไม่ได้ */
const MUST_READ = ["items", "v_item_stock", "v_low_stock", "branches"];
/** ตารางที่ staff ต้องไม่เห็นข้อมูล (ต้นทุน / การเงิน / ความลับ) */
const MUST_NOT_READ = [
  "item_stock", "stock_transactions", "sc_opex", "sc_opex_history",
  "sc_employees", "integration_secrets", "audit_logs", "v_inventory_value",
];

const admin = createClient(url, serviceKey);
const stamp = Date.now();
const email = `stafftest.${stamp}@local.test`;
const password = randomBytes(18).toString("base64url");

const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (createErr) { console.error("สร้างบัญชีทดสอบไม่สำเร็จ:", createErr.message); process.exit(1); }
const uid = created.user.id;

async function cleanup() {
  await admin.from("profiles").delete().eq("id", uid);
  const { error } = await admin.auth.admin.deleteUser(uid);
  console.log(`\nลบบัญชีทดสอบ: ${error ? "ล้มเหลว — " + error.message : "สำเร็จ"}`);
}

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { console.log(`  ✗ ${m}`); failures++; };

try {
  const { data: branch } = await admin.from("branches").select("id, name").limit(1).maybeSingle();
  const { error: profErr } = await admin.from("profiles").insert({
    id: uid, username: `stafftest_${stamp}`, fullname: "บัญชีทดสอบสิทธิ์ staff",
    display_name: "Staff Test", role: "staff", branch_id: branch?.id ?? null, is_active: true,
  });
  if (profErr) {
    bad(`สร้าง profiles role=staff ไม่ได้: ${profErr.message}`);
    console.log("     (ถ้าติด profiles_role_check แปลว่า migration 0022 ยังไม่ถูก apply)");
    throw new Error("stop");
  }
  console.log(`สร้างบัญชี staff ชั่วคราวในสาขา "${branch?.name ?? "-"}" แล้ว\n`);

  const staff = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: loginErr } = await staff.auth.signInWithPassword({ email, password });
  if (loginErr) { bad(`ล็อกอินไม่สำเร็จ: ${loginErr.message}`); throw new Error("stop"); }

  const { data: role } = await staff.rpc("sc_get_my_role");
  if (role === "staff") ok(`sc_get_my_role() = "staff"`);
  else bad(`sc_get_my_role() = ${JSON.stringify(role)} (ควรเป็น "staff")`);

  console.log("\n[1] ต้องอ่านได้ และต้องไม่มีคอลัมน์ต้นทุนติดมา");
  for (const t of MUST_READ) {
    const { data, error } = await staff.from(t).select("*").limit(1);
    if (error) { bad(`${t} — ${error.message}`); continue; }
    if (!data.length) {
      // เทียบกับสิ่งที่ service_role เห็น: ถ้าตารางว่างอยู่แล้วจริงๆ การที่ staff เห็น 0 ไม่ใช่ปัญหาสิทธิ์
      // (เช่น v_low_stock ที่กรอง alert_muted = false — ตอนนี้ของที่ต่ำกว่าขั้นต่ำถูก mute ไว้หมด)
      const { count } = await admin.from(t).select("*", { count: "exact", head: true });
      if ((count ?? 0) === 0) ok(`${t} คืน 0 แถว แต่ตารางว่างจริง (service_role ก็เห็น 0) — ไม่ใช่ปัญหาสิทธิ์`);
      else bad(`${t} คืน 0 แถว ทั้งที่มีข้อมูลจริง ${count} แถว (staff ต้องเห็นของสาขาตัวเอง)`);
      continue;
    }
    const leaked = Object.keys(data[0]).filter((c) => /cost|value/i.test(c));
    if (leaked.length) bad(`${t} หลุดคอลัมน์ต้นทุน: ${leaked.join(", ")}`);
    else ok(`${t} อ่านได้ ${data.length} แถว ไม่มีคอลัมน์ต้นทุน`);
  }

  console.log("\n[2] ต้องอ่านไม่ได้เลย (ต้นทุน / การเงิน / ความลับ)");
  for (const t of MUST_NOT_READ) {
    const { data, error } = await staff.from(t).select("*").limit(1);
    if (error) ok(`${t} ถูกปฏิเสธ (${error.message.slice(0, 40)})`);
    else if ((data ?? []).length === 0) ok(`${t} คืน 0 แถว (RLS กันไว้)`);
    else bad(`${t} หลุด! staff อ่านได้ ${data.length} แถว`);
  }
} catch (err) {
  if (err.message !== "stop") console.error("ผิดพลาด:", err);
} finally {
  await cleanup();
}

console.log(failures === 0
  ? "\n✅ สิทธิ์ staff ถูกต้องครบทุกข้อ"
  : `\n❌ ไม่ผ่าน ${failures} ข้อ — อย่าเชิญพนักงานเข้าระบบจนกว่าจะแก้`);
process.exitCode = failures === 0 ? 0 : 1;
