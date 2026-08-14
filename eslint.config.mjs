import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ระบบเดิม (Google Apps Script) — เก็บไว้อ้างอิง migration เท่านั้น ไม่ใช่ส่วนหนึ่งของแอปใหม่
    "legacy/**",
    // Deno runtime ไม่ใช่ Node/browser — lint แยกด้วย Deno tooling ถ้าจำเป็น
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
