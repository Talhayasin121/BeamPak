import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import {handleOrders} from '../server/orders.js';
import {bundleContents} from '../web/bundle.js';

const key='local-test-store-key-123456789';
const origin='https://beampak.example';
const base={productId:'rgb-pod',visitorId:'aabbccdd-0000-4000-8000-000000000001',quantity:2,name:'Bundle Customer',address:'21 Mall Road, Lahore',email:'bundle@example.net',expectedSubtotal:1998};
function fixture(legacy=false) {
  const db=new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort()) {
    if(!legacy || file<'0006_extra_remote.sql')db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  }
  const query=async(sql,values=[])=>{
    const bindings=[];
    const statement=sql.replace(/\$(\d+)/g,(_,index)=>{bindings.push(values[Number(index)-1]);return '?';});
    return db.prepare(statement).all(...bindings);
  };
  const submit=data=>handleOrders(new Request(origin+'/api/order-confirmations',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({...base,...data})}),query,key);
  const report=()=>handleOrders(new Request(origin+'/api/manage/order-confirmations',{headers:{Authorization:'Bearer '+key}}),query,key);
  return {db,query,submit,report};
}

test('bundle contents match every quantity, with one included remote and an optional second',()=>{
  for(let quantity=1;quantity<=20;quantity++) {
    for(const extra of [false,true]) {
      const bundle=bundleContents(quantity,extra);
      assert.equal(bundle.pods,quantity);
      assert.equal(bundle.pads,quantity);
      assert.equal(bundle.rings,quantity);
      assert.equal(bundle.remotes,extra?2:1);
      assert.equal(bundle.singleLeads+bundle.splitLeads*2,quantity);
      assert.equal(bundle.chargingLeads,Math.ceil(quantity/2));
    }
  }
  for(const invalid of [0,21,1.5,NaN,null,'2'])assert.equal(bundleContents(invalid),null);
});

test('extra remote costs 100 once and is stored and reported with its price',async()=>{
  const {db,submit,report}=fixture();
  try {
    assert.equal((await submit({extraRemoteQuantity:1,expectedSubtotal:2098})).status,200);
    const saved=(await (await report()).json()).details[0];
    assert.equal(saved.quantity,2);
    assert.equal(saved.unitPrice,999);
    assert.equal(saved.extraRemoteQuantity,1);
    assert.equal(saved.extraRemoteUnitPrice,100);
    assert.equal(saved.subtotal,2098);
  } finally {db.close();}
});

test('legacy clients can submit without choosing an extra remote',async()=>{
  const {db,submit,report}=fixture();
  try {
    assert.equal((await submit({})).status,200);
    const row=(await (await report()).json()).details[0];
    assert.equal(row.extraRemoteQuantity,0);
    assert.equal(row.subtotal,1998);
  } finally {db.close();}
});

test('invalid remote quantities and tampered totals do not create records',async()=>{
  const {db,submit}=fixture();
  try {
    for(const quantity of [-1,2,1.5,'1',true,null])assert.equal((await submit({extraRemoteQuantity:quantity})).status,400);
    assert.equal((await submit({extraRemoteQuantity:1,extraRemoteUnitPrice:1,expectedSubtotal:1999})).status,409);
    assert.equal((await submit({extraRemoteQuantity:0,expectedSubtotal:2098})).status,409);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM order_confirmations').get().count,0);
  } finally {db.close();}
});

test('changing the remote on a repeated confirmation preserves the original record',async()=>{
  const {db,submit,report}=fixture();
  try {
    assert.equal((await (await submit({extraRemoteQuantity:1,expectedSubtotal:2098})).json()).created,true);
    assert.equal((await (await submit({extraRemoteQuantity:0,expectedSubtotal:1998})).json()).created,false);
    const data=await (await report()).json();
    assert.equal(data.confirmations,1);
    assert.equal(data.details[0].extraRemoteQuantity,1);
    assert.equal(data.details[0].subtotal,2098);
  } finally {db.close();}
});

