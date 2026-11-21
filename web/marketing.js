import {pixelId} from './ads-config.js';
import {catalog} from './catalog.js';

const enabled = /^\d{5,25}$/.test(pixelId);
const consentKey = 'beampak-ad-consent';
let consent = '';
try {consent = localStorage.getItem(consentKey) || '';} catch { /* Use this page's choice. */ }
let initialized = false;
let viewSent = false;
const viewedItem = catalog.find(item => item.id === document.querySelector('[data-item-page]')?.dataset.itemPage);

function send(name, data = {}) {
  if (!enabled || consent !== 'allow') return;
  try {
    if (!initialized) initialize();
    window.fbq('track',name,data);
  } catch { /* Optional measurement must not interrupt shopping. */ }
}
function sendViews() {
  if (viewSent || consent !== 'allow') return;
  send('PageView');
  if (viewedItem) trackAdEvent('ViewContent',[{id:viewedItem.id,quantity:1,price:viewedItem.price}]);
  viewSent = true;
}
function initialize() {
  initialized = true;
  if (!window.fbq) {
    const fbq = function (...args) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    };
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    window.fbq = window._fbq = fbq;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.append(script);
  }
  window.fbq('consent','grant');
  window.fbq('set','autoConfig',false,pixelId);
  window.fbq('init',pixelId);
}
export function trackAdEvent(name, lines = []) {
  if (!['ViewContent','AddToCart','InitiateCheckout','Lead','Contact'].includes(name)) return;
  const data = {content_type:'product',content_ids:lines.map(item=>item.id)};
  if (lines.length) {
    data.contents = lines.map(item=>({id:item.id,quantity:item.quantity,item_price:item.price}));
    data.num_items = lines.reduce((sum,item)=>sum + item.quantity,0);
    data.currency = 'PKR';
    if (name !== 'Lead') data.value = lines.reduce((sum,item)=>sum + item.price * item.quantity,0);
  }
  send(name,data);
}
let banner;
function showPreferences() {
  if (!enabled) return;
  banner ??= document.createElement('section');
  banner.className = 'ad-consent';
  banner.setAttribute('role','region');
  banner.setAttribute('aria-label','Ad measurement preferences');
  banner.innerHTML = '<p>Allow Meta ad measurement?</p><p>With your permission, we use Meta Pixel to measure visits and shopping actions. <a href="/support.html#advertising">Privacy details</a></p><div><button type="button" class="btn btn-primary" data-ad-choice="allow">Allow</button><button type="button" class="btn btn-ghost" data-ad-choice="decline">Decline</button></div>';
  document.body.append(banner);
  banner.hidden = false;
}
document.addEventListener('click',event => {
  const preference = event.target.closest('[data-ad-preferences]');
  if (preference) {
    showPreferences();
    banner?.querySelector('button')?.focus();
  }
  const choice = event.target.closest('[data-ad-choice]')?.dataset.adChoice;
  if (choice === 'allow' || choice === 'decline') {
    consent = choice;
    try {localStorage.setItem(consentKey,choice);} catch { /* Use this page's choice. */ }
    if (choice === 'allow') {
      if (initialized) window.fbq('consent','grant');
      sendViews();
    } else if (initialized) window.fbq('consent','revoke');
    banner.hidden = true;
  }
  const link = event.target.closest('a[href]');
  if (link?.href.startsWith('https://wa.me/923309153823')) trackAdEvent('Contact');
});
if (enabled) {
  document.querySelectorAll('[data-ad-preferences]').forEach(button=>{button.hidden=false;});
  if (consent === 'allow') sendViews();
  else if (consent !== 'decline') showPreferences();
}
