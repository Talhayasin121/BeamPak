const find=selector=>document.querySelector(selector);
const section=find('#visitor-activity');
const summary=find('#activity-summary');
const visits=find('#activity-visits');
const timeline=find('#activity-timeline');
const title=find('#activity-visit-title');
const events=find('#activity-events');
const feedback=find('#activity-feedback');
const refresh=find('#activity-refresh');
const period=find('#activity-period');
const moreVisits=find('#activity-more-visits');
const moreEvents=find('#activity-more-events');
let requester, authorized=()=>false, generation=0, detailRequest=0;
let cursor, eventCursor, selectedVisit, visitRecords=[];
const labels={
  page_view:'Page viewed',product_view:'Product viewed',product_open:'Product details opened',
  bag_view:'Shopping bag opened',add_to_bag:'Added to bag',bag_quantity:'Bag quantity changed',bag_removed:'Removed from bag',
  checkout_start:'Checkout started',checkout_error:'Checkout error',confirmation_saved:'Confirmation saved',
  confirmation_repeat:'Repeat confirmation',unavailable_seen:'Unavailable message viewed',gallery_view:'Product image viewed',
  quantity_selected:'Quantity selected',catalog_filter:'Catalog filtered',catalog_sort:'Catalog sorted',
  catalog_search:'Catalog search',whatsapp_click:'WhatsApp clicked',scroll_depth:'Page scrolled',
  page_engagement:'Visible page time',faq_open:'FAQ opened',film_open:'Film opened',
  navigation:'Section link clicked',ad_preference:'Ad preference selected'
};
const formatCount=value=>Number(value).toLocaleString('en-PK');
const count=(value,label)=>formatCount(value)+' '+label+(Number(value)===1?'':'s');
const time=value=>new Date(value).toLocaleString('en-PK',{dateStyle:'medium',timeStyle:'short'});
function describe(details) {
  const parts=[];
  if(details.productId) parts.push(details.productId==='rgb-pod'?'Multicolour LED Pod':details.productId);
  if(details.quantity!==undefined) parts.push(count(details.quantity,'piece'));
  if(details.percent!==undefined) parts.push(details.percent+'%');
  if(details.seconds!==undefined) parts.push(details.seconds+' seconds');
  if(details.index!==undefined) parts.push('Item '+(details.index+1));
  if(details.results!==undefined) parts.push(details.results+' results');
  for(const key of ['filter','sort','section','choice']) if(details[key]) parts.push(details[key]);
  return parts.join(' · ');
}
function renderVisits() {
  visits.replaceChildren(...visitRecords.map(visit=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='activity-visit';
    button.dataset.visit=visit.id;
    button.setAttribute('aria-pressed',String(selectedVisit===visit.id));
    const heading=document.createElement('strong');
    heading.textContent='Browser '+visit.visitor.slice(0,8);
    const status=document.createElement('span');
    status.textContent=visit.submitted?'Submitted':visit.checkout?'Reached checkout':'Browsing';
    const details=document.createElement('span');
    details.textContent=visit.context.device+' · '+count(visit.pages,'page view')+' · '+count(visit.events,'event');
    const date=document.createElement('span');
    date.textContent='Last activity '+time(visit.lastAt);
    const attribution=document.createElement('span');
    const campaign=visit.context.campaign;
    attribution.textContent=[campaign.source,campaign.name,campaign.content,campaign.adId?'Ad '+campaign.adId:''].filter(Boolean).join(' / ') || visit.context.referrer || 'Direct visit';
    button.append(heading,status,details,date,attribution);
    return button;
  }));
}
async function loadVisits(append=false) {
  if(!requester || !authorized()) return;
  const current=++generation;
  detailRequest++;
  refresh.disabled=true;
  moreVisits.disabled=true;
  feedback.textContent='Loading visitor activity…';
  if(!append) {
    cursor=null;
    visitRecords=[];
    selectedVisit=null;
    timeline.hidden=true;
    events.replaceChildren();
  }
  const params=new URLSearchParams({days:period.value});
  if(append && cursor) {
    params.set('beforeTime',cursor.at);
    params.set('beforeSession',cursor.sessionId);
  }
  try {
    const report=await requester('/api/manage/activity?'+params);
    if(current!==generation || !authorized()) return;
    const values=report.summary;
    summary.textContent=count(values.visitors,'browser')+' · '+count(values.visits,'visit')+' · '+count(values.pages,'page view')+' · '+count(values.checkouts,'visit')+' reached checkout · '+count(values.leads,'saved confirmation');
    visitRecords=append?visitRecords.concat(report.visits.filter(visit=>!visitRecords.some(existing=>existing.id===visit.id))):report.visits;
    cursor=report.next;
    moreVisits.hidden=!cursor;
    renderVisits();
    feedback.textContent=visitRecords.length?'Select a visit to see its activity.':'No visitor activity recorded in this period.';
  } catch {
    if(current===generation && authorized()) feedback.textContent='Could not load visitor activity. Try refreshing.';
  } finally {
    if(current===generation) {
      refresh.disabled=false;
      moreVisits.disabled=false;
    }
  }
}
async function loadTimeline(id,append=false) {
  if(!requester || !authorized()) return;
  const current=++detailRequest;
  selectedVisit=id;
  const visit=visitRecords.find(item=>item.id===id);
  title.textContent='Visit from browser '+visit.visitor.slice(0,8)+' · '+time(visit.startedAt);
  timeline.hidden=false;
  moreEvents.disabled=true;
  if(!append) {events.replaceChildren();eventCursor=null;}
  const params=new URLSearchParams({session:id});
  if(append && eventCursor)params.set('after',eventCursor);
  try {
    const report=await requester('/api/manage/activity?'+params);
    if(current!==detailRequest || !authorized())return;
    for(const event of report.events) {
      const item=document.createElement('li');
      const at=document.createElement('time');
      at.dateTime=event.at;
      at.textContent=new Date(event.at).toLocaleString('en-PK',{dateStyle:'medium',timeStyle:'medium'});
      const text=document.createElement('span');
      const detail=describe(event.details);
      text.textContent=(labels[event.name]||event.name)+' · '+event.page+(detail?' · '+detail:'');
      item.append(at,text);
      events.append(item);
    }
    eventCursor=report.next;
    moreEvents.hidden=!eventCursor;
    feedback.textContent=count(events.children.length,'event')+' shown for this visit.';
    renderVisits();
  } catch {
    if(current===detailRequest && authorized())feedback.textContent='Could not load this visit. Select it to try again.';
  } finally {
    if(current===detailRequest)moreEvents.disabled=false;
  }
}
export function loadActivity(request,isAuthorized) {
  requester=request;
  authorized=isAuthorized;
  section.hidden=false;
  return loadVisits();
}
export function resetActivity() {
  generation++;
  detailRequest++;
  requester=null;
  authorized=()=>false;
  visitRecords=[];
  cursor=null;
  eventCursor=null;
  selectedVisit=null;
  section.hidden=true;
  timeline.hidden=true;
  summary.textContent='';
  feedback.textContent='';
  visits.replaceChildren();
  events.replaceChildren();
  refresh.disabled=false;
  moreVisits.hidden=true;
  moreEvents.hidden=true;
}
refresh.addEventListener('click',()=>loadVisits());
period.addEventListener('change',()=>loadVisits());
moreVisits.addEventListener('click',()=>loadVisits(true));
moreEvents.addEventListener('click',()=>loadTimeline(selectedVisit,true));
visits.addEventListener('click',event=>{
  const visit=event.target.closest('[data-visit]')?.dataset.visit;
  if(visit)loadTimeline(visit);
});
