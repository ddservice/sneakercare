#!/usr/bin/env bash
# ตรวจว่าไฟล์สำรองข้อมูลล่าสุด "กู้คืนได้จริง" ไม่ใช่แค่ "สร้างไฟล์สำเร็จ"
#
# ทำไมต้องมี: backup ที่ไม่เคยมีใครลองกู้คือสมมติฐาน ไม่ใช่ backup — โปรเจกต์ข้างเคียง
# (cnxhaircutz) เพิ่งเจอกับตัวเมื่อ 2026-08-28 ว่าไฟล์ที่ขึ้น "สำเร็จ" ทุกคืนติดต่อกันนาน
# แท้จริงกู้ไม่ได้เลย เพราะไม่มี auth.users อยู่ในไฟล์ ทั้งที่ profiles.id เป็น FK ไป
# auth.users(id) → พอกู้เข้า project ใหม่ profiles insert ไม่ผ่านสักแถว แล้วพังต่อกันทั้งกราฟ
#
# RRS มีโครงสร้างเดียวกันเป๊ะ (supabase/migrations/0001_init.sql:42) ต่างกันแค่ backup ของเรา
# ใช้ pg_dump ทั้ง DB ซึ่ง "ควร" ได้ schema auth มาด้วย — สคริปต์นี้มีไว้พิสูจน์ว่าได้จริง
# แทนที่จะเชื่อว่าน่าจะได้
#
# ── โหมดการทำงาน ────────────────────────────────────────────────────────────
#   โหมดปกติ (เร็ว ~1 วินาที ไม่ต้องใช้ Docker):
#     อ่านสารบัญ (TOC) ในไฟล์ dump ด้วย `pg_restore --list` แล้วตรวจว่ามีข้อมูลของทุกตาราง
#     ที่ควรมี รวมถึง auth.users — จับไฟล์เสีย/ไฟล์ขาด/ตารางหายได้ทั้งหมด
#
#   โหมดลึก (`--deep`, ~1-2 นาที ต้องมี Docker):
#     กู้ไฟล์ลง Postgres ชั่วคราวใน Docker จริงๆ แล้วนับจำนวนแถว — จับได้เพิ่มอีกชั้นว่า
#     ข้อมูลข้างในไม่ได้ว่างเปล่าหรือเสียหาย เสร็จแล้วลบ container ทิ้งเสมอ
#
# ── วิธีใช้ ─────────────────────────────────────────────────────────────────
#   bash scripts/verify-backup.sh                    # ไฟล์ล่าสุดใน LOCAL_BACKUP_DIR
#   bash scripts/verify-backup.sh path/to/x.dump     # ไฟล์ที่ระบุ
#   bash scripts/verify-backup.sh --deep             # กู้จริงลง Docker ด้วย
#
#   ต่อท้าย backup ใน cron (แนะนำ) — ตรวจทุกคืนหลังสำรองเสร็จ:
#     0 3 * * * /usr/bin/env bash -c 'set -a; source /etc/rrs-backup.env; set +a; \
#       /path/to/RRS/scripts/backup-db-to-r2.sh && /path/to/RRS/scripts/verify-backup.sh' \
#       >> /var/log/rrs-backup.log 2>&1
#
#   ตัวแปร env ใช้ชุดเดียวกับ backup-db-to-r2.sh (/etc/rrs-backup.env):
#     LOCAL_BACKUP_DIR, TELEGRAM_BOT_TOKEN, TELEGRAM_OPS_CHAT_ID
#
# exit 0 = เท่าที่ตรวจได้ ไฟล์นี้กู้คืนได้   exit 1 = อย่าไว้ใจไฟล์นี้ (ส่ง Telegram แจ้งด้วย)

set -euo pipefail

# ถ้ามี PostgreSQL 17 client ติดตั้งไว้ ให้ดึงขึ้นมาใช้ก่อน (กัน version mismatch error)
if [[ -d "/usr/lib/postgresql/17/bin" ]]; then
  export PATH="/usr/lib/postgresql/17/bin:${PATH}"
fi

LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-/var/backups/rrs}"

