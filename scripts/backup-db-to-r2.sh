#!/usr/bin/env bash
# สำรองข้อมูล Postgres ของ Supabase project นี้ (shoe-care-inventory) แบบ logical dump ทุกวัน
# แล้วอัปโหลดไป Cloudflare R2 เป็น off-site disaster recovery
#
# ทำไมต้องมีสคริปต์นี้: project อยู่บน Supabase Free plan ซึ่ง "ไม่มี" automated backup/PITR ให้เลย
# (ฟีเจอร์นี้เริ่มที่ Pro plan ขึ้นไป) ถ้าไม่มีอะไรสำรองแยกไว้เอง ข้อมูลทั้งหมดจะไม่มีการกู้คืนใดๆ เลย
# ถ้าเกิดปัญหาที่ฝั่ง Supabase หรือมีคนลบข้อมูลผิดพลาด
#
# รันบน VPS (เครื่องเดียวกับที่รัน PM2/Nginx ของแอปนี้) ผ่าน cron ไม่ใช่ Supabase pg_cron เพราะต้องมี
# process ภายนอกที่ pg_dump ได้จริงและอัปโหลดไฟล์ไปที่อื่นได้ — pg_cron รันแค่ SQL ในตัว DB เอง ทำแบบนี้ไม่ได้
#
# ── ติดตั้งครั้งแรก (ทำเองบน VPS ผมเข้าไม่ถึงเครื่องนี้) ──────────────────────────
#   1. ติดตั้ง postgresql-client ให้ major version ตรงกับ Postgres ของ Supabase (ปัจจุบัน 17):
#        sudo apt install postgresql-client-17
#      เช็ค `SHOW server_version;` ที่ SQL Editor ของ dashboard project shoe-care-inventory ถ้าเปลี่ยนเวอร์ชัน
#   2. ติดตั้ง AWS CLI (ใช้ยิง R2 เพราะ R2 คุย S3 API ได้): sudo apt install awscli
#   3. สร้างไฟล์ /etc/rrs-backup.env (chmod 600, เจ้าของเป็น user ที่รัน cron เท่านั้น) ใส่:
#        SUPABASE_DB_URL=postgresql://postgres:<password>@<host>:5432/postgres   # ดูข้อ 4
#        R2_ACCOUNT_ID=xxxxxxxx
#        R2_ACCESS_KEY_ID=xxxxxxxx
#        R2_SECRET_ACCESS_KEY=xxxxxxxx
#        R2_BUCKET=rrs-db-backups
#        TELEGRAM_BOT_TOKEN=xxxxxxxx        # ใช้ bot เดิมกับที่แจ้งเตือนสต๊อกต่ำก็ได้ (คนละ chat_id)
#        TELEGRAM_OPS_CHAT_ID=xxxxxxxx      # แชทที่ Admin/ผู้ดูแลระบบเห็น ไม่ใช่กลุ่มพนักงานหน้าร้าน
#        BACKUP_RETENTION_DAYS=14
#        LOCAL_BACKUP_DIR=/var/backups/rrs   # ไม่บังคับ ค่า default เป็นค่านี้อยู่แล้ว ห้ามชี้เข้าโฟลเดอร์โปรเจกต์
#   4. เอา connection string จาก Supabase dashboard → Project Settings → Database → Connection string
#      → เลือกแบบ "Session" หรือ direct connection (ไม่ใช่ Transaction pooler พอร์ต 6543) เพราะ pg_dump
#      ต้องการ session ที่คงที่ตลอดการ dump — transaction-mode pooler ตัด session กลางคันได้ ทำให้ dump เพี้ยน
#   5. สร้าง R2 bucket ในหน้า Cloudflare dashboard เอง (ผมสร้างให้ไม่ได้ ไม่มีสิทธิ์เข้าบัญชี Cloudflare)
#      แนะนำตั้ง lifecycle rule ในบักเก็ตให้ลบไฟล์เก่ากว่า 30-90 วันอัตโนมัติ กัน bucket โตไม่หยุด
#   6. ทดสอบรันมือก่อนตั้ง cron: chmod +x scripts/backup-db-to-r2.sh && bash scripts/backup-db-to-r2.sh
#   7. เพิ่ม cron (crontab -e) รันตี 3 ทุกวัน แล้ว **ตรวจไฟล์ต่อทันที** ด้วย verify-backup.sh:
#        0 3 * * * /usr/bin/env bash -c 'set -a; source /etc/rrs-backup.env; set +a; \
#          /path/to/RRS/scripts/backup-db-to-r2.sh && /path/to/RRS/scripts/verify-backup.sh' \
#          >> /var/log/rrs-backup.log 2>&1
#
# ── การกู้คืน ─────────────────────────────────────────────────────────────────────
#   pg_restore --clean --if-exists --no-owner -d "$SUPABASE_DB_URL" backup-YYYYmmdd_HHMMSS.dump
#   แนะนำทดสอบกู้ใส่ project Supabase ใหม่ที่แยกต่างหาก อย่ากู้ทับ project จริงตอนทดสอบ
#
#   ⚠️ อย่าเชื่อว่าไฟล์กู้ได้เพียงเพราะสร้างไฟล์สำเร็จ — ใช้ `scripts/verify-backup.sh` ตรวจ
#   (ต่อท้าย cron ตามข้อ 7 แล้ว) และรัน `scripts/verify-backup.sh --deep` ด้วยมือเป็นระยะ
#   เพื่อกู้ลง Postgres ชั่วคราวใน Docker จริงๆ แล้วนับแถว

set -euo pipefail

