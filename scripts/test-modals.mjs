#!/usr/bin/env node
/**
 * ตรวจว่า **modal ทุกตัวในแอปยังปิดได้จริง** — รันแบบ static ไม่แตะฐานข้อมูล ไม่ต้องเปิดเบราว์เซอร์
 *
 * ⚠️ ทำไมเทสต์นี้ถึงจำเป็น (บทเรียนจริง 2026-09-16):
 * ผู้ใช้กด "พิมพ์สลิป" ที่ /expenses แล้ว **ติดอยู่ในหน้านั้นโดยไม่มีทางออกเลย**
 * ต้นเหตุมีสองชั้นซ้อนกัน:
 *   1. backdrop ใช้ `flex items-center justify-center` — พอเนื้อหาสูงกว่าจอ CSS จะดัน
 *      ขอบบนออกไปเป็นค่าติดลบ และ scrollTop ติดลบไม่ได้ ⇒ แถบปุ่ม "พิมพ์/ปิด" ที่อยู่
 *      บนสุด **เลื่อนไปดูไม่ได้ตลอดกาล** (การเติม overflow-y-auto เฉยๆ แก้ได้แค่ฝั่งล่าง)
 *   2. modal ที่เขียนมือทั้ง 11 ตัวไม่มีตัวไหนปิดด้วย Esc หรือกดพื้นหลังได้
 *      ⇒ บั๊กเรื่องตำแหน่งปุ่มกลายเป็น "ทางตัน" แทนที่จะเป็นแค่เรื่องน่ารำคาญ
 *
 * บั๊กข้อ 1 เคยถูกบันทึกว่า "แก้แล้ว" ในเอกสารตั้งแต่ 2026-09-02 ทั้งที่ยังพังอยู่จริง
 * — คำเตือนที่รันไม่ได้ ไม่ได้กันอะไรเลย เทสต์นี้จึงมีไว้กันไม่ให้ย้อนกลับไปเป็นแบบเดิม
 *
 * รัน: npm run test:modals
 */
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["app", "components"];
const SHELL = path.join("components", "modal-shell.tsx");

/**
 * overlay ที่ไม่ต้องผ่าน <ModalBackdrop> — ต้องมีเหตุผลกำกับทุกตัว
 * ห้ามเติมชื่อลงลิสต์นี้เพื่อให้เทสต์ผ่าน ถ้ายังตอบไม่ได้ว่าผู้ใช้จะปิดมันยังไงเมื่อปุ่มหลุดจอ
 */
const ALLOWED = {
  "components/mobile-nav.tsx": "drawer เมนูมือถือ มี Esc + กดพื้นหลังปิด เป็นของตัวเองอยู่แล้ว",
  "components/ui/dialog.tsx": "Radix Dialog จัดการ Esc / กดพื้นหลัง / focus trap / scroll lock ให้เอง",
};

let failures = 0;
const fail = (msg) => { failures++; console.log(`  ❌ ${msg}`); };
const rows = [];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const files = ROOTS.flatMap((r) => (fs.existsSync(r) ? walk(r) : []));

// ── 1) ตัว <ModalBackdrop> เองต้องคงสูตรที่ถูกต้องไว้ ───────────────────────────────
{
  const shell = fs.readFileSync(SHELL, "utf8");
  const need = ["items-start", "overflow-y-auto", 'e.key === "Escape"', "modal-scroll-lock"];
  for (const token of need) {
    if (!shell.includes(token)) fail(`${SHELL} → ขาด \`${token}\` ซึ่งเป็นหัวใจของ modal ทุกตัว`);
  }
  if (/fixed inset-0[^"]*items-center/.test(shell)) {
    fail(`${SHELL} → กลับไปใช้ \`items-center\` แล้ว ⇒ เนื้อหาที่ล้นด้านบนจะเลื่อนไปดูไม่ได้`);
  }
  rows.push([SHELL, "สูตรกลางของ backdrop"]);
}

// ── 2) ห้ามมีใครเขียน backdrop เองนอก modal-shell.tsx ────────────────────────────────
for (const file of files) {
  const rel = file.split(path.sep).join("/");
  if (rel === SHELL.split(path.sep).join("/")) continue;

  const src = fs.readFileSync(file, "utf8");
  // backdrop ของ modal = กล่องเต็มจอที่จัดกล่องเนื้อหาไว้กลางจอ
  const handRolled = [...src.matchAll(/className="([^"]*fixed inset-0[^"]*)"/g)]
    .filter(([, cls]) => cls.includes("justify-center"));

  if (handRolled.length === 0) continue;
  if (ALLOWED[rel]) { rows.push([rel, `ยกเว้นโดยตั้งใจ — ${ALLOWED[rel]}`]); continue; }

  for (const [, cls] of handRolled) {
    fail(`${rel} → เขียน backdrop เอง ให้ใช้ <ModalBackdrop> แทน (กด Esc/พื้นหลังปิดไม่ได้)\n     ${cls}`);
  }
}

// ── 3) ทุก <ModalBackdrop> ต้องมี onClose และกล่องลูกต้องมี my-auto ─────────────────
for (const file of files) {
  const rel = file.split(path.sep).join("/");
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    if (!/<ModalBackdrop\b/.test(lines[i])) continue;
    count++;

    // props ของ ModalBackdrop จบที่บรรทัดที่เป็น ">" ล้วน (หรือจบในบรรทัดเดียว)
    let end = i;
    while (end < lines.length && lines[end].trim() !== ">" && !lines[end].trim().endsWith(">")) end++;
    const props = lines.slice(i, end + 1).join("\n");

    if (!/onClose=\{/.test(props)) {
      fail(`${rel}:${i + 1} → <ModalBackdrop> ไม่มี onClose ⇒ กด Esc แล้วไม่มีอะไรเกิดขึ้น`);
    }

    // บรรทัดถัดจาก ">" คือกล่องเนื้อหา — ต้องมี my-auto คู่กับ items-start ที่ backdrop
    // ไม่งั้นเนื้อหาสั้นๆ จะไปกองอยู่ชิดขอบบนแทนที่จะอยู่กลางจอ
    const panel = lines.slice(end + 1).find((l) => l.trim().length > 0) ?? "";
    if (!panel.includes("my-auto")) {
      fail(`${rel}:${end + 2} → กล่องเนื้อหาใน <ModalBackdrop> ขาด \`my-auto\`\n     ${panel.trim().slice(0, 100)}`);
    }
  }

  if (count > 0) rows.push([rel, `${count} modal`]);
}

const w = Math.max(...rows.map((r) => r[0].length), 10);
for (const [f, note] of rows) console.log(`  ✅ ${f.padEnd(w)}  ${note}`);

const total = rows.reduce((n, [, note]) => n + (parseInt(note, 10) || 0), 0);
console.log(
  failures === 0
    ? `\n✅ modal ทั้ง ${total} ตัวปิดได้ด้วย Esc/พื้นหลัง และเลื่อนดูได้ครบเมื่อสูงกว่าจอ`
    : `\n❌ พบ ${failures} จุดที่ผู้ใช้อาจติดอยู่ใน modal โดยไม่มีทางออก`
);
process.exitCode = failures === 0 ? 0 : 1;
