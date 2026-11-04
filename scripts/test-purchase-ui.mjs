// Local production build only. Supabase HTTP fixture never connects to a real DB.
import { chromium } from '@playwright/test';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3007';
const backend = 'http://127.0.0.1:54329';
const chunks = fs.readdirSync('.next/server/chunks').filter(n=>n.endsWith('.js')).map(n=>fs.readFileSync(`.next/server/chunks/${n}`,'utf8')).join('\n');
assert.ok(!fs.existsSync('.next/lock'), 'Wait for npm run build to finish before UI tests');
assert.ok(chunks.includes(backend) && chunks.includes('fixture-anon-key'), 'Build with the local Supabase fixture settings first');
assert.ok(!/mdlxogfkpwejnqpzhmoy\.supabase\.co/.test(chunks), 'Refusing a production Supabase build');
const uid = '10000000-0000-4000-8000-000000000001';
const branch = '20000000-0000-4000-8000-000000000001';
const tenant = '30000000-0000-4000-8000-000000000001';
const item = '40000000-0000-4000-8000-000000000001';
const profile = { id:uid,username:'fixture',display_name:'ผู้ทดสอบ',role:'admin',branch_id:branch,tenant_id:tenant,is_active:true };
const user = { id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString() };
let rejectNext = true;
const submissions = [];
const financeCalls=[]; let rejectOrder=true;
const receipts = [
  { id:'old-a',branch_id:branch,item_id:item,item_name:'ถุงหูรูดผ้า 30×40 ซม.',base_unit:'ใบ',purchase_unit:'แพ็ก',pack_count:1,units_per_pack:100,base_quantity:100,goods_amount:180,shipping_amount:20,discount_amount:0,paid_amount:200,supplier_name:'ร้าน A',purchase_date:'2026-09-01',created_at:'2026-09-01T10:00:00Z',reference_note:'ตัวอย่างทดสอบ',stock_transaction_id:'old-txn-a' },
  { id:'old-b',branch_id:branch,item_id:item,item_name:'ถุงหูรูดผ้า 30×40 ซม.',base_unit:'ใบ',purchase_unit:'แพ็ก',pack_count:3,units_per_pack:50,base_quantity:150,goods_amount:200,shipping_amount:25,discount_amount:0,paid_amount:225,supplier_name:'ร้าน B',purchase_date:'2026-10-01',created_at:'2026-10-01T10:00:00Z',reference_note:'ตัวอย่างทดสอบ',stock_transaction_id:'old-txn-b' },
];
const server = http.createServer(async (req,res)=>{
  const path = new URL(req.url,backend).pathname;
  let body=''; for await (const chunk of req) body+=chunk;
  let data=[]; let status=200;
  if (path==='/auth/v1/user') data=user;
  else if (path==='/rest/v1/profiles') data=req.headers.accept?.includes('object') ? profile : [profile];
  else if (path==='/rest/v1/branches') data=[{id:branch,name:'สาขาทดสอบ',tenant_id:tenant,is_active:true}];
  else if (path==='/rest/v1/items') data=[{id:item,name:receipts[0].item_name,base_unit:'ใบ',purchase_unit:'แพ็ก',purchase_unit_qty:100,tenant_id:tenant,is_active:true}];
  else if (path==='/rest/v1/inv_branches') data=req.headers.accept?.includes('object')?{id:branch,name:'ทดสอบ',tenant_id:tenant,is_active:true,vat_registered:false}:[{id:branch,name:'ทดสอบ',tenant_id:tenant,is_active:true,vat_registered:false}];
  else if (path==='/rest/v1/services') data=[{id:'50000000-0000-4000-8000-000000000001',name:'บริการทดสอบ',base_price:200,is_active:true,category:'package',code:'TEST'}];
  else if (path==='/rest/v1/rpc/rrs_create_service_order') {
    const call=JSON.parse(body);financeCalls.push({name:'order',...call});
    if(rejectOrder){rejectOrder=false;status=400;data={code:'P0001',message:'ทดสอบ: บันทึกรับงานไม่สำเร็จ'};}
    else data={id:'60000000-0000-4000-8000-000000000001',order_no:'SC-TEST-000001',posted_to_books:true};
  }
  else if(path==='/rest/v1/rpc/rrs_set_order_status'){financeCalls.push({name:'status',...JSON.parse(body)});data={replay:false};}
  else if(path==='/rest/v1/rpc/rrs_read_sales') data={rows:[]};
  else if(path==='/rest/v1/rpc/rrs_accountant_packet') {
    const call=JSON.parse(body);financeCalls.push({name:'packet',...call});
    data={tenant_id:tenant,month:call.p_month,generated_at:new Date().toISOString(),sales:[{id:77,date:call.p_month+'-04',total_revenue:100,amount_paid:0}],payments:[{id:88,sale_id:77,amount:50}],balances:[{sale_id:77,date:call.p_month+'-04',total_revenue:100,amount_paid:0,receipts_before:0,receipts_month:50,balance_end:50}],unmatched:[]};
  }
  else if (path==='/rest/v1/rpc/inv_fn_purchase_history') data=receipts;
  else if (path==='/rest/v1/rpc/inv_fn_receive_purchase') {
    const call=JSON.parse(body); submissions.push(call);
    if (rejectNext) { rejectNext=false; status=503; data={code:'fixture_unavailable',message:'temporary test failure'}; }
    else {
      const p=call.p_data;
      receipts.push({id:call.p_request_id,branch_id:branch,item_id:p.item_id || item,item_name:receipts[0].item_name,base_unit:'ใบ',purchase_date:p.purchase_date,supplier_name:p.supplier_name,purchase_unit:p.purchase_unit,pack_count:p.purchase_qty,units_per_pack:p.units_per_pack,base_quantity:p.purchase_qty*p.units_per_pack,goods_amount:p.goods_amount,shipping_amount:p.shipping_amount,discount_amount:p.discount_amount,paid_amount:p.goods_amount+p.shipping_amount-p.discount_amount,reference_note:p.reference_note,created_at:new Date().toISOString(),stock_transaction_id:'test-txn'});
      data=call.p_request_id;
    }
  }
  res.writeHead(status,{'content-type':'application/json'}); res.end(JSON.stringify(data));
});
server.listen(54329,'127.0.0.1'); await once(server,'listening');
const logs=fs.openSync('.scratch-ui-server.log','w');
const next=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3007','-H','127.0.0.1'],{
  env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:backend,NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-anon-key',SUPABASE_SERVICE_ROLE_KEY:'fixture-service-role',NEXT_PUBLIC_SITE_URL:base},stdio:['ignore',logs,logs],windowsHide:true,
});
let browser;
let page;
try {
  for(let i=0;i<90;i++) { try { if ((await fetch(`${base}/login`)).ok) break; } catch {} await new Promise(r=>setTimeout(r,500)); }
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'th-TH'});
  const payload={sub:uid,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)};
  const jwt=`${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixture`;
  const cookie='base64-'+Buffer.from(JSON.stringify({access_token:jwt,refresh_token:'fixture',expires_at:payload.exp,expires_in:3600,token_type:'bearer',user})).toString('base64url');
  await context.addCookies([{name:'sb-127-auth-token',value:cookie,url:base},{name:'sc_active_branch',value:branch,url:base}]);
  page=await context.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/stock-in`);
  await page.getByLabel('สินค้าที่รับเข้า',{exact:true}).selectOption(item);
  await page.getByLabel('ร้านค้า / ผู้ขาย',{exact:true}).fill('ร้านทดสอบ');
  await page.getByLabel('จำนวนที่ซื้อ',{exact:true}).fill('2');
  await page.getByLabel('ใบต่อ 1 แพ็ก',{exact:true}).fill('100');
  await page.getByLabel('ค่าสินค้าก่อนส่วนลด (บาท)',{exact:true}).fill('400');
  await page.getByLabel('ค่าส่งของรายการนี้ (บาท)',{exact:true}).fill('40');
  await page.getByLabel('ส่วนลด (บาท)',{exact:true}).fill('20');
  assert.match(await page.locator('form').last().innerText(),/200 ใบ/);
  await page.getByRole('button',{name:'บันทึกซื้อและเพิ่มเข้าคลัง',exact:true}).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByLabel('จำนวนที่ซื้อ',{exact:true}).inputValue(),'2');
  assert.equal(await page.getByLabel('สินค้าที่รับเข้า',{exact:true}).inputValue(),item);
  await page.getByRole('button',{name:'บันทึกซื้อและเพิ่มเข้าคลัง',exact:true}).click();
  await page.getByText('บันทึกประวัติซื้อและเพิ่มสต๊อกแล้ว',{exact:true}).waitFor();
  assert.equal(submissions.length,2);
  assert.equal(submissions[0].p_request_id,submissions[1].p_request_id);
  assert.equal(submissions[1].p_data.units_per_pack,100);
  assert.equal(submissions[1].p_data.shipping_amount,40);
  assert.ok(await page.getByRole('button',{name:'บันทึกซื้อและเพิ่มเข้าคลัง',exact:true}).isDisabled());
  await page.getByRole('button',{name:'รับเข้ารายการถัดไป'}).click();
  await page.getByRole('button',{name:'เพิ่มสินค้าใหม่',exact:true}).click();
  await page.getByLabel('ชื่อสินค้าและรูปแบบ').fill('ถุงอีกแบบ 40×50 ซม.');
  await page.setViewportSize({width:390,height:844});
  await page.getByLabel('ชื่อสินค้าและรูปแบบ').blur();
  await page.evaluate(()=>scrollTo(0,0));
  fs.mkdirSync('.scratch-ui',{recursive:true});
  await page.screenshot({path:'.scratch-ui/stock-in-mobile.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.goto(`${base}/stock-in/prices`);
  await page.getByRole('heading',{name:'เทียบร้านค้า · บาท/ใบ'}).waitFor();
  assert.match(await page.getByLabel('ร้านที่ราคาซื้อล่าสุดต่ำสุด').innerText(),/ร้าน B · 1.5/);
  await page.screenshot({path:'.scratch-ui/prices-mobile.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'.scratch-ui/prices-desktop.png',fullPage:true});
  await page.goto(`${base}/pos`);
  await page.locator('#customer_name').fill('ลูกค้าทดสอบ'); await page.locator('#customer_phone').fill('0800000000');
  await page.getByRole('button',{name:'บันทึกรับงานรองเท้า (สร้างรายการ)',exact:true}).click();
  await page.getByText('ทดสอบ: บันทึกรับงานไม่สำเร็จ',{exact:true}).waitFor();
  assert.equal(await page.locator('#customer_name').inputValue(),'ลูกค้าทดสอบ');
  await page.getByRole('button',{name:'บันทึกรับงานรองเท้า (สร้างรายการ)',exact:true}).click();
  await page.getByText('SC-TEST-000001',{exact:true}).waitFor();
  const orderCalls=financeCalls.filter(c=>c.name==='order');assert.equal(orderCalls.length,2);assert.equal(orderCalls[0].p_request,orderCalls[1].p_request);assert.equal(orderCalls[1].p_data.gross,200);
  await page.getByRole('button',{name:'เริ่มทำความสะอาด',exact:true}).click();
  await page.getByRole('button',{name:'✓ ซักเสร็จแล้ว (พร้อมรับ)',exact:true}).waitFor();
  assert.equal(financeCalls.find(c=>c.name==='status').p_id,'60000000-0000-4000-8000-000000000001');
  await page.goto(`${base}/pos/daily-entry`);assert.ok(!(await page.locator('body').innerText()).includes('Application error'));
  await page.goto(`${base}/reports`);
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'ดาวน์โหลดชุดสำนักงานบัญชี',exact:true}).click();
  const download=await downloadPromise;await download.saveAs('.scratch-ui/accountant-fixture.xlsx');
  const XLSX=await import('xlsx');const book=XLSX.read(fs.readFileSync('.scratch-ui/accountant-fixture.xlsx'),{type:'buffer'});
  assert.ok(book.SheetNames.includes('เงินรับตามวันที่'));assert.ok(book.SheetNames.includes('หัก ณ ที่จ่าย'));
  const checks=XLSX.utils.sheet_to_json(book.Sheets['ตรวจยอดและคำอธิบาย']);assert.equal(checks.find(r=>r['รายการ']==='ผลต่างกระทบยอด (ควรเป็น 0)')['ค่า'],0);
  await page.screenshot({path:'.scratch-ui/accountant-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.scratch-ui/accountant-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('Browser fixture PASS: purchase retry/payload, supplier prices, POS failure preservation/retry/real ID, daily route, accountant workbook reconciliation, mobile overflow');
} catch (error) {
  fs.mkdirSync('.scratch-ui',{recursive:true});
  await page?.screenshot({path:'.scratch-ui/failure.png',fullPage:true});
  console.error('submissions',JSON.stringify(submissions));
  console.error('screen',await page?.locator('body').innerText());
  throw error;
} finally {
  await browser?.close(); next.kill(); server.close(); fs.closeSync(logs);
}
