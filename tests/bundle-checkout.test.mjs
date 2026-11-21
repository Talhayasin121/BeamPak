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
    if(!legacy || file!=='0006_extra_remote.sql')db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
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
