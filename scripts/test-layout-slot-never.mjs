#!/usr/bin/env node
/**
 * ต้นเหตุที่เคยทำให้ tsc แดง:
 * ไฟล์ generate ของ Next ไม่สอดคล้องกัน — validator.ts ใช้ LayoutProps<Route>
 * เมื่อ LayoutSlotMap["/"] = never และ app/layout.ts ห้าม prop นอก children/params
 * typecheck ของแอปใช้ tsconfig.typecheck.json ที่ไม่ดึง .next เข้าโปรแกรม
 */
import fs from "node:fs";

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};

const typecheck = JSON.parse(fs.readFileSync("tsconfig.typecheck.json", "utf8"));
if ((typecheck.exclude || []).includes(".next")) {
  ok("typecheck config ไม่ดึงไฟล์ generate ที่เคยชนกันเข้า tsc");
} else {
  bad("tsconfig.typecheck.json ไม่ exclude .next");
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (String(pkg.scripts.typecheck).includes("tsconfig.typecheck.json")) {
  ok("npm run typecheck ใช้ tsconfig.typecheck.json");
} else {
  bad("typecheck ยังเป็น tsc ทั้งโปรเจกต์รวม .next");
}

const nextEnv = fs.readFileSync("next-env.d.ts", "utf8");
if (/\.next\/(?:dev\/)?types\/routes\.d\.ts/.test(nextEnv)) {
  ok("next-env.d.ts ยังดึง routes.d.ts ของ dev หรือ build");
} else {
  bad("next-env.d.ts ไม่ดึง routes.d.ts");
}

const validator = fs.readFileSync(".next/types/validator.ts", "utf8");
const routes = fs.readFileSync(".next/types/routes.d.ts", "utf8");
if (validator.includes("LayoutProps<Route>") && /"\/": never/.test(routes)) {
  ok("Next ยัง generate LayoutSlotMap never คู่กับ LayoutProps<Route> ใน validator");
} else {
  bad("รูปแบบ generate ของ Next ไม่ตรงที่เคยแดง");
}

const layoutChecker = fs.readFileSync(".next/types/app/layout.ts", "utf8");
if (layoutChecker.includes("export interface LayoutProps") && layoutChecker.includes("children") && !layoutChecker.includes("noop")) {
  ok("checker ของ layout.ts รับแค่ children/params — dummy slot จะแดงอีกแบบ");
} else {
  bad("ตรวจ .next/types/app/layout.ts ไม่ได้");
}

if (fs.existsSync("app/@noop")) {
  bad("ยังมี dummy @noop");
} else {
  ok("ไม่ใช้ dummy parallel route");
}

if (failures) process.exitCode = 1;
