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
  {
    rules: {
      // พารามิเตอร์/ตัวแปรที่ขึ้นต้นด้วย _ = ตั้งใจไม่ใช้ (เช่น พารามิเตอร์ที่ต้องคงไว้ตาม
      // signature ของ Next.js หรือของ API ที่ผู้เรียกใช้อยู่) — เขียน _ กำกับดีกว่าปิดกฎทั้งไฟล์
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
