const trackedPages = new Set(['/','/index.html','/product.html','/products/multicolour-led-pod-kit','/products/multicolour-led-pod-kit/','/support.html']);
const enabled = trackedPages.has(location.pathname);
function storedId(storage,key) {
  let value;
  try {value=storage.getItem(key);} catch { /* Use a temporary identifier. */ }
  if (!/^[0-9a-f-]{36}$/i.test(value || '')) value=crypto.randomUUID();
  try {storage.setItem(key,value);} catch { /* Activity can still be recorded in this tab. */ }
  return value;
}
let visitorId, sessionId;
try {visitorId=storedId(localStorage,'beampak-activity-visitor');}
catch {visitorId=crypto.randomUUID();}
try {sessionId=storedId(sessionStorage,'beampak-activity-session');}
catch {sessionId=crypto.randomUUID();}

function readCampaign() {
  const params = new URLSearchParams(location.search);
  const tag = key => (params.get(key) || '').trim().toLowerCase().replace(/[<>\u0000-\u001f\u007f]/g,'').slice(0,120);
  const current = {source:tag('utm_source'),medium:tag('utm_medium'),name:tag('utm_campaign'),content:tag('utm_content'),term:tag('utm_term'),campaignId:tag('campaign_id'),adsetId:tag('adset_id'),adId:tag('ad_id')};
  try {
    if (Object.values(current).some(Boolean)) sessionStorage.setItem('beampak-campaign',JSON.stringify(current));
    else return JSON.parse(sessionStorage.getItem('beampak-campaign')) || current;
  } catch { /* Preserve tags from this page. */ }
  return current;
}
export const campaign = readCampaign();
let referrer = '';
try {referrer = document.referrer ? new URL(document.referrer).hostname : '';} catch { /* A referrer is optional. */ }
const context = {campaign,referrer,device:innerWidth < 768 ? 'mobile' : innerWidth < 1100 ? 'tablet' : 'desktop'};
const pendingKey = 'beampak-activity-pending';
let pending = [];
try {
  const saved = JSON.parse(sessionStorage.getItem(pendingKey));
  if (Array.isArray(saved)) pending = saved.slice(-80).filter(item=>item?.id && item.sessionId === sessionId);
} catch { /* Start a new queue when storage is unavailable. */ }
let timer, persistTimer, sending = false, retries = 0, lastEventAt = 0;
function persist() {
  clearTimeout(persistTimer);
  persistTimer=null;
  try {sessionStorage.setItem(pendingKey,JSON.stringify(pending));} catch { /* Keep this page's queue in memory. */ }
}
function payload(events) {
  return JSON.stringify({visitorId,sessionId,context:events[0].context,events:events.map(({context,sessionId,...event})=>event)});
}
function batches(events) {
  const groups = [];
  for (const event of events) {
    const current = groups.at(-1);
    if (!current || current.length === 8 || JSON.stringify(current[0].context) !== JSON.stringify(event.context)) groups.push([event]);
    else current.push(event);
  }
  return groups;
}
export function recordActivity(name,details = {}) {
  if (!enabled) return;
  pending.push({id:crypto.randomUUID(),sessionId,name,page:location.pathname,at:(lastEventAt=Math.max(Date.now(),lastEventAt+1)),details,context});
  pending = pending.slice(-80);
  persistTimer ||= setTimeout(persist,250);
  timer ||= setTimeout(flushActivity,4000);
}
export async function flushActivity() {
  clearTimeout(timer);
  timer = null;
  if (sending || !pending.length || !enabled) return;
  sending = true;
  const events = batches(pending)[0];
  try {
    const response = await fetch('/api/activity',{method:'POST',headers:{'Content-Type':'application/json'},body:payload(events),keepalive:true,signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('Activity service unavailable');
    const sent = new Set(events.map(event=>event.id));
    pending = pending.filter(event=>!sent.has(event.id));
    persist();
    retries = 0;
  } catch {
    retries++;
  } finally {
    sending = false;
    if (pending.length && retries < 3) timer=setTimeout(flushActivity,retries ? 15000 : 100);
  }
}
function sendOnExit() {
  recordEngagement();
  persist();
  clearTimeout(timer);
  timer = null;
  if (!enabled || !pending.length) return;
  for (const events of batches(pending)) {
    try {navigator.sendBeacon('/api/activity',new Blob([payload(events)],{type:'application/json'}));}
    catch { /* The next page can retry the persisted event IDs. */ }
  }
}
let visibleSince = document.hidden ? null : performance.now();
let activeMilliseconds = 0;
let scrollDepth = 0;
function recordEngagement() {
  if (visibleSince !== null) activeMilliseconds += performance.now() - visibleSince;
  visibleSince = null;
  const seconds = Math.min(14400,Math.floor(activeMilliseconds / 1000));
  if (seconds) {
    recordActivity('page_engagement',{seconds,percent:scrollDepth});
    activeMilliseconds = 0;
  }
}
if (enabled) {
  recordActivity('page_view');
  const product = document.querySelector('[data-item-page]')?.dataset.itemPage;
  if (product) recordActivity('product_view',{productId:product});
  window.addEventListener('pagehide',sendOnExit);
  window.addEventListener('online',()=>{retries=0;flushActivity();});
  document.addEventListener('visibilitychange',()=>{
    if (document.hidden) sendOnExit();
    else {visibleSince=performance.now();flushActivity();}
  });
  window.addEventListener('scroll',()=>{
    const height = document.documentElement.scrollHeight - innerHeight;
    const percent = height > 0 ? Math.min(100,Math.floor((scrollY / height) * 4) * 25) : 100;
    if (percent > scrollDepth) {
      scrollDepth = percent;
      recordActivity('scroll_depth',{percent});
    }
  },{passive:true});
  document.addEventListener('toggle',event=>{
    if (event.target instanceof HTMLDetailsElement && event.target.open) {
      const index = [...document.querySelectorAll('details')].indexOf(event.target);
      recordActivity('faq_open',{index});
    }
  },true);
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');
    if (link?.href.startsWith('https://wa.me/923309153823')) recordActivity('whatsapp_click');
    const preference=event.target.closest('[data-ad-choice]')?.dataset.adChoice;
    if (preference) recordActivity('ad_preference',{choice:preference});
    if (link?.origin === location.origin && link.hash) recordActivity('navigation',{section:link.hash.slice(1)});
  });
}
