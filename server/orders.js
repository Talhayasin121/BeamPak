import {catalog, freeShipping, maxOrderQuantity, shippingRate} from '../web/catalog.js';

const products = new Map(catalog.map(item => [item.id,item]));
const statuses = ['Received','Confirmed','Shipped','Delivered','Cancelled'];
const referencePattern = /^BP-[A-F0-9]{10}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (body,status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const error = (message,status=400) => json({error:message},status);
const trim = value => typeof value === 'string' ? value.trim() : '';
const validLength = (value,min,max) => value.length >= min && value.length <= max;
const normalizePhone = value => {
  const digits = trim(value).replace(/[\s()+-]/g,'').replace(/^(0092|92)/,'0');
  return /^03[0-9]{9}$/.test(digits) ? digits : '';
};
function publicOrder(row) {
  return {reference:row.reference,status:row.status,items:JSON.parse(row.items),total:row.total};
}
async function bodyJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let size = 0, text = '';
  for (;;) {
    const {done,value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) {await reader.cancel();return null;}
    text += decoder.decode(value,{stream:true});
  }
  try {
    const result = JSON.parse(text + decoder.decode());
    return result && typeof result === 'object' && !Array.isArray(result) ? result : null;
  } catch {return null;}
}
async function checkout(data,query) {
  const name = trim(data.name), city = trim(data.city), address = trim(data.address);
  const phone = normalizePhone(data.phone);
  const requestId = trim(data.requestId);
  if (!phone) return error('Enter a valid Pakistani mobile number.');
  if (!validLength(name,2,100) || !validLength(city,2,80) || !validLength(address,8,300)) return error('Enter your full name, city and delivery address.');
  if (!uuidPattern.test(requestId) || !Array.isArray(data.items) || !data.items.length || data.items.length > products.size) return error('Check the items in your bag and try again.');
  const requested = new Map();
  for (const line of data.items) {
    const id = line?.id, quantity = line?.quantity;
    if (typeof id !== 'string' || requested.has(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > maxOrderQuantity) {
      return error('Check the quantities in your bag and try again.');
    }
    requested.set(id,quantity);
  }
  async function existingOrder() {
    const [previous] = await query('SELECT * FROM orders WHERE request_id = $1',[requestId]);
    if (!previous) return null;
    const order = publicOrder(previous);
    const sameItems = order.items.length === requested.size && order.items.every(item => requested.get(item.id) === item.quantity);
    if (previous.phone !== phone || previous.name !== name || previous.city !== city || previous.address !== address || !sameItems) {
      return error('Start checkout again to submit your updated order.',409);
    }
    return json(order);
  }
  const items = [];
  for (const [id,quantity] of requested) {
    const item = products.get(id);
    if (!item?.inStock) {
      const message = item ? item.name + ' is out of stock.' : 'This product listing has changed.';
      return (await existingOrder()) ?? error(message + ' Refresh your bag before checking out.',409);
    }
    items.push({id,name:item.name,quantity,price:item.price});
  }
  const storedItems = JSON.stringify(items);
  const subtotal = items.reduce((sum,item)=>sum + item.price * item.quantity,0);
  const shipping = subtotal >= freeShipping ? 0 : shippingRate;
  const total = subtotal + shipping;
  if (data.expectedTotal !== undefined && data.expectedTotal !== total) {
    return (await existingOrder()) ?? error('The price or delivery fee has changed. Refresh the shop and review your total.',409);
  }
  const reference = 'BP-' + Array.from(crypto.getRandomValues(new Uint8Array(5)),byte=>byte.toString(16).padStart(2,'0')).join('').toUpperCase();
  const [inserted] = await query('INSERT INTO orders (reference, request_id, name, phone, city, address, items, subtotal, shipping, total) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT(request_id) DO NOTHING RETURNING reference, status, items, total',
    [reference,requestId,name,phone,city,address,storedItems,subtotal,shipping,total]);
  if (inserted) return json(publicOrder(inserted),201);
  return (await existingOrder()) ?? error('Start checkout again to submit your updated order.',409);
}
async function lookup(data,query) {
  const reference = trim(data.reference).toUpperCase(), phone = normalizePhone(data.phone);
  if (!referencePattern.test(reference) || !phone) return error('Enter the order reference and the mobile number used at checkout.');
  const [row] = await query('SELECT reference, status, items, total FROM orders WHERE reference = $1 AND phone = $2',[reference,phone]);
  return row ? json(publicOrder(row)) : error('No order matches those details.',404);
}
async function authorized(request,key) {
  if (!key || key.length < 20) return false;
  const provided = request.headers.get('Authorization') || '';
  if (!provided.startsWith('Bearer ') || provided.length > 1024) return false;
  const encoder = new TextEncoder();
  const actual = new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(provided.slice(7))));
  const expected = new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(key)));
  return actual.reduce((difference,byte,index)=>difference | (byte ^ expected[index]),0) === 0;
}
function campaignTag(value) {
  const tag = trim(value).toLowerCase();
  return /^[a-z0-9][a-z0-9_. -]{0,59}$/.test(tag) ? tag : '';
}
async function confirmOrder(data,query) {
  const item = products.get(data.productId);
  const visitor = trim(data.visitorId).toLowerCase();
  const {quantity,campaign} = data;
  const name = trim(data.name), address = trim(data.address), email = trim(data.email), providedPhone = trim(data.phone);
  const phone = providedPhone ? normalizePhone(providedPhone) : null;
  if (!item?.confirmable || !uuidPattern.test(visitor) || !Number.isInteger(quantity) || quantity < 1 || quantity > maxOrderQuantity) {
    return error('Check the selected product and quantity.');
  }
  if (!validLength(name,2,100)) return error('Enter your full name.');
  if (!validLength(address,8,300)) return error('Enter your full street address, including your city.');
  if (!validLength(email,3,254) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return error('Enter a valid email address.');
  if (providedPhone && !phone) return error('Enter a valid Pakistani mobile number or leave it blank.');
  if (data.expectedSubtotal !== item.price * quantity) return error('The price has changed. Refresh the product page and review the subtotal.',409);
  await query("INSERT INTO order_confirmations (id, visitor_id, product_id, quantity, unit_price, name, city, address, email, phone, source, medium, campaign) VALUES ($1, $2, $3, $4, $5, $6, '', $7, $8, $9, $10, $11, $12) ON CONFLICT DO NOTHING",
    [crypto.randomUUID(),visitor,item.id,quantity,item.price,name,address,email,phone,campaignTag(campaign?.source),campaignTag(campaign?.medium),campaignTag(campaign?.name)]);
  return json({saved:true});
}
async function availabilitySummary(query) {
  const [totals] = await query('SELECT COUNT(*) AS requests, COALESCE(SUM(quantity), 0) AS pieces FROM availability_requests',[]);
  const campaigns = await query('SELECT source, medium, campaign, COUNT(*) AS requests, SUM(quantity) AS pieces FROM availability_requests GROUP BY source, medium, campaign ORDER BY requests DESC, source, medium, campaign LIMIT 50',[]);
  const counts = row => ({requests:Number(row.requests),pieces:Number(row.pieces)});
  return json({...counts(totals),campaigns:campaigns.map(row=>({source:row.source,medium:row.medium,campaign:row.campaign,...counts(row)}))});
}

async function confirmationSummary(request,query) {
  const after = new URL(request.url).searchParams.get('after') || '';
  if (after && !uuidPattern.test(after)) return error('Choose a valid results page.');
  const [prior] = await query('SELECT COUNT(*) AS requests FROM availability_requests',[]);
  const [totals] = await query('SELECT COUNT(*) AS confirmations, COALESCE(SUM(quantity), 0) AS pieces FROM order_confirmations',[]);
  const campaigns = await query('SELECT source, medium, campaign, COUNT(*) AS confirmations, SUM(quantity) AS pieces FROM order_confirmations GROUP BY source, medium, campaign ORDER BY confirmations DESC, source, medium, campaign LIMIT 50',[]);
  const filter = after ? ' WHERE (confirmed_at, id) < (SELECT confirmed_at, id FROM order_confirmations WHERE id = $1)' : '';
  const rows = await query('SELECT id, product_id, quantity, unit_price, name, city, address, email, phone, source, medium, campaign, confirmed_at FROM order_confirmations' + filter + ' ORDER BY confirmed_at DESC, id DESC LIMIT 31',after ? [after] : []);
  const counts = row => ({confirmations:Number(row.confirmations),pieces:Number(row.pieces)});
  const page = rows.slice(0,30);
  return json({...counts(totals),earlierRequests:Number(prior.requests),
    campaigns:campaigns.map(row=>({source:row.source,medium:row.medium,campaign:row.campaign,...counts(row)})),
    details:page.map(({id,product_id,quantity,unit_price,name,city,address,email,phone,source,medium,campaign,confirmed_at})=>
      ({id,product:products.get(product_id)?.name ?? product_id,quantity,unitPrice:unit_price,name,city,address,email,phone,source,medium,campaign,confirmedAt:confirmed_at})),
    next:rows.length > page.length ? page.at(-1).id : null
  });
}

async function admin(request,query,adminKey,path,data,isStoreOwner) {
  if (!isStoreOwner && !(await authorized(request,adminKey))) return error('Enter the store access key.',401);
  if (path === '/api/manage/order-confirmations' && request.method === 'GET') return confirmationSummary(request,query);
  if (path === '/api/manage/interest' && request.method === 'GET') return availabilitySummary(query);
  if (path === '/api/manage/orders' && request.method === 'GET') {
    const searchParams = new URL(request.url).searchParams;
    const reference = trim(searchParams.get('reference')).toUpperCase();
    const status = trim(searchParams.get('status'));
    const after = trim(searchParams.get('after')).toUpperCase();
    if (reference && !referencePattern.test(reference)) return error('Enter a valid order reference.');
    if ((status && !statuses.includes(status)) || (after && !referencePattern.test(after))) return error('Choose a valid order filter.');
    let results;
    if (reference) {
      results = await query('SELECT * FROM orders WHERE reference = $1',[reference]);
    } else {
      const clauses = [], parameters = [];
      if (status) {
        parameters.push(status);
        clauses.push('status = $' + parameters.length);
      }
      if (after) {
        parameters.push(after);
        clauses.push('(created_at, reference) < (SELECT created_at, reference FROM orders WHERE reference = $' + parameters.length + ')');
      }
      const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
      results = await query('SELECT * FROM orders' + where + ' ORDER BY created_at DESC, reference DESC LIMIT 31',parameters);
    }
    const page = results.slice(0,30);
    return json({
      orders:page.map(row=>({...publicOrder(row),name:row.name,phone:row.phone,city:row.city,address:row.address,createdAt:row.created_at})),
      next:results.length > page.length ? page.at(-1).reference : null
    });
  }
  if (path === '/api/manage/status' && request.method === 'POST') {
    if (!data || !referencePattern.test(data.reference) || !statuses.includes(data.status)) return error('Choose a valid order and status.');
    const before = data.previousStatus;
    if (before !== undefined && !statuses.includes(before)) return error('Choose a valid order status.');
    const filter = before === undefined ? '' : ' AND status = $3';
    const params = before === undefined ? [data.status,data.reference] : [data.status,data.reference,before];
    const [result] = await query('UPDATE orders SET status = $1 WHERE reference = $2' + filter + ' RETURNING reference',params);
    if (result) return json({ok:true,status:data.status});
    const [row] = await query('SELECT status FROM orders WHERE reference = $1',[data.reference]);
    return row ? error('This order changed. Reload it before saving again.',409) : error('Order not found.',404);
  }
  return error('Page not found.',404);
}

export async function handleOrders(request, query, adminKey, isStoreOwner = false) {
  const url = new URL(request.url);
  const path = url.pathname;
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return error('Request origin is not allowed.',403);
  if (!query) return error('Order service is temporarily unavailable.',503);
  try {
    if (path.startsWith('/api/manage/')) return await admin(request,query,adminKey,path,request.method === 'POST' ? await bodyJson(request) : null,isStoreOwner);
    if (path === '/api/interest') return error('Refresh the store to use the latest checkout.',410);
    if (path !== '/api/orders' && path !== '/api/orders/lookup' && path !== '/api/order-confirmations') return error('Page not found.',404);
    if (request.method !== 'POST') return error('Method not allowed.',405);
    if (path === '/api/orders' && !catalog.some(item => item.inStock)) return error('Orders are paused. Visit the product page for current stock information.',409);
    const data = await bodyJson(request);
    if (!data) return error('Check the information you entered and try again.');
    if (path === '/api/order-confirmations') return await confirmOrder(data,query);
    return path === '/api/orders' ? await checkout(data,query) : await lookup(data,query);
  } catch (failure) {
    console.error('Order operation failed:',failure.name);
    return error('Order service is temporarily unavailable. Please try again.',503);
  }
}
