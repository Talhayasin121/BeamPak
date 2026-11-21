import {downloadCsv} from './admin-data.js';

const find=selector=>document.querySelector(selector);
const section=find('#manage-interest');
const form=find('#confirmation-filter');
const body=find('#confirmation-details');
const totals=find('#interest-totals');
const campaigns=find('#interest-campaigns');
const error=find('#confirmation-error');
const prior=find('#prior-requests');
const more=find('#more-confirmations');
const refresh=find('#refresh-interest');
const exportButton=find('#export-confirmations');
const exportStatus=find('#confirmation-export-status');
const dialog=find('#record-dialog');
let requester, authorized=()=>false, generation=0, exportGeneration=0;
let cursor=null, filters={}, records=[];

const number=value=>Number(value).toLocaleString('en-PK');
const count=(value,label)=>number(value)+' '+label+(Number(value)===1?'':'s');
const money=value=>'Rs. '+number(value);
const campaignLabel=record=>[record.source,record.campaign,record.content,record.adId?'Ad '+record.adId:''].filter(Boolean).join(' / ') || 'Untagged';
const when=value=>new Date(value.includes('T')?value:value.replace(' ','T')+'Z').toLocaleString('en-PK',{dateStyle:'medium',timeStyle:'short'});

function renderRows() {
  body.replaceChildren(...records.map(record=>{
    const row=document.createElement('tr');
    for(const value of [when(record.confirmedAt),record.name,record.email,record.phone,record.quantity,record.extraRemoteQuantity ?? 0,money(record.subtotal ?? record.quantity*record.unitPrice),campaignLabel(record)]) {
      const cell=document.createElement('td');
      cell.textContent=value ?? '—';
      row.append(cell);
    }
    const action=document.createElement('td');
    const button=document.createElement('button');
    button.className='text-button';
    button.type='button';
    button.dataset.record=record.id;
    button.textContent='View record';
    button.setAttribute('aria-label','View record for '+record.name);
    action.append(button);
    row.append(action);
    return row;
  }));
}
async function load(append=false) {
  if(!requester || !authorized() || (append && !cursor))return;
  const current=++generation;
  error.hidden=true;
  refresh.disabled=true;
  more.disabled=true;
  if(!append)totals.textContent='Loading submissions…';
  const params=new URLSearchParams(filters);
  if(append)params.set('after',cursor);
  try {
    const data=await requester('/api/manage/order-confirmations?'+params);
    if(current!==generation || !authorized())return;
    records=append?records.concat(data.details.filter(record=>!records.some(existing=>existing.id===record.id))):data.details;
    cursor=data.next;
    totals.textContent=count(data.confirmations,'matching submission')+' · '+count(data.pieces,'piece')+' · '+count(records.length,'row')+' shown';
    prior.hidden=!data.earlierRequests;
    prior.textContent=count(data.earlierRequests,'request')+' from the previous availability form.';
    campaigns.replaceChildren(...data.campaigns.map(campaign=>{
      const item=document.createElement('li');
      item.textContent=campaignLabel(campaign)+' · '+count(campaign.confirmations,'submission')+' · '+count(campaign.pieces,'piece');
      return item;
    }));
    renderRows();
    more.hidden=!cursor;
    find('#confirmation-empty').hidden=records.length>0;
  } catch(failure) {
    if(current!==generation || !authorized())return;
    error.textContent=failure.message || 'Could not load submissions. Try refreshing.';
    error.hidden=false;
    if(!append)totals.textContent='';
  } finally {
    if(current===generation){refresh.disabled=false;more.disabled=false;}
  }
}
function showRecord(id) {
  const record=records.find(item=>item.id===id);
  if(!record)return;
  find('#record-title').textContent=record.name;
  const fields=[
    ['Record ID',record.id],['Confirmed at (UTC)',record.confirmedAt],['Product',record.product],
    ['Pods',record.quantity],['Pod unit price',money(record.unitPrice)],['Pod subtotal',money(record.quantity*record.unitPrice)],
    ['Included remote',1],['Extra remotes',record.extraRemoteQuantity ?? 0],['Extra remote unit price',money(record.extraRemoteUnitPrice ?? 100)],
    ['Extra remote subtotal',money((record.extraRemoteQuantity ?? 0)*(record.extraRemoteUnitPrice ?? 100))],['Selection subtotal',money(record.subtotal ?? record.quantity*record.unitPrice)],
    ['Street address',record.address||record.city],['Email',record.email],['Mobile',record.phone],
    ['Source',record.source],['Medium',record.medium],['Campaign',record.campaign],
    ['Ad content',record.content],['Audience',record.term],['Campaign ID',record.campaignId],['Ad set ID',record.adsetId],['Ad ID',record.adId]
  ];
  const list=document.createElement('dl');
  list.className='record-fields';
  for(const [label,value]of fields) {
    const term=document.createElement('dt'), detail=document.createElement('dd');
    term.textContent=label;
    detail.textContent=String(value ?? '')||'—';
    list.append(term,detail);
  }
  find('#record-body').replaceChildren(list);
  dialog.showModal();
  find('#record-close').focus();
}
async function exportRecords() {
  if(!requester||!authorized()||exportButton.disabled)return;
  const current=++exportGeneration, selectedFilters={...filters};
  exportButton.disabled=true;
  exportStatus.textContent='Preparing CSV…';
  const data=new Map();
  let after=null;
  try {
    do {
      const params=new URLSearchParams({...selectedFilters,limit:'200'});
      if(after)params.set('after',after);
      const report=await requester('/api/manage/order-confirmations?'+params);
      if(current!==exportGeneration||!authorized())return;
      for(const record of report.details)data.set(record.id,record);
      after=report.next;
      exportStatus.textContent=count(data.size,'submission')+' prepared…';
    } while(after);
    const rows=[['Record ID','Confirmed at (UTC)','Name','Email','Mobile','Street address','Product','Pods','Pod unit price (PKR)','Pod subtotal (PKR)','Extra remotes','Extra remote unit price (PKR)','Extra remote subtotal (PKR)','Selection subtotal (PKR)','Source','Medium','Campaign','Ad content','Audience','Campaign ID','Ad set ID','Ad ID']];
    for(const record of data.values())rows.push([record.id,record.confirmedAt,record.name,record.email,record.phone,record.address||record.city,record.product,record.quantity,record.unitPrice,record.quantity*record.unitPrice,record.extraRemoteQuantity ?? 0,record.extraRemoteUnitPrice ?? 100,(record.extraRemoteQuantity ?? 0)*(record.extraRemoteUnitPrice ?? 100),record.subtotal ?? record.quantity*record.unitPrice,record.source,record.medium,record.campaign,record.content,record.term,record.campaignId,record.adsetId,record.adId]);
    downloadCsv('beampak-submissions-'+new Date().toISOString().slice(0,10)+'.csv',rows);
    exportStatus.textContent=count(data.size,'submission')+' exported.';
  } catch {
    if(current===exportGeneration && authorized())exportStatus.textContent='Export failed. Please try again.';
  } finally {
    if(current===exportGeneration)exportButton.disabled=false;
  }
}
export function loadRecords(request,isAuthorized) {
  requester=request;
  authorized=isAuthorized;
  exportGeneration++;
  exportButton.disabled=false;
  section.hidden=false;
  return load();
}
export function resetRecords() {
  generation++;
  exportGeneration++;
  requester=null;
  authorized=()=>false;
  records=[];
  filters={};
  cursor=null;
  form.reset();
  body.replaceChildren();
  campaigns.replaceChildren();
  totals.textContent='';
  exportStatus.textContent='';
  error.hidden=true;
  prior.hidden=true;
  more.hidden=true;
  more.disabled=false;
  exportButton.disabled=false;
  refresh.disabled=false;
  section.hidden=true;
  if(dialog.open)dialog.close();
  find('#record-body').replaceChildren();
  find('#record-title').textContent='';
}
form.addEventListener('submit',event=>{
  event.preventDefault();
  filters=Object.fromEntries(new FormData(form));
  cursor=null;
  load();
});
find('#confirmation-reset').addEventListener('click',()=>{form.reset();filters={};cursor=null;load();});
refresh.addEventListener('click',()=>load());
more.addEventListener('click',()=>load(true));
exportButton.addEventListener('click',exportRecords);
body.addEventListener('click',event=>{
  const id=event.target.closest('[data-record]')?.dataset.record;
  if(id)showRecord(id);
});
find('#record-close').addEventListener('click',()=>dialog.close());
