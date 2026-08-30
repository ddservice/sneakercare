import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const BACKUP_DIR = path.resolve("./backups");
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const filename = path.join(BACKUP_DIR, `backup-${timestamp}.sql.gz`);

console.log(`📦 Starting Database Backup to ${filename}...`);

const dbUrl = "postgresql://postgres.mdlxogfkpwejnqpzhmoy:4itEiwHriGdGTEEY@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres";

try {
  const isWindows = process.platform === "win32";
  if (isWindows) {
    console.log("ℹ️  Running in local Windows environment. For production backup, run on VPS.");
  } else {
    execSync(`/usr/lib/postgresql/17/bin/pg_dump "${dbUrl}" | gzip > "${filename}"`, { stdio: "inherit" });
    console.log(`✅ Backup successfully created: ${filename}`);

    // Retain only last 7 days of backups
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith("backup-"));
    if (files.length > 7) {
      files.sort().slice(0, files.length - 7).forEach(f => {
        fs.unlinkSync(path.join(BACKUP_DIR, f));
        console.log(`🧹 Removed old backup: ${f}`);
      });
    }
  }
} catch (error) {
  console.error("❌ Backup failed:", error);
}
