import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {spawnSync} from 'node:child_process';
if(!process.argv.includes('--install'))throw Error('Require --install');
const env={...parseEnv(readFileSync('.env.local','utf8')),...process.env};
const command=`set -euo pipefail
test "$(uname -m)" = x86_64
TARGET="$HOME/.local/share/rrs/node-v26.13.0-linux-x64"
if [ ! -x "$TARGET/bin/node" ]; then
 WORK_DIR=$(mktemp -d /tmp/rrs-node-install.XXXXXX)
 cd "$WORK_DIR"
 curl --fail --silent --show-error --location --proto '=https' https://nodejs.org/dist/v26.13.0/node-v26.13.0-linux-x64.tar.xz -o node.tar.xz
 printf '%s  node.tar.xz\n' d28a96af6c38596f6d9d97c0ee531c13d238d757742387d1928de822d959e997 | sha256sum --check
 mkdir -p "$HOME/.local/share/rrs"
 tar -xJf node.tar.xz -C "$HOME/.local/share/rrs"
 case "$WORK_DIR" in /tmp/rrs-node-install.*) rm -rf -- "$WORK_DIR";; *) exit 9;; esac
fi
"$TARGET/bin/node" --version
"$TARGET/bin/node" -p 'process.release.lts'
echo 'NODE_INSTALLED_APP_RUNTIME_NOT_SWITCHED'
`;
const args=['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10'];
if(env.VPS_SSH_KEY)args.push('-i',env.VPS_SSH_KEY);if(env.VPS_PORT)args.push('-p',env.VPS_PORT);
args.push(`${env.VPS_USER}@${env.VPS_HOST}`,command);
const r=spawnSync('ssh',args,{encoding:'utf8',timeout:180000,windowsHide:true});
console.log(r.stdout||'');if(r.stderr)console.error(r.stderr);process.exit(r.status??1);
