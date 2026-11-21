import {catalog,maxOrderQuantity} from '../web/catalog.js';

const activityEventNames = new Set(['page_view','product_view','product_open','bag_view','add_to_bag','bag_quantity','bag_removed','checkout_start','checkout_error','confirmation_saved','confirmation_repeat','unavailable_seen','gallery_view','quantity_selected','catalog_filter','catalog_sort','catalog_search','whatsapp_click','scroll_depth','page_engagement','faq_open','film_open','navigation','ad_preference']);
const activityPages = new Set(['/','/index.html','/product.html','/products/multicolour-led-pod-kit','/products/multicolour-led-pod-kit/','/support.html']);
const activityUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activityResponse = (data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function activityTag(value) {
  return typeof value === 'string' ? value.toLowerCase().trim().replace(/[<>\u0000-\u001f\u007f]/g,'').slice(0,120) : '';
}
function activityContext(data) {
  const campaign = {};
  for (const key of ['source','medium','name','content','term','campaignId','adsetId','adId']) campaign[key]=activityTag(data?.campaign?.[key]);
  const device = ['mobile','tablet','desktop'].includes(data?.device) ? data.device : 'unknown';
  const referrer = typeof data?.referrer === 'string' && /^[a-z0-9.-]{1,253}$/i.test(data.referrer) ? data.referrer.toLowerCase() : '';
  return {campaign,device,referrer};
}
function activityDetails(data) {
  const details = {};
  if (catalog.some(item=>item.id === data?.productId)) details.productId=data.productId;
  for (const [key,max] of Object.entries({quantity:maxOrderQuantity,percent:100,seconds:14400,index:30,results:catalog.length})) {
    if (Number.isInteger(data?.[key]) && data[key] >= 0 && data[key] <= max) details[key]=data[key];
  }
  for (const [key,choices] of Object.entries({
    filter:['all','car','bike','lights'],
    sort:['featured','low','high','name'],
    choice:['allow','decline'],
    section:['shop','after-dark','collections','in-use','specifications','product-faq','privacy','advertising','delivery','order-help']
  })) {
    if (choices.includes(data?.[key])) details[key]=data[key];
  }
  return details;
}
export async function recordActivityBatch(data,query) {
  if (!activityUuid.test(data.visitorId) || !activityUuid.test(data.sessionId) || !Array.isArray(data.events) || !data.events.length || data.events.length > 8) {
    return activityResponse({error:'Check the activity batch.'},400);
  }
  const metadata = JSON.stringify(activityContext(data.context));
  const now = new Date().toISOString();
  const values = [], placeholders = [];
  for (const event of data.events) {
    if (!event || !activityUuid.test(event.id) || !activityEventNames.has(event.name) || !activityPages.has(event.page)) return activityResponse({error:'Check the activity event.'},400);
    const timestamp = Number.isFinite(event.at) && Math.abs(Date.now()-event.at) < 86400000 ? new Date(event.at).toISOString() : now;
    const row = [event.id,data.visitorId,data.sessionId,event.page,event.name,JSON.stringify(activityDetails(event.details)),metadata,timestamp,now];
    placeholders.push('(' + row.map(value=>{values.push(value);return '$'+values.length;}).join(',') + ')');
  }
  await query('INSERT INTO visitor_events (id,visitor_id,session_id,page,name,details,context,occurred_at,received_at) VALUES ' + placeholders.join(',') + ' ON CONFLICT(id) DO NOTHING',values);
  return activityResponse({saved:true});
}
export async function getActivityReport(request,query) {
  const params = new URL(request.url).searchParams;
  const session = params.get('session');
  const after = params.get('after');
  if (session) {
    if (!activityUuid.test(session) || (after && !activityUuid.test(after))) return activityResponse({error:'Choose a valid visit.'},400);
    const filter = after ? ' AND (occurred_at,id) > (SELECT occurred_at,id FROM visitor_events WHERE id = $2)' : '';
    const rows=await query('SELECT id,name,page,details,occurred_at FROM visitor_events WHERE session_id = $1' + filter + ' ORDER BY occurred_at,id LIMIT 101',after ? [session,after] : [session]);
    const events=rows.slice(0,100);
    return activityResponse({events:events.map(row=>({id:row.id,name:row.name,page:row.page,details:JSON.parse(row.details),at:row.occurred_at})),next:rows.length > events.length ? events.at(-1).id : null});
  }
  const days=Number(params.get('days') || 7);
  if (![0,1,7,30].includes(days)) return activityResponse({error:'Choose a valid activity period.'},400);
  const since=days ? new Date(Date.now()-days*86400000).toISOString() : '1970-01-01T00:00:00.000Z';
  const [summary]=await query("SELECT COUNT(*) AS events, COUNT(DISTINCT visitor_id) AS visitors, COUNT(DISTINCT session_id) AS visits, COALESCE(SUM(CASE WHEN name = 'page_view' THEN 1 ELSE 0 END),0) AS pages, COUNT(DISTINCT CASE WHEN name = 'checkout_start' THEN session_id END) AS checkouts FROM visitor_events WHERE received_at >= $1",[since]);
  const [leads]=await query('SELECT COUNT(*) AS leads FROM order_confirmations WHERE confirmed_at >= $1',[since.slice(0,19).replace('T',' ')]);
  const beforeTime=params.get('beforeTime'), beforeSession=params.get('beforeSession');
  if ((beforeTime || beforeSession) && (!beforeTime || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(beforeTime) || !activityUuid.test(beforeSession))) return activityResponse({error:'Choose a valid results page.'},400);
  const having = beforeTime ? ' HAVING (MAX(e.occurred_at),e.session_id) < ($2,$3)' : '';
  const rows=await query("SELECT e.session_id, MIN(e.visitor_id) AS visitor_id, MIN(e.occurred_at) AS started_at, MAX(e.occurred_at) AS last_at, COUNT(*) AS events, SUM(CASE WHEN e.name = 'page_view' THEN 1 ELSE 0 END) AS pages, MAX(CASE WHEN e.name = 'checkout_start' THEN 1 ELSE 0 END) AS checkout, MAX(CASE WHEN e.name = 'confirmation_saved' THEN 1 ELSE 0 END) AS submitted, (SELECT initial.context FROM visitor_events initial WHERE initial.session_id = e.session_id ORDER BY initial.occurred_at,initial.id LIMIT 1) AS context FROM visitor_events e WHERE e.received_at >= $1 GROUP BY e.session_id" + having + ' ORDER BY last_at DESC,e.session_id DESC LIMIT 31',beforeTime ? [since,beforeTime,beforeSession] : [since]);
  const visits=rows.slice(0,30);
  return activityResponse({
    days,summary:{visitors:Number(summary.visitors),visits:Number(summary.visits),events:Number(summary.events),pages:Number(summary.pages),checkouts:Number(summary.checkouts),leads:Number(leads.leads)},
    visits:visits.map(row=>({id:row.session_id,visitor:row.visitor_id,startedAt:row.started_at,lastAt:row.last_at,events:Number(row.events),pages:Number(row.pages),checkout:Boolean(Number(row.checkout)),submitted:Boolean(Number(row.submitted)),context:JSON.parse(row.context)})),
    next:rows.length > visits.length ? {at:visits.at(-1).last_at,sessionId:visits.at(-1).session_id} : null
  });
}
