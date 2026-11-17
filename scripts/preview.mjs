import http from 'node:http';
import {Readable} from 'node:stream';
import {mkdirSync,readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import app from '../dist/server/index.js';

mkdirSync('outputs',{recursive:true});
const database = new DatabaseSync('outputs/preview.sqlite');
if (!database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'").get()) {
  database.exec(readFileSync('drizzle/0000_orders.sql','utf8'));
}
if (!database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='availability_requests'").get()) {
  database.exec(readFileSync('drizzle/0001_availability_requests.sql','utf8'));
}
if (!database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='order_confirmations'").get()) {
  database.exec(readFileSync('drizzle/0002_order_confirmations.sql','utf8'));
}
if (!database.prepare("SELECT name FROM pragma_table_info('order_confirmations') WHERE name = 'email'").get()) {
  database.exec('BEGIN;\n' + readFileSync('drizzle/0003_checkout_contact.sql','utf8') + '\nCOMMIT;');
}
const DB = {
  prepare(sql) {
    const statement = database.prepare(sql);
    return {bind(...parameters) {return {first:async()=>statement.get(...parameters),all:async()=>({results:statement.all(...parameters)})};}};
  }
};
const port = Number(process.env.BEAMPAK_PORT || 4173);
const origin = 'http://127.0.0.1:' + port;
http.createServer(async (incoming,outgoing) => {
  try {
    const init = {method:incoming.method,headers:incoming.headers};
    if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
      init.body = Readable.toWeb(incoming);
      init.duplex = 'half';
    }
    const result = await app.fetch(new Request(origin + incoming.url,init),{DB,BEAMPAK_ADMIN_KEY:process.env.BEAMPAK_ADMIN_KEY});
    outgoing.writeHead(result.status,Object.fromEntries(result.headers));
    if (result.body) Readable.fromWeb(result.body).pipe(outgoing);
    else outgoing.end();
  } catch {
    outgoing.writeHead(500).end();
  }
}).listen(port,'127.0.0.1',()=>console.log('Local: ' + origin));