// Legacy pgTAP fixtures target the original inventory schema (0001-0007).
// Later production history contains out-of-band inv_* aliases/text roles and cannot
// be replayed verbatim as that legacy fixture. New release SQL is independently
// tested by test:migration, test:security-finance and rolled-back hosted smoke.
import fs from 'node:fs';
import path from 'node:path';
const target=path.resolve('.scratch-ci-inventory/supabase');
fs.mkdirSync(path.join(target,'migrations'),{recursive:true});
fs.writeFileSync(path.join(target,'config.toml'),fs.readFileSync('supabase/config.toml','utf8').replace('project_id = "RRS"','project_id = "RRS-inventory-ci"'));
fs.writeFileSync(path.join(target,'seed.sql'),'-- Test cases create and roll back their own fixtures.\n');
fs.cpSync('supabase/tests',path.join(target,'tests'),{recursive:true});
for(const file of fs.readdirSync('supabase/migrations').filter(file=>/^000[1-7]_.*\.sql$/.test(file))){
 fs.copyFileSync(path.join('supabase/migrations',file),path.join(target,'migrations',file));
}
console.log('Staged inventory pgTAP fixture 0001-0007; release SQL uses dedicated current-schema integration tests');
