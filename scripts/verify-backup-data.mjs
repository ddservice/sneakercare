// Restores public-table data into isolated PostgreSQL ON THE VPS. Only counts leave the server.
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {spawnSync} from 'node:child_process';
if(!process.argv.includes('--confirm-production=mdlxogfkpwejnqpzhmoy'))throw Error('Explicit production reference required');
const env={...parseEnv(readFileSync('.env.local','utf8')),...process.env};
const command=`set -euo pipefail
umask 077
set -a; . /home/ddservice/sneakercare-backup.env; set +a
case "$SUPABASE_DB_URL" in *mdlxogfkpwejnqpzhmoy*) ;; *) exit 9;; esac
LAST_DUMP=$(find "$LOCAL_BACKUP_DIR" -maxdepth 1 -type f -name 'rrs-pre-release-*.dump' -printf '%T@ %p\\n' | sort -nr | head -n 1 | cut -d' ' -f2-)
test -n "$LAST_DUMP"
WORK_DIR=$(mktemp -d /tmp/rrs-restore.XXXXXX)
PG_BIN=/usr/lib/postgresql/18/bin
cleanup() { "$PG_BIN/pg_ctl" -D "$WORK_DIR/data" -m immediate stop >/dev/null 2>&1 || true; case "$WORK_DIR" in /tmp/rrs-restore.*) rm -rf -- "$WORK_DIR";; esac; }
trap cleanup EXIT
"$PG_BIN/initdb" -D "$WORK_DIR/data" --auth=trust --encoding=UTF8 >"$WORK_DIR/init.log" 2>&1
"$PG_BIN/pg_ctl" -D "$WORK_DIR/data" -l "$WORK_DIR/server.log" -o "-k $WORK_DIR -h '' -p 55901" start >/dev/null
cat > "$WORK_DIR/copy.py" <<'PY'
import sys,re
active=False
for line in sys.stdin:
 if not active:
  m=re.match(r'COPY public\\.([^ ]+) \\((.+)\\) FROM stdin;',line)
  if m:
   table=m.group(1); cols=m.group(2).split(', ')
   print('CREATE TABLE public.'+table+' ('+', '.join(c+' text' for c in cols)+');')
   print(line,end='');active=True
 else:
  print(line,end='')
  if line.strip()==chr(92)+'.': active=False
PY
/usr/lib/postgresql/17/bin/pg_restore --data-only --schema=public --no-owner --no-acl --file=- "$LAST_DUMP" | python3 "$WORK_DIR/copy.py" | "$PG_BIN/psql" -h "$WORK_DIR" -p 55901 -d postgres -X -q -v ON_ERROR_STOP=1 >"$WORK_DIR/load.log" 2>&1
COUNT_SQL="select json_build_object('profiles',(select count(*) from profiles),'sc_sales',(select count(*) from sc_sales),'sc_payments',(select count(*) from sc_payments),'inv_stock_transactions',(select count(*) from inv_stock_transactions),'sc_opex',(select count(*) from sc_opex));"
PGOPTIONS='-c default_transaction_read_only=on' psql "$SUPABASE_DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "$COUNT_SQL" > "$WORK_DIR/source.json"
"$PG_BIN/psql" -h "$WORK_DIR" -p 55901 -d postgres -X -qAt -c "$COUNT_SQL" > "$WORK_DIR/restored.json"
python3 - "$WORK_DIR/source.json" "$WORK_DIR/restored.json" <<'PY'
import sys,json
source=json.load(open(sys.argv[1]));restored=json.load(open(sys.argv[2]))
if source!=restored: raise SystemExit('Backup counts differ from current data; take fresh backup if shop activity occurred')
print('BACKUP_DATA_RESTORE_PASS: 5 critical public table counts match; backup data stayed on VPS; schema/auth restore not included')
PY
TABLES=$("$PG_BIN/psql" -h "$WORK_DIR" -p 55901 -d postgres -X -qAt -c "select count(*) from information_schema.tables where table_schema='public';")
EXPECTED_TABLES=$(/usr/lib/postgresql/17/bin/pg_restore --list "$LAST_DUMP" | awk '/TABLE DATA public /{n++} END{print n}')
test "$EXPECTED_TABLES" -ge 20
test "$TABLES" -eq "$EXPECTED_TABLES"
echo "RESTORED_PUBLIC_TABLES $TABLES/$EXPECTED_TABLES"
`;
const args=['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10'];
if(env.VPS_SSH_KEY)args.push('-i',env.VPS_SSH_KEY);if(env.VPS_PORT)args.push('-p',env.VPS_PORT);
args.push(`${env.VPS_USER}@${env.VPS_HOST}`,command);
const result=spawnSync('ssh',args,{encoding:'utf8',maxBuffer:1024*1024,timeout:180000,windowsHide:true});
if(result.stdout)console.log(result.stdout);
if(result.status!==0)console.error('Server-side backup restore drill failed; no business data transferred. '+String(result.stderr||'').slice(-300));
process.exitCode=result.status??1;