# ทุกตารางใน supabase/migrations/ — ตรวจรายชื่อได้ด้วย:
#   grep -rhoiE '^create table (if not exists )?(public\.)?[a-z_]+' supabase/migrations/*.sql \
#     | sed -E 's/.*[ .]//' | sort -u
# เพิ่ม migration ที่สร้างตารางใหม่เมื่อไหร่ ให้เติมชื่อที่นี่ด้วย — ถ้าลืม สคริปต์นี้จะไม่รู้ว่า
# ตารางนั้นหายไปจาก backup ซึ่งเป็นบั๊กประเภทเดียวกับที่สคริปต์นี้มีไว้ดักพอดี
EXPECTED_TABLES=(
  app_settings
  audit_logs
  branches
  integration_secrets
  item_stock
  items
  notification_log
  profiles
  stock_transactions
  suppliers
)

# ขนาดต่ำสุดที่ยังพอสมเหตุสมผล — ไฟล์ที่เล็กกว่านี้แปลว่า dump ขาดกลางคันแทบแน่นอน
MIN_SIZE_BYTES="${MIN_BACKUP_SIZE_BYTES:-10240}"

DEEP=0
DUMP_FILE=""
for arg in "$@"; do
  case "$arg" in
    --deep) DEEP=1 ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) DUMP_FILE="$arg" ;;
  esac
done

PROBLEMS=()
WARNINGS=()

notify_failure() {
  local body="$1"
  if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_OPS_CHAT_ID:-}" ]]; then
    curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_OPS_CHAT_ID}" \
      --data-urlencode "text=🚨 RRS: ไฟล์สำรองข้อมูลมีปัญหา — กู้คืนไม่ได้
${body}" \
      >/dev/null || true
  fi
}

# ── ตรวจเครื่องมือที่ต้องใช้ก่อน ─────────────────────────────────────────────
# ต้องเช็คก่อนแตะไฟล์: ถ้าไม่มี pg_restore แล้วปล่อยให้โค้ดข้างล่างเรียก มันจะ fail แล้ว
# ถูกตีความว่า "ไฟล์เสียหาย" ซึ่งเป็นการแจ้งเตือนผิด (false alarm) ที่อันตรายกว่าไม่แจ้ง
# เพราะจะทำให้คนเลิกเชื่อการแจ้งเตือนจากสคริปต์นี้ไปเลย
if ! command -v pg_restore >/dev/null 2>&1; then
  echo "✗ ไม่พบคำสั่ง pg_restore — ติดตั้งด้วย: sudo apt install postgresql-client-17" >&2
  notify_failure "ตรวจสอบไฟล์สำรองไม่ได้: ไม่มี pg_restore บน VPS (sudo apt install postgresql-client-17) — นี่ไม่ได้แปลว่าไฟล์เสีย แต่แปลว่ายังไม่มีใครตรวจได้เลย"
  exit 1
fi

# ── หาไฟล์ที่จะตรวจ ────────────────────────────────────────────────────────
if [[ -z "$DUMP_FILE" ]]; then
  if [[ ! -d "$LOCAL_BACKUP_DIR" ]]; then
    echo "✗ ไม่พบโฟลเดอร์ ${LOCAL_BACKUP_DIR}" >&2
    notify_failure "ไม่พบโฟลเดอร์สำรองข้อมูล ${LOCAL_BACKUP_DIR} บน VPS"
    exit 1
  fi
  # ปลอดภัยกับ ls -t ตรงนี้: ชื่อไฟล์ถูกสร้างโดย backup-db-to-r2.sh เป็น
  # rrs-backup-YYYYmmdd_HHMMSS.dump เสมอ จึงไม่มีช่องว่างหรืออักขระแปลกให้ต้องกัน
  #
  # `|| true` จำเป็น: เมื่อไม่มีไฟล์ตรง glob เลย ls จะคืน exit 2 ซึ่ง pipefail + set -e
  # จะฆ่าสคริปต์ทิ้งตรงนี้เงียบๆ ทำให้ไม่มีใครได้รับแจ้งเตือน — ซึ่งเป็นเคส "cron หยุดยิง"
  # ที่สคริปต์นี้ต้องจับให้ได้มากที่สุดพอดี
  DUMP_FILE="$(ls -1t "$LOCAL_BACKUP_DIR"/rrs-backup-*.dump 2>/dev/null | head -n1 || true)"
  if [[ -z "$DUMP_FILE" ]]; then
    echo "✗ ไม่พบไฟล์ rrs-backup-*.dump ใน ${LOCAL_BACKUP_DIR}" >&2
    notify_failure "ไม่พบไฟล์สำรองข้อมูลเลยใน ${LOCAL_BACKUP_DIR} — cron หยุดทำงานหรือเปล่า?"
    exit 1
  fi
