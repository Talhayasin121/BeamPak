import {pixelId} from './ads-config.js';
import {catalog} from './catalog.js';
import './activity.js';

const enabled = /^\d{5,25}$/.test(pixelId);
const consentKey = 'beampak-ad-consent';
let consent = '';
try {consent = localStorage.getItem(consentKey) || '';} catch { /* Use this page's choice. */ }
let initialized = false;
let viewSent = false;
const viewedItem = catalog.find(item => item.id === document.querySelector('[data-item-page]')?.dataset.itemPage);

function send(name, data = {}) {
  if (!enabled || consent === 'decline') return;
  try {
    if (!initialized) initialize();
    window.fbq('track',name,data);
  } catch { /* Optional measurement must not interrupt shopping. */ }
}
function sendViews() {
  if (viewSent || consent === 'decline') return;
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
function updatePreferences() {
  document.querySelectorAll('[data-ad-preferences]').forEach(button => {
    button.hidden = !enabled;
    button.textContent = consent === 'decline' ? 'Enable ad measurement' : 'Stop ad measurement';
    button.setAttribute('aria-pressed', String(consent !== 'decline'));
  });
}
document.addEventListener('click',event => {
  if (event.target.closest('[data-ad-preferences]')) {
    consent = consent === 'decline' ? 'allow' : 'decline';
    try {localStorage.setItem(consentKey,consent);} catch { /* Keep the choice for this page. */ }
    if (initialized) window.fbq('consent',consent === 'decline' ? 'revoke' : 'grant');
    if (consent !== 'decline') sendViews();
    updatePreferences();
  }
  const link = event.target.closest('a[href]');
  if (link?.href.startsWith('https://wa.me/923309153823')) trackAdEvent('Contact');
});
updatePreferences();
if (enabled) sendViews();
