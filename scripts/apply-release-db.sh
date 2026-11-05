#!/usr/bin/env bash
# Run on the VPS after the new app builds and immediately before switching it live.
set -euo pipefail
test "${1:-}" = '--confirm-production=mdlxogfkpwejnqpzhmoy'
MODE="${2:---apply}"
case "$MODE" in --apply|--dry-run) ;; *) exit 9;; esac
set -a
. /home/ddservice/sneakercare-backup.env
set +a
case "$SUPABASE_DB_URL" in *mdlxogfkpwejnqpzhmoy*) ;; *) echo 'Database reference mismatch'; exit 9;; esac
FILES=(0047_purchase_receipts.sql 0049_atomic_sales_and_payments.sql 0050_atomic_documents.sql 0051_finance_read_and_guards.sql 0052_accountant_handoff.sql 0053_actor_write_throttle.sql 0054_atomic_custom_expenses.sql)
umask 077
BACKUP_FILE="$LOCAL_BACKUP_DIR/rrs-pre-release-$(date -u +%Y%m%d_%H%M%S)-$$.dump"
/usr/lib/postgresql/17/bin/pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-acl --file="$BACKUP_FILE"
/usr/lib/postgresql/17/bin/pg_restore --list "$BACKUP_FILE" >/dev/null
echo 'Fresh database backup verified'
{
 echo "begin; set local lock_timeout='5s'; set local statement_timeout='120s';"
 echo 'create table if not exists rrs_private.release_migrations(name text primary key,sha256 text not null,applied_at timestamptz not null default now());'
 echo 'revoke all on rrs_private.release_migrations from public,anon,authenticated;'
 for FILE in "${FILES[@]}"; do
  HASH=$(sed 's/\r$//' "supabase/migrations/$FILE" | sha256sum | cut -d' ' -f1)
  printf "do \$\$ begin if exists(select 1 from rrs_private.release_migrations where name='%s' and sha256<>'%s') then raise exception 'Applied migration checksum changed'; end if; end \$\$;\n" "$FILE" "$HASH"
  printf "select not exists(select 1 from rrs_private.release_migrations where name='%s') as needs_migration " "$FILE"
  printf '%s\n' '\gset' '\if :needs_migration'
  cat "supabase/migrations/$FILE"
  printf "\ninsert into rrs_private.release_migrations(name,sha256) values('%s','%s');\n" "$FILE" "$HASH"
  printf '%s\n' '\endif'
 done
 cat supabase/release-security-smoke.sql
 cat supabase/release-business-smoke.sql
 if [ "$MODE" = --dry-run ]; then echo 'rollback;'; else echo 'commit;'; fi
} | psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1
echo "RELEASE_DATABASE_CHECKED $MODE"