fi

echo "ตรวจสอบไฟล์: ${DUMP_FILE}"

# ── 1. ไฟล์มีอยู่จริงและขนาดสมเหตุสมผล ─────────────────────────────────────
if [[ ! -f "$DUMP_FILE" ]]; then
  echo "✗ ไม่พบไฟล์" >&2
  notify_failure "ไม่พบไฟล์ ${DUMP_FILE}"
  exit 1
fi

SIZE_BYTES="$(stat -c%s "$DUMP_FILE")"
if (( SIZE_BYTES < MIN_SIZE_BYTES )); then
  PROBLEMS+=("ไฟล์เล็กผิดปกติ (${SIZE_BYTES} bytes < ${MIN_SIZE_BYTES}) — น่าจะ dump ขาดกลางคัน")
fi

# อายุไฟล์ — เตือนถ้าไฟล์ล่าสุดเก่ากว่า 48 ชม. แปลว่า cron อาจหยุดยิงไปแล้ว
AGE_HOURS=$(( ( $(date +%s) - $(stat -c%Y "$DUMP_FILE") ) / 3600 ))
if (( AGE_HOURS > 48 )); then
  PROBLEMS+=("ไฟล์สำรองล่าสุดเก่า ${AGE_HOURS} ชั่วโมงแล้ว — cron น่าจะหยุดทำงาน")
fi

# ── 2. อ่านสารบัญได้ = ไฟล์ไม่เสีย ─────────────────────────────────────────
TOC="$(mktemp)"
trap 'rm -f "$TOC"' EXIT

if ! pg_restore --list "$DUMP_FILE" > "$TOC" 2>/dev/null; then
  echo "✗ อ่านสารบัญไม่ได้ — ไฟล์เสียหรือไม่ใช่ custom-format dump" >&2
  notify_failure "pg_restore --list ล้มเหลวกับ $(basename "$DUMP_FILE") — ไฟล์เสียหาย ใช้กู้คืนไม่ได้"
  exit 1
fi

# ── 3. ทุกตารางที่ควรมี ต้องมี "ข้อมูล" อยู่ในไฟล์จริง ──────────────────────
# หา entry ชนิด TABLE DATA เท่านั้น — การมีแค่ CREATE TABLE (โครงตาราง) แต่ไม่มี TABLE DATA
# แปลว่ากู้มาแล้วได้ตารางเปล่า ซึ่งแย่กว่าไม่มี backup เพราะดูเหมือนสำเร็จ
for table in "${EXPECTED_TABLES[@]}"; do
  if ! grep -qE "TABLE DATA public ${table}([[:space:]]|$)" "$TOC"; then
    PROBLEMS+=("ไม่มีข้อมูลของตาราง public.${table} ในไฟล์")
  fi
done

# ── 4. จุดที่สำคัญที่สุด: auth.users ─────────────────────────────────────────
# profiles.id เป็น FK ไป auth.users(id) ถ้าไฟล์ไม่มี auth.users การกู้เข้า project ใหม่
# จะ insert profiles ไม่ผ่านสักแถว แล้วพังต่อกันทั้งระบบ = backup ที่กู้ไม่ได้เลย
if ! grep -qE "TABLE DATA auth users([[:space:]]|$)" "$TOC"; then
  PROBLEMS+=("ไม่มีข้อมูล auth.users ในไฟล์ — profiles.id เป็น FK ไป auth.users(id) จึงกู้เข้า project ใหม่ไม่ได้เลย")
fi

TOC_TABLES="$(grep -cE 'TABLE DATA ' "$TOC" || true)"
echo "  ตารางที่มีข้อมูลในไฟล์ : ${TOC_TABLES}"
echo "  ขนาดไฟล์               : $(numfmt --to=iec-i --suffix=B "$SIZE_BYTES" 2>/dev/null || echo "${SIZE_BYTES} bytes")"
echo "  อายุไฟล์               : ${AGE_HOURS} ชั่วโมง"

