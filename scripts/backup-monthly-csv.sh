#!/usr/bin/env bash
# ส่งออกข้อมูลของเดือนที่ปิดไปแล้วเป็น CSV แล้วอัปโหลดขึ้น Cloudflare R2 เดือนละครั้ง
#
# ต่างจาก backup-db-to-r2.sh อย่างไร (มีทั้งคู่โดยตั้งใจ ไม่ใช่ของซ้ำ):
#   - backup-db-to-r2.sh  → pg_dump รายวัน = กู้ทั้งฐานข้อมูลกลับมาได้ แต่ต้องมี pg_restore
#                            และ Postgres เวอร์ชันตรงกัน เปิดอ่านเองไม่ได้
#   - ไฟล์นี้              → CSV รายเดือน = เปิดด้วย Excel ได้ทันที ส่งให้ผู้ทำบัญชีได้
#                            และยังอ่านออกแม้ในวันที่ไม่มี Supabase/Postgres ให้ใช้แล้ว
#
# ── ติดตั้งครั้งแรก (ทำเองบน VPS) ────────────────────────────────────────────
#   1. ต้องมี Node 20+ บนเครื่อง (แอปนี้รันด้วย PM2 อยู่แล้ว จึงมีแน่นอน)
#   2. ใช้ไฟล์ /etc/rrs-backup.env ตัวเดียวกับ backup-db-to-r2.sh แต่ต้องเพิ่ม 2 ค่านี้:
#        NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
#        SUPABASE_SERVICE_ROLE_KEY=<service_role key>
#      (chmod 600 เหมือนเดิม — service_role key เท่ากับสิทธิ์เต็มของฐานข้อมูล)
#   3. ทดสอบด้วยมือก่อน:
#        set -a; source /etc/rrs-backup.env; set +a
#        bash scripts/backup-monthly-csv.sh --month=2026-08
#   4. ตั้ง cron ให้รันวันที่ 1 ของทุกเดือน ตี 4 (หลัง backup รายวันตี 3):
#        0 4 1 * * /usr/bin/env bash -c 'set -a; source /etc/rrs-backup.env; set +a; \
#          /path/to/RRS/scripts/backup-monthly-csv.sh' >> /var/log/rrs-backup.log 2>&1
#      ไม่ต้องส่ง --month: ค่า default คือ "เดือนที่แล้ว" ซึ่งตรงกับที่ต้องการพอดี
#
# CSV เก็บนานกว่า .dump โดยตั้งใจ — ไฟล์เล็กมากและเป็นหลักฐานทางบัญชีที่อาจต้องใช้ย้อนหลังหลายปี
# ค่า default 1825 วัน (5 ปี) ตามอายุที่กรมสรรพากรกำหนดให้เก็บเอกสารบัญชี

set -euo pipefail

: "${NEXT_PUBLIC_SUPABASE_URL:?ต้องตั้งค่า NEXT_PUBLIC_SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?ต้องตั้งค่า SUPABASE_SERVICE_ROLE_KEY}"
: "${R2_ACCOUNT_ID:?ต้องตั้งค่า R2_ACCOUNT_ID}"
: "${R2_ACCESS_KEY_ID:?ต้องตั้งค่า R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?ต้องตั้งค่า R2_SECRET_ACCESS_KEY}"
: "${R2_BUCKET:?ต้องตั้งค่า R2_BUCKET}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CSV_RETENTION_DAYS="${CSV_RETENTION_DAYS:-1825}"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-/var/backups/rrs}"

# ส่ง --month=YYYY-MM ต่อไปให้ตัว exporter ได้ (ไม่ส่ง = เดือนที่แล้ว)
MONTH_ARG=""
for a in "$@"; do
  case "$a" in
    --month=*) MONTH_ARG="$a" ;;
    *) echo "argument ที่ไม่รู้จัก: $a" >&2; exit 2 ;;
  esac
done

WORKDIR="$(mktemp -d)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

notify() {
  local message="$1"
  if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_OPS_CHAT_ID:-}" ]]; then
    curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_OPS_CHAT_ID}" \
      --data-urlencode "text=${message}" \
      >/dev/null || true
  fi
}
trap 'notify "⚠️ RRS CSV รายเดือนล้มเหลว — ดู /var/log/rrs-backup.log บน VPS"' ERR

CSV_DIR="${WORKDIR}/csv"
mkdir -p "$CSV_DIR"

echo "[$(date -u +%FT%TZ)] เริ่มส่งออก CSV รายเดือน"
# shellcheck disable=SC2086
node "${SCRIPT_DIR}/export-monthly-csv.mjs" ${MONTH_ARG} --out="$CSV_DIR"

# ชื่อโฟลเดอร์ที่ exporter สร้าง = ชื่อเดือน เอามาใช้ตั้งชื่อไฟล์บีบอัด
MONTH="$(ls "$CSV_DIR"/*.csv | head -n 1 | xargs -r basename | cut -d_ -f1)"
if [[ -z "$MONTH" ]]; then
  echo "ไม่พบไฟล์ CSV ที่ส่งออก — ยกเลิก" >&2
  exit 1
fi

ARCHIVE="${WORKDIR}/rrs-csv-${MONTH}.tar.gz"
tar -czf "$ARCHIVE" -C "$CSV_DIR" .
ARCHIVE_SIZE="$(du -h "$ARCHIVE" | cut -f1)"
FILE_COUNT="$(ls -1 "$CSV_DIR"/*.csv | wc -l | tr -d ' ')"

echo "[$(date -u +%FT%TZ)] อัดไฟล์เสร็จ ${ARCHIVE_SIZE} (${FILE_COUNT} ไฟล์) อัปโหลดไป R2"
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
aws s3 cp "$ARCHIVE" "s3://${R2_BUCKET}/monthly-csv/rrs-csv-${MONTH}.tar.gz" \
  --endpoint-url "$R2_ENDPOINT" \
  --only-show-errors

# เก็บสำเนาไว้บน VPS ด้วย (นอก working tree ของ repo เสมอ) แล้วลบของที่เกินอายุ
mkdir -p "${LOCAL_BACKUP_DIR}/csv"
cp "$ARCHIVE" "${LOCAL_BACKUP_DIR}/csv/rrs-csv-${MONTH}.tar.gz"
find "${LOCAL_BACKUP_DIR}/csv" -name 'rrs-csv-*.tar.gz' -mtime "+${CSV_RETENTION_DAYS}" -delete

# heartbeat เหมือน backup รายวัน — "เงียบ" ต้องแปลว่าผิดปกติ ไม่ใช่แปลว่าเรียบร้อย
notify "📑 RRS CSV รายเดือนสำเร็จ
🗓️ เดือน ${MONTH}
📦 rrs-csv-${MONTH}.tar.gz (${ARCHIVE_SIZE}, ${FILE_COUNT} ไฟล์)
☁️ Cloudflare R2 (${R2_BUCKET}/monthly-csv) & 💾 VPS ${LOCAL_BACKUP_DIR}/csv"

echo "[$(date -u +%FT%TZ)] เสร็จสมบูรณ์"
