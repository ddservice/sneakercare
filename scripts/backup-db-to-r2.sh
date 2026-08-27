#!/usr/bin/env bash
# สำรองข้อมูล Postgres ของ SneakerCareDB (ref mdlxogfkpwejnqpzhmoy) แบบ logical dump ทุกวัน
# แล้วอัปโหลดไป Cloudflare R2 เป็น off-site disaster recovery
#
# ทำไมต้องมีสคริปต์นี้ (สำคัญมาก อ่านก่อน): project นี้อยู่บน Supabase Free plan ซึ่ง "ไม่มี" automated
# backup/PITR ให้เลย (เริ่มมีที่ Pro plan ขึ้นไปเท่านั้น) — วันที่ 2026-08-26 เพิ่งเกิดเหตุการณ์จริงที่
# migration ตัวหนึ่งถูกรันซ้ำโดยไม่ตั้งใจแล้วลบ `inv_stock_transactions` ทั้งตารางไปเกือบหมด (ดู CLAUDE.md
# หัวข้อ "เหตุการณ์สำคัญที่เคยเกิด" 2026-08-26) กู้คืนได้ครั้งนั้นเพราะบังเอิญมี audit log เก็บ snapshot ไว้
# ครบพอดี — ถ้าไม่มีสคริปต์นี้และเกิดเหตุการณ์ที่ audit log ก็ไม่ครอบคลุมด้วย (เช่น ตาราง sc_* เดิมที่ไม่มี
# audit log เลยตามที่บันทึกไว้ในเหตุการณ์ 2026-07-11 ของ milo) ข้อมูลจะกู้คืนไม่ได้เลย
#
# รันบนเซิร์ฟเวอร์ที่มี /var/www/sneakercare/ (เครื่องเดียวกับที่ deploy.yml SSH เข้าไป pull) ผ่าน cron
# ไม่ใช่ Supabase pg_cron เพราะต้องมี process ภายนอกที่ pg_dump ได้จริงและอัปโหลดไฟล์ไปที่อื่นได้
#
# ── ติดตั้งครั้งแรก ──────────────────────────────────────────────────────────
#   1. ติดตั้ง postgresql-client ให้ major version ตรงกับ Postgres ของ SneakerCareDB (เช็คด้วย
#      `select version();` ใน SQL Editor ของ dashboard ก่อน — ตอนเขียนสคริปต์นี้คือ Postgres 17)
#      Ubuntu 24.04 เก็บแค่ v16 ใน repo default ต้องเพิ่ม PGDG repo ก่อนถึงจะลง v17 ได้:
#        sudo apt install -y curl ca-certificates
#        sudo install -d /usr/share/postgresql-common/pgdg
#        curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo tee /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc >/dev/null
#        sudo sh -c 'echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
#        sudo apt update && sudo apt install -y postgresql-client-17
#      ⚠️ ลงแล้ว `pg_dump` เปล่าบน PATH อาจยังชี้ไป v16 เดิมอยู่ (update-alternatives ไม่สลับ default ให้
#      อัตโนมัติ) เช็คด้วย `pg_dump --version` — ถ้ายังขึ้น 16.x ให้ใช้ path เต็ม
#      `/usr/lib/postgresql/17/bin/pg_dump` แทน (สคริปต์นี้ใช้ path เต็มอยู่แล้วโดย default กันปัญหานี้ไว้ล่วงหน้า)
#   2. ติดตั้ง AWS CLI (ใช้ยิง R2 เพราะ R2 คุย S3 API ได้): sudo apt install awscli
#   3. สร้างไฟล์ /etc/sneakercare-backup.env (chmod 600, เจ้าของเป็น user ที่รัน cron เท่านั้น) ใส่:
#        SUPABASE_DB_URL=postgresql://postgres:<password>@<host>:5432/postgres   # ดูข้อ 4
#        R2_ACCOUNT_ID=xxxxxxxx
#        R2_ACCESS_KEY_ID=xxxxxxxx
#        R2_SECRET_ACCESS_KEY=xxxxxxxx
#        R2_BUCKET=sneakercare-db-backups
#        TELEGRAM_BOT_TOKEN=xxxxxxxx        # ใช้ bot เดิมกับ @SneakerCareStockBot ก็ได้ คนละ chat_id
#        TELEGRAM_OPS_CHAT_ID=xxxxxxxx      # แชทที่ Admin เห็น ไม่ใช่กลุ่ม "SneakerCare Team" ของพนักงาน
#        BACKUP_RETENTION_DAYS=14
#        LOCAL_BACKUP_DIR=/var/backups/sneakercare   # ไม่บังคับ ค่า default เป็นค่านี้อยู่แล้ว ห้ามชี้เข้า
#                                                     # /var/www/sneakercare/ (จะโดน git pull ของ deploy.yml
#                                                     # เหยียบ/หรือหลุดเข้า git โดยไม่ตั้งใจ)
#   4. เอา connection string จาก Supabase dashboard → Project Settings → Database → Connection string
#      → เลือกแท็บ **"Session pooler" เท่านั้น** (host ขึ้นต้น aws-0-/aws-1- ไม่ใช่ Transaction pooler
#      พอร์ต 6543 เพราะ pg_dump ต้องการ session ที่คงที่ตลอดการ dump) — **ห้ามใช้ "Direct connection"
#      (host ขึ้นต้น db.xxx.supabase.co) เด็ดขาดถ้าเซิร์ฟเวอร์ไม่มี IPv6** เจอปัญหานี้จริงตอน setup ครั้งแรก
#      (2026-08-27): Direct connection hostname resolve เป็น IPv6 อย่างเดียว ถ้าเซิร์ฟเวอร์ไม่มี IPv6 เลย
#      (เช็คด้วย `ip -6 addr show scope global` ถ้าว่างเปล่าคือไม่มี) จะต่อไม่ได้เลย ("Network is unreachable")
#      Session pooler ผ่าน Supavisor รองรับ IPv4 เสมอ ไม่มีปัญหานี้
#   5. สร้าง R2 bucket ในหน้า Cloudflare dashboard เอง ตั้ง lifecycle rule ลบไฟล์เก่ากว่า 30-90 วันอัตโนมัติ
#   6. ทดสอบรันมือก่อนตั้ง cron: chmod +x scripts/backup-db-to-r2.sh && bash scripts/backup-db-to-r2.sh
#   7. เพิ่ม cron (crontab -e) รันตี 3 ทุกวัน:
#        0 3 * * * /usr/bin/env bash -c 'set -a; source /etc/sneakercare-backup.env; set +a; /var/www/sneakercare/scripts/backup-db-to-r2.sh' >> /var/log/sneakercare-backup.log 2>&1
#
# ── การกู้คืน (ทดสอบเป็นระยะ อย่าเก็บไว้เฉยๆ โดยไม่เคยลองกู้) ───────────────────────
#   pg_restore --clean --if-exists --no-owner -d "$SUPABASE_DB_URL" backup-YYYYmmdd_HHMMSS.dump
#   แนะนำทดสอบกู้ใส่ project Supabase ใหม่ที่แยกต่างหาก อย่ากู้ทับ SneakerCareDB จริงตอนทดสอบ
#   pg_dump แบบนี้ dump ทั้งฐานข้อมูล (ทั้ง sc_* เดิมและ inv_* ใหม่) ไม่ต้องแยกสำรอง 2 รอบ

