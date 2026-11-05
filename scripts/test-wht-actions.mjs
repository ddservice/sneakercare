import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createHash} from 'node:crypto';
const source=fs.readFileSync('app/actions/wht.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const tenant='tenant-a';let calls=[];let closed=null;let certificates=[];let expense={id:7,amount:107};
const query=table=>{const q={};for(const method of ['select','eq','gte','lt','lte','limit','order','insert','delete'])q[method]=(...args)=>{calls.push([table,method,...args]);return q;};q.single=async()=>({data:{certificate_number:'WHT-actual-from-database'},error:null});q.maybeSingle=async()=>({data:table==='sc_opex'?expense:{id:'payee-a',kind:'person',name:'supplier'},error:null});q.then=(resolve,reject)=>Promise.resolve({data:certificates,error:null,count:0}).then(resolve,reject);return q;};
const modules={
 'node:crypto':{createHash},'@/lib/finance-rpc':{financeRpc:async()=>({})},
 'next/cache':{revalidatePath(){}},
 '@/lib/auth':{requireProfile:async()=>({id:'actor-a',tenant_id:tenant}),requireModuleWrite(){}},
 '@/lib/tenant':{requireTenantId:async()=>tenant},
 '@/lib/period-close-store':{assertPeriodOpen:async()=>closed},
 '@/lib/supabase/admin':{createAdminClient:()=>({from:query})},
 '@/lib/audit':{logAudit:async()=>{}},'@/lib/errors':{errorMessage:e=>e.message},
 '@/lib/wht':{settleWht:()=>({whtAmount:3,baseAmount:100,vatAmount:7,grossAmount:107,whtRate:3,netPayment:104}),pndFormForPayee:()=> 'PND3',incomeTypeForCategory:()=>({code:'5',label:'services'}),periodYmFromIsoDate:d=>d.slice(0,7),certificateNumber:()=> 'WHT-test'},
};
const mod={exports:{}};
new Function('require','module','exports',compiled)(id=>{assert.ok(modules[id],`Unexpected import ${id}`);return modules[id];},mod,mod.exports);
const {issuePayableCertificate:issue,deleteCertificatesForOpex:remove}=mod.exports;
const input={payeeId:'payee-a',paymentDate:'2026-02-28',baseAmount:100,vatRate:7,whtRate:3,legacyOpexId:7,tenantId:tenant,createdBy:'forged-actor'};
assert.equal((await issue({...input,tenantId:'tenant-b'})).success,false);assert.equal(calls.length,0);
await assert.rejects(remove(7,'tenant-b'),/ไม่มีสิทธิ์/);assert.equal(calls.length,0);
assert.equal((await issue({...input,paymentDate:'2026-02-31'})).success,false);assert.equal(calls.length,0);
closed='งวดปิดแล้ว';assert.equal((await issue(input)).error,closed);assert.equal(calls.length,0);closed=null;
expense=null;assert.equal((await issue(input)).success,false);assert.equal(calls.some(c=>c[1]==='insert'),false);
expense={id:7,amount:107};calls=[];
assert.equal((await issue(input)).certificateNumber,'WHT-actual-from-database');
const insert=calls.find(c=>c[0]==='sc_wht_certificates'&&c[1]==='insert')[2];assert.equal(insert.tenant_id,tenant);assert.equal(insert.created_by,'actor-a');
assert.ok(calls.some(c=>c[1]==='lt'&&c[3]==='2026-03-01'));assert.equal(calls.some(c=>c[1]==='lte'),false);
certificates=[{id:'issued-cert'}];await assert.rejects(remove(7,tenant),/50 ทวิ/);assert.equal(calls.some(c=>c[1]==='delete'),false);
certificates=[];await remove(7,tenant);assert.equal(calls.some(c=>c[1]==='delete'),false);
console.log('WHT ACTION PASS: tenant/actor spoofing, invalid date, closed period, expense ownership/amount and issued evidence preservation');
