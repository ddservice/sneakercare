// Explicit target, dry-run by default. Applies only versioned release migrations.
import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
const ref='mdlxogfkpwejnqpzhmoy';
if(!process.argv.includes(`--confirm-production=${ref}`)) throw Error(`Require --confirm-production=${ref}`);
const files=process.argv.filter(x=>/^00\d\d_[\w-]+\.sql$/.test(x));
const backup=process.argv.includes('--backup');
if(!files.length&&!backup) throw Error('Specify migration filenames');
for(const f of files) if(!existsSync(`supabase/migrations/${f}`)||Number(f.slice(0,4))<47) throw Error('Unexpected migration');
const apply=process.argv.includes('--apply');
const env={...parseEnv(readFileSync('.env.local','utf8')),...process.env};
const args=['-o','BatchMode=yes','-o','ConnectTimeout=10','-o','StrictHostKeyChecking=yes'];
if(env.VPS_SSH_KEY)args.push('-i',env.VPS_SSH_KEY);
if(env.VPS_PORT)args.push('-p',env.VPS_PORT);
const smoke=process.argv.includes('--smoke')?readFileSync('supabase/release-security-smoke.sql','utf8'):'';
const businessSmoke=process.argv.includes('--business-smoke')?readFileSync('supabase/release-business-smoke.sql','utf8'):'';
const sql=`begin; set local lock_timeout='5s'; set local statement_timeout='120s';\n${files.map(f=>readFileSync(`supabase/migrations/${f}`,'utf8')).join('\n')}\n${smoke}\n${businessSmoke}\n${apply?'commit':'rollback'};\n`;
let command=`set -euo pipefail
set -a; . /home/ddservice/sneakercare-backup.env; set +a
case "$SUPABASE_DB_URL" in *${ref}*) ;; *) echo 'Target reference mismatch'; exit 9;; esac
psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1
`;
if(backup) command=`set -euo pipefail
umask 077
set -a; . /home/ddservice/sneakercare-backup.env; set +a
case "$SUPABASE_DB_URL" in *${ref}*) ;; *) echo 'Target reference mismatch'; exit 9;; esac
test -d "$LOCAL_BACKUP_DIR"
BACKUP_FILE="$LOCAL_BACKUP_DIR/rrs-pre-release-$(date -u +%Y%m%d_%H%M%S)-$$.dump"
/usr/lib/postgresql/17/bin/pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-acl --file="$BACKUP_FILE"
/usr/lib/postgresql/17/bin/pg_restore --list "$BACKUP_FILE" | awk '/TABLE DATA/{n++} /TABLE DATA auth users /{u=1} /TABLE DATA public profiles /{p=1} END{if(!u||!p||n<50)exit 1; printf "BACKUP_TOC_TABLES %d AUTH_USERS %d PROFILES %d\\n",n,u,p}'
stat -c 'BACKUP_BYTES %s MODE %a' "$BACKUP_FILE"
echo 'BACKUP_VERIFIED'
`;
args.push(`${env.VPS_USER}@${env.VPS_HOST}`,command);
const r=spawnSync('ssh',args,{input:sql,encoding:'utf8',maxBuffer:4*1024*1024,timeout:180000,windowsHide:true});
const redact=s=>String(s||'').replace(/postgres(?:ql)?:\/\/\S+/gi,'postgresql://[redacted]');
if(r.stdout)console.log(redact(r.stdout));if(r.stderr)console.error(redact(r.stderr));
if(r.error)console.error(r.error.message);
if(r.status===0)console.log(`${apply?'APPLIED':'CHECKED AND ROLLED BACK'}: ${files.join(', ')}`);
process.exit(r.status??1);