set -euo pipefail

: "${SUPABASE_DB_URL:?ต้องตั้งค่า SUPABASE_DB_URL}"
: "${R2_ACCOUNT_ID:?ต้องตั้งค่า R2_ACCOUNT_ID}"
: "${R2_ACCESS_KEY_ID:?ต้องตั้งค่า R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?ต้องตั้งค่า R2_SECRET_ACCESS_KEY}"
: "${R2_BUCKET:?ต้องตั้งค่า R2_BUCKET}"

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
WORKDIR="$(mktemp -d)"
DUMP_FILE="${WORKDIR}/sneakercare-backup-${STAMP}.dump"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

notify_failure() {
  local message="$1"
  if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_OPS_CHAT_ID:-}" ]]; then
    curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_OPS_CHAT_ID}" \
      -d "text=⚠️ SneakerCareDB backup ล้มเหลว (${STAMP} UTC): ${message}" \
      >/dev/null || true
  fi
}
trap 'notify_failure "ดูรายละเอียดที่ /var/log/sneakercare-backup.log บนเซิร์ฟเวอร์"' ERR

echo "[$(date -u +%FT%TZ)] เริ่ม pg_dump -> ${DUMP_FILE}"
# ใช้ binary เจาะจงเวอร์ชัน 17 ตรงๆ ไม่พึ่ง `pg_dump` เปล่าบน PATH — Ubuntu เก็บ client หลายเวอร์ชันพร้อมกันได้
# (update-alternatives ไม่ได้สลับ default ให้อัตโนมัติตอนลง postgresql-client-17 เพิ่ม) เจอปัญหานี้จริงตอน
# setup ครั้งแรก (2026-08-27): PATH ชี้ไปเวอร์ชัน 16 ซึ่งเก่ากว่า server (17.6) ทำให้ pg_dump ปฏิเสธรันเอง
# (server version mismatch) — เจาะจง path ตรงกันดีที่สุด ไม่ต้องพึ่งว่าใครจะมาสลับ default ทีหลัง
PG_DUMP_BIN="${PG_DUMP_BIN:-/usr/lib/postgresql/17/bin/pg_dump}"
"$PG_DUMP_BIN" --format=custom --no-owner --no-privileges --file="$DUMP_FILE" "$SUPABASE_DB_URL"

DUMP_SIZE="$(du -h "$DUMP_FILE" | cut -f1)"
echo "[$(date -u +%FT%TZ)] pg_dump เสร็จ ขนาดไฟล์ ${DUMP_SIZE}"

echo "[$(date -u +%FT%TZ)] อัปโหลดไป R2 bucket ${R2_BUCKET}"
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
aws s3 cp "$DUMP_FILE" "s3://${R2_BUCKET}/sneakercaredb/sneakercare-backup-${STAMP}.dump" \
  --endpoint-url "$R2_ENDPOINT" \
  --only-show-errors

echo "[$(date -u +%FT%TZ)] อัปโหลดสำเร็จ"

# เก็บสำเนาล่าสุดไว้บนเซิร์ฟเวอร์ด้วย (กู้เร็วกว่าดาวน์โหลดจาก R2) แยกไว้นอก /var/www/sneakercare/ โดยตั้งใจ
# (deploy.yml ทำ git pull ในโฟลเดอร์นั้นทุกครั้งที่ push ขึ้น main ห้ามเก็บไฟล์ backup ปนไว้ในนั้น)
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-/var/backups/sneakercare}"
mkdir -p "$LOCAL_BACKUP_DIR"
cp "$DUMP_FILE" "${LOCAL_BACKUP_DIR}/sneakercare-backup-${STAMP}.dump"
find "$LOCAL_BACKUP_DIR" -name 'sneakercare-backup-*.dump' -mtime "+${RETENTION_DAYS}" -delete

echo "[$(date -u +%FT%TZ)] เสร็จสมบูรณ์"
