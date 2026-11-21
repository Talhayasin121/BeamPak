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
  const until = params.get('until') || new Date().toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(until) || !Number.isFinite(Date.parse(until))) return activityResponse({error:'Choose a valid report date.'},400);
  const session = params.get('session'), after = params.get('after');
  if (session) {
    if (!activityUuid.test(session) || (after && !activityUuid.test(after))) return activityResponse({error:'Choose a valid visit.'},400);
    const filter = after ? ' AND (occurred_at,id) > (SELECT occurred_at,id FROM visitor_events WHERE id = $3)' : '';
    const rows=await query('SELECT id,name,page,details,occurred_at FROM visitor_events WHERE session_id = $1 AND received_at <= $2' + filter + ' ORDER BY occurred_at,id LIMIT 101',after ? [session,until,after] : [session,until]);
    const events=rows.slice(0,100);
    return activityResponse({until,events:events.map(row=>({id:row.id,name:row.name,page:row.page,details:JSON.parse(row.details),at:row.occurred_at})),next:rows.length > events.length ? events.at(-1).id : null});
  }
  const days=Number(params.get('days') || 7), limit=Number(params.get('limit') || 30);
  const search=activityTag(params.get('q')), source=activityTag(params.get('source'));
  const device=params.get('device') || '', stage=params.get('stage') || '', sort=params.get('sort') || 'newest';
  if (![0,1,7,30].includes(days) || !Number.isInteger(limit) || limit < 1 || limit > 200 ||
      !['','mobile','tablet','desktop','unknown'].includes(device) ||
      !['','browsing','checkout','submitted'].includes(stage) || !['newest','oldest'].includes(sort)) return activityResponse({error:'Check the search and filter settings.'},400);
  const since=days ? new Date(Date.parse(until)-days*86400000).toISOString() : '1970-01-01T00:00:00.000Z';
  const values=[since,until,until], clauses=[];
  const parameter=value=>{values.push(value);return '$'+values.length;};
  const escapeLike=value=>value.replaceAll('!','!!').replaceAll('%','!%').replaceAll('_','!_');
  if(search)clauses.push("LOWER(v.visitor_id || ' ' || v.session_id) LIKE "+parameter('%'+escapeLike(search)+'%')+" ESCAPE '!'");
  if(source)clauses.push("v.context LIKE "+parameter('%"source":'+escapeLike(JSON.stringify(source))+'%')+" ESCAPE '!'");
  if(device)clauses.push('v.context LIKE '+parameter('%"device":'+JSON.stringify(device)+'%'));
  if(stage==='submitted')clauses.push('v.submitted = 1');
  if(stage==='checkout')clauses.push('v.checkout = 1 AND v.submitted = 0');
  if(stage==='browsing')clauses.push('v.checkout = 0 AND v.submitted = 0');
  const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
  const grouped="SELECT e.session_id, MIN(e.visitor_id) AS visitor_id, MIN(e.occurred_at) AS started_at, MAX(e.occurred_at) AS last_at, COUNT(*) AS events, SUM(CASE WHEN e.name = 'page_view' THEN 1 ELSE 0 END) AS pages, MAX(CASE WHEN e.name = 'checkout_start' THEN 1 ELSE 0 END) AS checkout, MAX(CASE WHEN e.name = 'confirmation_saved' THEN 1 ELSE 0 END) AS submitted, (SELECT initial.context FROM visitor_events initial WHERE initial.session_id = e.session_id AND initial.received_at <= $3 ORDER BY initial.occurred_at,initial.id LIMIT 1) AS context FROM visitor_events e WHERE e.received_at >= $1 AND e.received_at <= $2 GROUP BY e.session_id";
  const from=' FROM ('+grouped+') v';
  const [summary]=await query('SELECT COUNT(*) AS visits, COUNT(DISTINCT visitor_id) AS visitors, COALESCE(SUM(events),0) AS events, COALESCE(SUM(pages),0) AS pages, COALESCE(SUM(checkout),0) AS checkouts, COALESCE(SUM(submitted),0) AS submitted'+from+where,values);
  const [leads]=await query('SELECT COUNT(*) AS leads FROM order_confirmations WHERE confirmed_at >= $1 AND confirmed_at <= $2',[since.slice(0,19).replace('T',' '),until.slice(0,19).replace('T',' ')]);
  const beforeTime=params.get('beforeTime'), beforeSession=params.get('beforeSession');
  if ((beforeTime || beforeSession) && (!beforeTime || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(beforeTime) || !activityUuid.test(beforeSession))) return activityResponse({error:'Choose a valid results page.'},400);
  const ascending=sort==='oldest', direction=ascending?'ASC':'DESC';
  const cursor=beforeTime?(where?' AND ':' WHERE ')+'(v.last_at,v.session_id) '+(ascending?'>':'<')+' ('+parameter(beforeTime)+','+parameter(beforeSession)+')':'';
  const rows=await query('SELECT v.*'+from+where+cursor+' ORDER BY v.last_at '+direction+',v.session_id '+direction+' LIMIT '+(limit+1),values);
  const visits=rows.slice(0,limit);
  return activityResponse({
    until,days,summary:{visitors:Number(summary.visitors),visits:Number(summary.visits),events:Number(summary.events),pages:Number(summary.pages),checkouts:Number(summary.checkouts),submitted:Number(summary.submitted),leads:Number(leads.leads)},
    visits:visits.map(row=>({id:row.session_id,visitor:row.visitor_id,startedAt:row.started_at,lastAt:row.last_at,events:Number(row.events),pages:Number(row.pages),checkout:Boolean(Number(row.checkout)),submitted:Boolean(Number(row.submitted)),context:JSON.parse(row.context)})),
    next:rows.length > visits.length ? {at:visits.at(-1).last_at,sessionId:visits.at(-1).session_id} : null
  });
}
