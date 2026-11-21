import {downloadCsv} from './admin-data.js';

const find=selector=>document.querySelector(selector);
const section=find('#visitor-activity');
const summary=find('#activity-summary');
const visits=find('#activity-visits');
const timeline=find('#activity-timeline');
const title=find('#activity-visit-title');
const events=find('#activity-events');
const feedback=find('#activity-feedback');
const refresh=find('#activity-refresh');
const form=find('#activity-filter');
const exportButton=find('#activity-export');
const exportEventsButton=find('#activity-export-events');
const exportStatus=find('#activity-export-status');
const moreVisits=find('#activity-more-visits');
const moreEvents=find('#activity-more-events');
let requester, authorized=()=>false, generation=0, detailRequest=0;
let cursor, eventCursor, selectedVisit, visitRecords=[], filters={days:'7'}, snapshot=null, exportGeneration=0;
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
const attribution=visit=>[visit.context.campaign.source,visit.context.campaign.name,visit.context.campaign.content,visit.context.campaign.adId?'Ad '+visit.context.campaign.adId:''].filter(Boolean).join(' / ') || visit.context.referrer || 'Direct visit';
const stage=visit=>visit.submitted?'Submitted':visit.checkout?'Reached checkout':'Browsing';
function renderVisits() {
  visits.replaceChildren(...visitRecords.map(visit=>{
    const row=document.createElement('tr');
    row.setAttribute('aria-selected',String(selectedVisit===visit.id));
    for(const value of [visit.visitor.slice(0,8),visit.context.device,stage(visit),visit.pages,visit.events,time(visit.lastAt),attribution(visit)]) {
      const cell=document.createElement('td');
      cell.textContent=String(value);
      row.append(cell);
    }
    const cell=document.createElement('td'), button=document.createElement('button');
    button.type='button';
    button.className='text-button';
    button.dataset.visit=visit.id;
    button.textContent='View activity';
    cell.append(button);
    row.append(cell);
    return row;
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
    snapshot=null;
    visitRecords=[];
    selectedVisit=null;
    timeline.hidden=true;
    events.replaceChildren();
  }
  const params=new URLSearchParams(filters);
  if(append && snapshot)params.set('until',snapshot);
  if(append && cursor) {
    params.set('beforeTime',cursor.at);
    params.set('beforeSession',cursor.sessionId);
  }
  try {
    const report=await requester('/api/manage/activity?'+params);
    if(current!==generation || !authorized()) return;
    snapshot=report.until;
    const values=report.summary;
    summary.textContent=count(values.visitors,'browser')+' · '+count(values.visits,'visit')+' · '+count(values.pages,'page view')+' · '+count(values.checkouts,'visit')+' reached checkout · '+count(values.submitted,'submitted visit');
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
  title.textContent='Visit activity · '+time(visit.startedAt);
  find('#activity-visit-id').textContent='Visit '+visit.id+' · Browser '+visit.visitor;
  timeline.hidden=false;
  moreEvents.disabled=true;
  if(!append) {events.replaceChildren();eventCursor=null;}
  const params=new URLSearchParams({session:id});
  if(snapshot)params.set('until',snapshot);
  if(append && eventCursor)params.set('after',eventCursor);
  try {
    const report=await requester('/api/manage/activity?'+params);
    if(current!==detailRequest || !authorized())return;
    for(const event of report.events) {
      const row=document.createElement('tr');
      const at=new Date(event.at).toLocaleString('en-PK',{dateStyle:'medium',timeStyle:'medium'});
      for(const value of [at,labels[event.name]||event.name,event.page,describe(event.details)]) {
        const cell=document.createElement('td');
        cell.textContent=value;
        row.append(cell);
      }
      events.append(row);
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
  exportGeneration++;
  exportButton.disabled=false;
  exportEventsButton.disabled=false;
  section.hidden=false;
  return loadVisits();
}
export function resetActivity() {
  generation++;
  detailRequest++;
  exportGeneration++;
  exportButton.disabled=false;
  exportEventsButton.disabled=false;
  exportStatus.textContent='';
  form.reset();
  filters={days:'7'};
  snapshot=null;
  find('#activity-visit-id').textContent='';
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
form.addEventListener('submit',event=>{event.preventDefault();filters=Object.fromEntries(new FormData(form));loadVisits();});
find('#activity-reset').addEventListener('click',()=>{form.reset();filters={days:'7'};loadVisits();});
moreVisits.addEventListener('click',()=>loadVisits(true));
moreEvents.addEventListener('click',()=>loadTimeline(selectedVisit,true));
visits.addEventListener('click',event=>{
  const visit=event.target.closest('[data-visit]')?.dataset.visit;
  if(visit)loadTimeline(visit);
});

async function exportActivity(kind) {
  if(!requester || !authorized() || exportButton.disabled)return;
  if(kind==='events' && !selectedVisit)return;
  const current=++exportGeneration, selectedFilters={...filters}, visitId=selectedVisit;
  let until=kind==='events'?snapshot:null, next=null;
  const records=new Map();
  exportButton.disabled=true;
  exportEventsButton.disabled=true;
  exportStatus.textContent='Preparing CSV…';
  try {
    do {
      const params=new URLSearchParams(kind==='events'?{session:visitId}:{...selectedFilters,limit:'200'});
      if(until)params.set('until',until);
      if(next && kind==='events')params.set('after',next);
      if(next && kind==='visits'){params.set('beforeTime',next.at);params.set('beforeSession',next.sessionId);}
      const report=await requester('/api/manage/activity?'+params);
      if(current!==exportGeneration || !authorized())return;
      until=report.until;
      for(const record of (kind==='events'?report.events:report.visits))records.set(record.id,record);
      next=report.next;
      exportStatus.textContent=count(records.size,'row')+' prepared…';
    } while(next);
    let rows, filename;
    if(kind==='events') {
      rows=[['Event ID','Visit ID','Occurred at (UTC)','Action','Page','Details']];
      for(const record of records.values())rows.push([record.id,visitId,record.at,labels[record.name]||record.name,record.page,describe(record.details)]);
      filename='beampak-visit-'+visitId+'.csv';
    } else {
      rows=[['Visit ID','Browser ID','Device','Stage','Started at (UTC)','Last activity (UTC)','Page views','Events','Source','Medium','Campaign','Ad content','Audience','Campaign ID','Ad set ID','Ad ID','Referrer hostname']];
      for(const record of records.values()) {
        const tags=record.context.campaign;
        rows.push([record.id,record.visitor,record.context.device,stage(record),record.startedAt,record.lastAt,record.pages,record.events,tags.source,tags.medium,tags.name,tags.content,tags.term,tags.campaignId,tags.adsetId,tags.adId,record.context.referrer]);
      }
      filename='beampak-visits-'+new Date().toISOString().slice(0,10)+'.csv';
    }
    downloadCsv(filename,rows);
    exportStatus.textContent=count(records.size,'row')+' exported.';
  } catch {
    if(current===exportGeneration && authorized())exportStatus.textContent='Export failed. Please try again.';
  } finally {
    if(current===exportGeneration){exportButton.disabled=false;exportEventsButton.disabled=false;}
  }
}
exportButton.addEventListener('click',()=>exportActivity('visits'));
exportEventsButton.addEventListener('click',()=>exportActivity('events'));