# ถ้ามี PostgreSQL 17 client ติดตั้งไว้ ให้ดึงขึ้นมาใช้ก่อน (กัน version mismatch error)
if [[ -d "/usr/lib/postgresql/17/bin" ]]; then
  export PATH="/usr/lib/postgresql/17/bin:${PATH}"
fi

: "${SUPABASE_DB_URL:?ต้องตั้งค่า SUPABASE_DB_URL}"
: "${R2_ACCOUNT_ID:?ต้องตั้งค่า R2_ACCOUNT_ID}"
: "${R2_ACCESS_KEY_ID:?ต้องตั้งค่า R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?ต้องตั้งค่า R2_SECRET_ACCESS_KEY}"
: "${R2_BUCKET:?ต้องตั้งค่า R2_BUCKET}"

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-90}"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
WORKDIR="$(mktemp -d)"
DUMP_FILE="${WORKDIR}/rrs-backup-${STAMP}.dump"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

notify() {
  local message="$1"
  if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_OPS_CHAT_ID:-}" ]]; then
    # --data-urlencode กัน message ที่มีขึ้นบรรทัดใหม่/อักขระพิเศษทำ request เพี้ยน
    curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_OPS_CHAT_ID}" \
      --data-urlencode "text=${message}" \
      >/dev/null || true
  fi
}

notify_failure() {
  notify "⚠️ RRS DB backup ล้มเหลว (${STAMP} UTC): $1"
}
trap 'notify_failure "ดูรายละเอียดที่ /var/log/rrs-backup.log บน VPS"' ERR

echo "[$(date -u +%FT%TZ)] เริ่ม pg_dump -> ${DUMP_FILE}"
pg_dump --format=custom --no-owner --no-privileges --file="$DUMP_FILE" "$SUPABASE_DB_URL"

DUMP_SIZE="$(du -h "$DUMP_FILE" | cut -f1)"
echo "[$(date -u +%FT%TZ)] pg_dump เสร็จ ขนาดไฟล์ ${DUMP_SIZE}"

echo "[$(date -u +%FT%TZ)] อัปโหลดไป R2 bucket ${R2_BUCKET}"
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
aws s3 cp "$DUMP_FILE" "s3://${R2_BUCKET}/daily/rrs-backup-${STAMP}.dump" \
  --endpoint-url "$R2_ENDPOINT" \
  --only-show-errors

echo "[$(date -u +%FT%TZ)] อัปโหลดสำเร็จ"

# ลบไฟล์สำรองบน Cloudflare R2 ที่เก่ากว่า RETENTION_DAYS วัน
CUTOFF_DATE="$(date -u -d "${RETENTION_DAYS} days ago" +%Y%m%d 2>/dev/null || date -u -v-${RETENTION_DAYS}d +%Y%m%d 2>/dev/null || true)"
if [[ -n "$CUTOFF_DATE" ]]; then
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  aws s3 ls "s3://${R2_BUCKET}/daily/" --endpoint-url "$R2_ENDPOINT" 2>/dev/null | while read -r line; do
    file_name="$(echo "$line" | awk '{print $4}')"
    if [[ "$file_name" =~ ([0-9]{8})_ ]]; then
      file_date="${BASH_REMATCH[1]}"
      if [[ "$file_date" < "$CUTOFF_DATE" ]]; then
        echo "[$(date -u +%FT%TZ)] ลบไฟล์เก่าจาก R2: ${file_name} (วันที่ ${file_date} เก่ากว่า ${RETENTION_DAYS} วัน)"
        AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
        AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
        aws s3 rm "s3://${R2_BUCKET}/daily/${file_name}" --endpoint-url "$R2_ENDPOINT" --only-show-errors || true
      fi
    fi
  done
fi

# เก็บสำเนาล่าสุดไว้บน VPS ด้วย (กู้เร็วกว่าดาวน์โหลดจาก R2) แยกไว้นอก working tree ของ repo โดยตั้งใจ
# (ห้ามเก็บในโฟลเดอร์โปรเจกต์ จะได้ไม่เสี่ยงหลุดเข้า git โดยไม่ตั้งใจ) ลบไฟล์เก่ากว่า RETENTION_DAYS วันทิ้ง
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-/var/backups/rrs}"
mkdir -p "$LOCAL_BACKUP_DIR"
cp "$DUMP_FILE" "${LOCAL_BACKUP_DIR}/rrs-backup-${STAMP}.dump"
find "$LOCAL_BACKUP_DIR" -name '*.dump' -mtime "+${RETENTION_DAYS}" -delete

# แจ้งเตือน "สำเร็จ" ด้วย ไม่ใช่แจ้งเฉพาะตอนล้มเหลว (heartbeat)
#
# ทำไม: เดิมสคริปต์เงียบสนิทเวลาทำงานปกติ ซึ่งแปลว่า "เงียบ" มีได้ 2 ความหมายที่แยกกันไม่ออกเลย
# คือ (ก) สำรองสำเร็จทุกวัน กับ (ข) cron ตายไปแล้ว/ไฟล์ env พัง จึงไม่มีอะไรรันและไม่มีอะไรให้ fail
# ด้วยซ้ำ — กรณี (ข) จะไม่มีใครรู้จนถึงวันที่ต้องใช้ backup จริง ซึ่งสายไปแล้ว
# พอมีข้อความทุกวัน ความเงียบจึงกลายเป็นสัญญาณผิดปกติที่คนสังเกตได้เอง
notify "💾 RRS DB backup สำเร็จ
📅 ${STAMP} UTC
📦 rrs-backup-${STAMP}.dump (${DUMP_SIZE})
☁️ Cloudflare R2 (${R2_BUCKET}) & 💾 VPS ${LOCAL_BACKUP_DIR}"

echo "[$(date -u +%FT%TZ)] เสร็จสมบูรณ์"