# ── 5. โหมดลึก: กู้จริงลง Postgres ชั่วคราวแล้วนับแถว ────────────────────────
if (( DEEP == 1 )); then
  if ! command -v docker >/dev/null 2>&1; then
    WARNINGS+=("ข้ามโหมดลึก: ไม่มี docker บนเครื่องนี้")
  else
    CONTAINER="rrs-verify-$$"
    PGPASS="verify-$(date +%s)"
    echo "  กำลังกู้ลง Postgres ชั่วคราวใน Docker ..."

    docker run -d --rm --name "$CONTAINER" \
      -e POSTGRES_PASSWORD="$PGPASS" -e POSTGRES_DB=verify \
      -p 55432:5432 postgres:17 >/dev/null

    # ลบ container ทิ้งเสมอ ไม่ว่าจะสำเร็จหรือพลาดกลางคัน
    trap 'docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; rm -f "$TOC"' EXIT

    for _ in $(seq 1 30); do
      if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then break; fi
      sleep 1
    done

    VERIFY_URL="postgresql://postgres:${PGPASS}@127.0.0.1:55432/verify"

    # ตั้งใจไม่สนใจ exit code ของ pg_restore: dump ของ Supabase อ้างถึง role/extension
    # ที่ไม่มีใน Postgres เปล่าๆ (supabase_admin, pgsodium, pg_graphql, ...) จึง error เป็นปกติ
    # สิ่งที่ตัดสินว่าผ่านหรือไม่คือ "ข้อมูลลงครบไหม" ที่นับจริงด้านล่าง ไม่ใช่ exit code
    pg_restore --no-owner --no-privileges --dbname "$VERIFY_URL" "$DUMP_FILE" >/dev/null 2>&1 || true

    for table in "${EXPECTED_TABLES[@]}"; do
      count="$(psql "$VERIFY_URL" -tAc "select count(*) from public.${table}" 2>/dev/null || echo "ERR")"
      if [[ "$count" == "ERR" ]]; then
        PROBLEMS+=("กู้แล้วไม่มีตาราง public.${table}")
      else
        echo "    public.${table}: ${count} แถว"
      fi
    done

    auth_count="$(psql "$VERIFY_URL" -tAc "select count(*) from auth.users" 2>/dev/null || echo "ERR")"
    if [[ "$auth_count" == "ERR" ]]; then
      PROBLEMS+=("กู้แล้วไม่มีตาราง auth.users")
    elif [[ "$auth_count" == "0" ]]; then
      PROBLEMS+=("กู้แล้ว auth.users มี 0 แถว — ไม่มีบัญชีผู้ใช้ให้ profiles อ้างถึง")
    else
      echo "    auth.users: ${auth_count} บัญชี"

      # profiles ทุกแถวต้องมีบัญชี auth คู่กัน ไม่งั้นกู้เข้า project จริงจะ FK ไม่ผ่าน
      orphans="$(psql "$VERIFY_URL" -tAc \
        "select count(*) from public.profiles p left join auth.users u on u.id = p.id where u.id is null" \
        2>/dev/null || echo "ERR")"
      if [[ "$orphans" != "ERR" && "$orphans" != "0" ]]; then
        PROBLEMS+=("มี profiles ${orphans} แถวที่ไม่มีบัญชี auth.users คู่กันในไฟล์")
      fi
    fi
  fi
fi

# ── สรุปผล ─────────────────────────────────────────────────────────────────
if (( ${#WARNINGS[@]} > 0 )); then
  echo
  echo "คำเตือน:"
  for w in "${WARNINGS[@]}"; do echo "  ! ${w}"; done
fi

if (( ${#PROBLEMS[@]} > 0 )); then
  echo
  echo "พบปัญหา:" >&2
  for p in "${PROBLEMS[@]}"; do echo "  ✗ ${p}" >&2; done
  body="📦 $(basename "$DUMP_FILE")"
  for p in "${PROBLEMS[@]}"; do body="${body}
• ${p}"; done
  notify_failure "$body"
  exit 1
fi

echo
echo "✅ ไฟล์นี้กู้คืนได้ (โครงสร้าง ข้อมูลทุกตาราง และ auth.users ครบ)"