test('appended migration preserves existing submissions with no extra remote',async()=>{
  const {db,submit,report}=fixture(true);
  try {
    db.prepare("INSERT INTO order_confirmations (id,visitor_id,product_id,quantity,unit_price,name,city,address,email,source,medium,campaign) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run('aabbccdd-0000-4000-8000-000000000002',base.visitorId,'rgb-pod',2,999,base.name,'',base.address,base.email,'','','');
    db.exec(readFileSync(new URL('../drizzle/0006_extra_remote.sql',import.meta.url),'utf8'));
    db.exec(readFileSync(new URL('../drizzle/0007_contact_keys.sql',import.meta.url),'utf8'));
    const data=await (await report()).json();
    assert.equal(data.details[0].extraRemoteQuantity,0);
    assert.equal(data.details[0].subtotal,1998);
    assert.equal((await (await submit({extraRemoteQuantity:1,expectedSubtotal:2098})).json()).created,false);
  } finally {db.close();}
});

test('Netlify migration uses the same bounded schema additions',()=>{
  const d1=readFileSync(new URL('../drizzle/0006_extra_remote.sql',import.meta.url),'utf8').replace('--> statement-breakpoint','').replace(/\s+/g,' ').trim();
  const pg=readFileSync(new URL('../netlify/database/migrations/0007_extra_remote.sql',import.meta.url),'utf8').replace(/\s+/g,' ').trim();
  assert.equal(d1,pg);
});

test('one email cannot create another lead from a different browser, including case changes',async()=>{
  const {db,submit,report}=fixture();
  try {
    const responses=await Promise.all([
      submit({email:'Customer@Example.NET'}),
      submit({visitorId:'aabbccdd-0000-4000-8000-000000000003',email:'customer@example.net'})
    ]);
    const created=await Promise.all(responses.map(async response=>(await response.json()).created));
    assert.equal(created.filter(Boolean).length,1);
    assert.equal((await (await report()).json()).confirmations,1);
    assert.equal((await submit({visitorId:'aabbccdd-0000-4000-8000-000000000004',email:'other@example.net'})).status,200);
    assert.equal((await (await report()).json()).confirmations,2);
  } finally {db.close();}
});

test('new duplicate protection preserves and detects earlier records',async()=>{
  const {db,submit}=fixture(true);
  try {
    for(let n=1;n<=2;n++)db.prepare("INSERT INTO order_confirmations (id,visitor_id,product_id,quantity,unit_price,name,city,address,email,source,medium,campaign) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run('legacy-'+n,'legacy-visitor-'+n,'rgb-pod',2,999,base.name,'',base.address,base.email,'','','');
    db.exec(readFileSync(new URL('../drizzle/0006_extra_remote.sql',import.meta.url),'utf8'));
    db.exec(readFileSync(new URL('../drizzle/0007_contact_keys.sql',import.meta.url),'utf8'));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM order_confirmations').get().count,2);
    assert.equal((await (await submit({})).json()).created,false);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM order_confirmations').get().count,2);
  } finally {db.close();}
});

test('phone duplicate, server price and campaign attribution remain correct',async()=>{
  const {db,submit,report}=fixture();
  try {
    const campaign={source:'facebook',medium:'paid_social',name:'led_pods_launch',content:'ad_a',campaignId:'campaign-1',adsetId:'set-1',adId:'ad-1'};
    assert.equal((await (await submit({phone:'03001234567',campaign,extraRemoteQuantity:1,expectedSubtotal:2098})).json()).created,true);
    assert.equal((await (await submit({visitorId:'aabbccdd-0000-4000-8000-000000000003',phone:'+92 300 1234567',email:'another@example.net'})).json()).created,false);
    const row=(await (await report()).json()).details[0];
    assert.equal(row.source,'facebook');
    assert.equal(row.medium,'paid_social');
    assert.equal(row.campaign,'led_pods_launch');
    assert.equal(row.content,'ad_a');
    assert.equal(row.adId,'ad-1');
    assert.equal(row.subtotal,2098);
  } finally {db.close();}
});

test('public readiness check is read-only and exposes no customer or key data',async()=>{
  const {db,query}=fixture();
  try {
    const r=await handleOrders(new Request(origin+'/api/health'),query,key);
    assert.equal(r.status,200);
    assert.deepEqual(await r.json(),{ready:true});
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM order_confirmations').get().count,0);
    const incomplete=await handleOrders(new Request(origin+'/api/health'),query,'');
    assert.equal(incomplete.status,503);
    assert.deepEqual(await incomplete.json(),{ready:false});
    const head=await handleOrders(new Request(origin+'/api/health',{method:'HEAD'}),query,key);
    assert.equal(head.status,200);
    assert.equal(await head.text(),'');
    const post=await handleOrders(new Request(origin+'/api/health',{method:'POST'}),query,key);
    assert.equal(post.status,405);
  } finally {db.close();}
});

test('admin access, malformed bodies and cross-origin writes are rejected',async()=>{
  const {db,query}=fixture();
  try {
    const admin=await handleOrders(new Request(origin+'/api/manage/order-confirmations'),query,key);
    assert.equal(admin.status,401);
    const foreign=await handleOrders(new Request(origin+'/api/order-confirmations',{method:'POST',headers:{Origin:'https://foreign.example','Content-Type':'application/json'},body:JSON.stringify(base)}),query,key);
    assert.equal(foreign.status,403);
    const oversized=await handleOrders(new Request(origin+'/api/order-confirmations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...base,name:'x'.repeat(9000)})}),query,key);
    assert.equal(oversized.status,400);
    const malformed=await handleOrders(new Request(origin+'/api/order-confirmations',{method:'POST',headers:{'Content-Type':'application/json'},body:'{' }),query,key);
    assert.equal(malformed.status,400);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM order_confirmations').get().count,0);
  } finally {db.close();}
});

test('new contact-key migrations match on both database platforms',()=>{
  const d1=readFileSync(new URL('../drizzle/0007_contact_keys.sql',import.meta.url),'utf8').replace('--> statement-breakpoint','').replace(/\s+/g,' ').trim();
  const pg=readFileSync(new URL('../netlify/database/migrations/0008_contact_keys.sql',import.meta.url),'utf8').replace(/\s+/g,' ').trim();
  assert.equal(d1,pg);
});
