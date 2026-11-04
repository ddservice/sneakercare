import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const checks=['lint','typecheck','test:legacy','test:reports','test:money','test:vat','test:wht','test:tax','test:tax-recon','test:etax','test:receipts','test:usage','test:ui-contracts','test:period-close','test:idempotency','test:checkout','test:dashboard','test:docs','test:expenses','test:guards','test:modals','test:roster','test:migration','test:purchases','test:security-finance'];
let failed=0;
for(const name of checks){
 const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run',name],{encoding:'utf8',shell:process.platform==='win32',windowsHide:true,maxBuffer:8*1024*1024});
 fs.writeFileSync(`.scratch-check-${name.replaceAll(':','-')}.log`,(result.stdout||'')+(result.stderr||''));
 if(result.status!==0){failed++;console.log(`FAIL ${name}`);console.log(((result.stdout||'')+(result.stderr||'')).slice(-2500));}
 else console.log(`PASS ${name}`);
}
console.log(`RELEASE_CHECKS ${checks.length-failed}/${checks.length}`);process.exitCode=failed?1:0;
