import {catalog, maxOrderQuantity} from './catalog.js';
import {trackAdEvent} from './marketing.js';
import {campaign,recordActivity} from './activity.js';

const icons = {
  chat:'<path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.6L4 20l1-3.8a8.5 8.5 0 1 1 15.5-4.7Z"/><path d="M9.1 8.1c-.4.3-.6.8-.5 1.4.3 2.2 2.6 4.4 4.9 4.8.6.1 1.1-.1 1.4-.5l.4-.6-2.2-1.1-.6.7c-1.1-.4-1.9-1.3-2.3-2.3l.7-.6-1.1-2.2-.7.4Z"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  bag:'<path d="M5 7h14l1 14H4L5 7Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  play:'<path d="m9 5 11 7-11 7V5Z"/>',
  truck:'<path d="M3 5h12v12H3zM15 9h4l3 4v4h-7"/><circle cx="7.5" cy="18" r="2"/><circle cx="18.5" cy="18" r="2"/>',
  wallet:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18m-5 5h2"/>',
  bolt:'<path d="m13 2-8 12h6l-1 8 9-12h-6l1-8Z"/>',
  headphones:'<path d="M3 14v-2a9 9 0 0 1 18 0v2M3 13h3v6H3zm15 0h3v6h-3z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>'
};
const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true">' + icons[name] + '</svg>';
const initIcons = (element = document) => element.querySelectorAll('[data-icon]').forEach(node => {node.innerHTML = icon(node.dataset.icon);});
const find = selector => document.querySelector(selector);
const panel = find('#panel');
const catalogGrid = find('#products');
const itemPage = find('[data-item-page]');
const money = amount => 'Rs. ' + amount.toLocaleString('en-PK');
const unitPrice = item => money(item.price) + (item.unit ? ' / ' + item.unit : '');
const products = new Map(catalog.map(item => [item.id, item]));
const escapes = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const safe = value => String(value).replace(/[&<>"']/g, character => escapes[character]);
const state = {filter:'all', search:'', sort:'featured', availableOnly:false, cart:{}, screen:'', opener:null, submittingConfirmation:false, itemQuantity:1};
const confirmedProducts = new Set();
function isConfirmed(id) {
  try {return confirmedProducts.has(id) || localStorage.getItem("beampak-confirmed:" + id) === "1";}
  catch {return confirmedProducts.has(id);}
}
function rememberConfirmation(id) {
  confirmedProducts.add(id);
  try {localStorage.setItem("beampak-confirmed:" + id,"1");} catch { /* Keep the confirmation in this tab. */ }
}
try {
  const saved = JSON.parse(localStorage.getItem('beampak-bag')) || {};
  for (const [id, quantity] of Object.entries(saved)) {
    if (products.get(id)?.confirmable && !isConfirmed(id) && Number.isInteger(quantity) && quantity > 0 && quantity <= maxOrderQuantity) state.cart[id] = quantity;
  }
} catch { /* Shopping remains available when browser storage is disabled. */ }
const slides = [
  {image:'hero.jpg', alt:'Modified sports coupe with purple underglow at night', caption:''},
  {image:'hero-civic-2025.jpg', alt:'Modified red 2025 Honda Civic RS after dark near Badshahi Mosque', caption:'2025 Honda Civic RS · Lahore'},
  {image:'hero-grande-2025.jpg', alt:'Modified graphite 2025 Toyota Corolla Altis X Grande at night near Minar-e-Pakistan', caption:'2025 Corolla Altis X Grande · Lahore'}
];
function showSlide(index) {
  const slide = slides[index];
  if (!slide) return;
  const hero = find('.hero');
  const image = hero.querySelector('.hero-image');
  hero.dataset.scene = index;
  image.src = '/media/' + slide.image;
  image.alt = slide.alt;
  find('#hero-scene').textContent = slide.caption;
  hero.querySelectorAll('[data-slide]').forEach(button => {
    button.setAttribute('aria-current', String(Number(button.dataset.slide) === index));
  });
}
function matchesQuery(item, query) {
  const searchable = [item.name,item.category,item.badge,item.detail,...item.specs].join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).every(term => searchable.includes(term));
}
function renderCatalog() {
  if (!catalogGrid) return;
  const filtered = catalog.filter(item => (state.filter === 'all' || item.filters.includes(state.filter)) &&
    (!state.availableOnly || item.confirmable) && matchesQuery(item, state.search));
  const sorts = {low:(a,b)=>a.price-b.price, high:(a,b)=>b.price-a.price, name:(a,b)=>a.name.localeCompare(b.name)};
  if (sorts[state.sort]) filtered.sort(sorts[state.sort]);
  document.querySelectorAll('.filters button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter)));
  document.querySelectorAll('.nav a').forEach(link => link.classList.toggle('nav-active',link.dataset.filter === state.filter));
  find('#stock-only').checked = state.availableOnly;
  find('#catalog-count').textContent = filtered.length + (filtered.length === 1 ? ' product' : ' products');
  const summary = find('#search-summary');
  summary.hidden = !state.search;
  summary.innerHTML = state.search ? 'Results for “' + safe(state.search) + '” · ' + filtered.length + ' <button data-action="clear-search" class="text-button">Clear search</button>' : '';
  catalogGrid.innerHTML = filtered.length ? filtered.map(item => {
    const colors = item.swatches.map(color => '<i style="background:' + color + '"></i>').join('');
    const availability = item.confirmable ? 'Stock pending' : 'Out of stock';
    const badge = '<span class="product-badge ' + (item.confirmable ? 'stock-available' : 'stock-unavailable') + '">' + availability + '</span>';
    const addButton = item.confirmable ? '<button class="add" data-add="' + item.id + '" data-open-bag aria-label="Add ' + item.name + ' to bag">' + icon('plus') + ' Add</button>' : '';
    const old = item.old ? ' <del>' + money(item.old) + '</del>' : '';
    const productLink = (className, content, label = item.name) => item.page
      ? '<a class="' + className + '" href="' + item.page + '" aria-label="View ' + label + '">' + content + '</a>'
      : '<button class="' + className + '" data-product="' + item.id + '" aria-label="View ' + label + '">' + content + '</button>';
    const media = productLink('product-media', '<img src="/media/' + item.image + '" width="512" height="512" loading="lazy" alt="">' + badge,item.name + ' · ' + availability);
    return '<article class="product">' + media +
      '<div class="product-body"><div class="product-meta"><span>' + item.category + '</span><span class="swatches" aria-hidden="true">' + colors + '</span></div><h3 class="product-title">' +
      productLink('text-button', item.name) + '</h3><div class="product-end"><span class="price">' + unitPrice(item) + old + '</span>' + addButton + '</div></div></article>';
  }).join('') : '<div class="no-results"><p>No products match your filters.</p><button class="btn btn-ghost" data-action="reset">Clear filters</button></div>';
}
function persistCart() {
  try { localStorage.setItem('beampak-bag', JSON.stringify(state.cart)); } catch { /* Cart stays in memory. */ }
  const count = Object.values(state.cart).reduce((sum, quantity) => sum + quantity, 0);
  find('#bag-count').textContent = count;
  find('.bag-btn').setAttribute('aria-label','Open shopping bag, ' + count + (count === 1 ? ' item' : ' items'));
}
function setQuantity(id, quantity) {
  if (quantity < 1) delete state.cart[id];
  else state.cart[id] = quantity;
  persistCart();
}
let toastTimer;
function notify(message) {
  const toast = find('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2300);
}
function openPanel(screen, title, contents, className = '') {
  if (!panel.open) state.opener = document.activeElement;
  state.screen = screen;
  panel.className = 'panel ' + className;
  panel.innerHTML = '<div class="panel-head"><h2 id="panel-title">' + title + '</h2><button class="icon-btn" data-action="close" aria-label="Close">' + icon('close') + '</button></div><div class="panel-body">' + contents + '</div>';
  if (!panel.open) panel.showModal();
  panel.scrollTop = 0;
  (panel.querySelector('[data-autofocus]') || panel.querySelector('[data-action="close"]')).focus();
}
panel.addEventListener('close', () => {
  panel.querySelector('video')?.pause();
  state.screen = '';
  state.opener?.focus({preventScroll:true});
});
panel.addEventListener('click', event => {if (event.target === panel && !state.submittingConfirmation) panel.close();});
panel.addEventListener('cancel', event => {if (state.submittingConfirmation) event.preventDefault();});
function cartSubtotal() {
  return Object.entries(state.cart).reduce((sum, [id, quantity]) => sum + products.get(id).price * quantity, 0);
}
function totals() {
  return '<div class="totals"><p><span>Product subtotal</span><span>' + money(cartSubtotal()) + '</span></p></div>';
}
function showCart(focusSelector) {
  recordActivity('bag_view');
  const entries = Object.entries(state.cart);
  const lines = entries.map(([id, quantity]) => {
    const item = products.get(id);
    return '<div class="cart-row"><img src="/media/' + item.image + '" alt=""><div><h3>' + item.name + '</h3><div class="stepper"><button data-qty="' + id + '" data-step="-1" aria-label="Decrease quantity of ' + item.name + '">−</button><span>' + quantity + '</span><button data-qty="' + id + '" data-step="1" aria-label="Increase quantity of ' + item.name + '">+</button><button class="remove" data-qty="' + id + '" data-step="0">Remove</button></div></div><span class="price">' + money(item.price * quantity) + '</span></div>';
  }).join('');
  const contents = entries.length ? lines + totals() + '<p>Stock and delivery dates are pending confirmation.</p><button class="btn btn-primary wide-button" data-action="checkout">Continue to checkout ' + icon('arrow') + '</button>'
    : '<p>Your shopping bag is empty.</p><button class="btn btn-primary" data-action="continue">Browse the shop</button>';
  openPanel('cart', 'YOUR BAG', contents, 'drawer');
  if (focusSelector) panel.querySelector(focusSelector)?.focus();
}
function showProduct(id) {
  recordActivity('product_open',{productId:id});
  const item = products.get(id);
  const purchase = item.confirmable
    ? '<p class="detail-stock stock-available">Stock pending</p><button class="btn btn-primary" data-add="' + id + '">Add to bag ' + icon('bag') + '</button>'
    : '<p class="detail-stock stock-unavailable">Out of stock</p>';
  openPanel('product', item.name, '<div class="product-detail"><img src="/media/' + item.image + '" alt="' + item.name + '"><div><p class="eyebrow">' + item.category + '</p><p class="price">' + money(item.price) + '</p><p>' + item.detail + '</p><ul>' + item.specs.map(spec => '<li>' + spec + '</li>').join('') + '</ul>' + purchase + '</div></div>', 'wide');
}
const phoneField = '<label>Mobile number<input name="phone" type="tel" autocomplete="tel" placeholder="03XX XXXXXXX" required maxlength="24"></label>';
function showUnavailable() {
  recordActivity('unavailable_seen');
  openPanel('result','CURRENTLY UNAVAILABLE','<p>Thanks for choosing Beampak. This item is currently unavailable. We’ve saved your selection, so there’s no need to submit again. You won’t be charged.</p><button class="btn btn-primary" data-action="continue">Continue browsing</button>');
}
function showCheckout() {
  const entries = Object.entries(state.cart);
  if (!entries.length) return showCart();
  if (entries.some(([id])=>isConfirmed(id))) return showUnavailable();
  recordActivity('checkout_start');
  trackAdEvent('InitiateCheckout',entries.map(([id,quantity])=>({id,quantity,price:products.get(id).price})));
  const items = entries.map(([id,quantity]) => '<li>' + products.get(id).name + ' × ' + quantity + '</li>').join('');
  openPanel('checkout','REVIEW YOUR ORDER','<form id="confirmation-form" class="stack"><ul>' + items + '</ul>' + totals() +
    '<label>Full name<input name="name" autocomplete="name" minlength="2" maxlength="100" required></label><label>Street address<textarea name="address" autocomplete="street-address" minlength="8" maxlength="300" rows="3" placeholder="House or building, street, and city" required></textarea></label><label>Email address<input name="email" type="email" autocomplete="email" maxlength="254" required></label>' +
    '<label>Mobile number (optional)<input name="phone" type="tel" autocomplete="tel" placeholder="03XX XXXXXXX" maxlength="24"></label>' +
    '<p class="checkout-note">We’ll save the details you enter and your selected quantity to understand demand. Stock is pending. No shipment or payment is arranged when you confirm. <a href="/support.html#privacy" target="_blank" rel="noopener">How we use your data</a></p>' +
    '<p class="form-error" role="alert" hidden></p><button type="submit" class="btn btn-primary wide-button">Confirm order</button><button type="button" class="text-button" data-action="cart">Back to bag</button></form>','drawer');
}
function showTrack() {
  openPanel('track','TRACK AN ORDER','<form id="track-form" class="stack"><label>Order reference<input name="reference" placeholder="BP-XXXXXXXXXX" required maxlength="15" data-autofocus></label>' + phoneField + '<p class="form-error" role="alert" hidden></p><button class="btn btn-primary" type="submit">Find order</button></form>');
}
function showResult(order) {
  const reference = safe(order.reference);
  const status = safe(order.status);
  const support = 'https://wa.me/923309153823?text=' + encodeURIComponent('Hello Beampak, I have a question about order ' + order.reference + '.');
  const items = order.items.map(item => '<li>' + safe(item.name) + ' × ' + Number(item.quantity) + '</li>').join('');
  openPanel('result', 'ORDER DETAILS', '<p class="order-ref">' + reference + '</p><p>Status <strong>' + status + '</strong></p><ul>' + items + '</ul><p><strong>' + money(order.total) + '</strong> · Cash on delivery</p>' + '<div class="receipt-actions"><button class="btn btn-ghost" data-action="copy-reference">Copy reference</button><a class="btn btn-ghost" href="' + support + '" target="_blank" rel="noopener noreferrer">WhatsApp support</a></div><p class="receipt-feedback" role="status"></p><button class="btn btn-primary" data-action="continue">Continue shopping</button>');
}
const gallery = [
  {quantity:true},
  {image:'led-pod-civic-detail.jpg',alt:'Purple LED pod illuminating a car footwell',caption:'Car footwell · installation illustration'},
  {image:'led-pod-bike-detail.jpg',alt:'Blue LED pod illuminating a motorcycle side panel',caption:'Motorcycle · installation illustration'},
  {image:'rgb-pods.jpg',alt:'Original two-pod reference kit with remote, charging cable and mounts',caption:'Original two-pod kit · accessory reference'}
];
function renderQuantityPreview() {
  const container=find('#quantity-preview');
  const quantity=state.itemQuantity;
  const valid=Number.isInteger(quantity) && quantity > 0 && quantity <= maxOrderQuantity;
  container.replaceChildren();
  if(valid) {
    const columns=quantity<=2?quantity:quantity<=4?2:quantity<=9?3:4;
    container.style.setProperty('--pod-columns',columns);
    container.dataset.count=quantity;
    container.setAttribute('aria-label',quantity+' multicolour LED '+(quantity===1?'pod':'pods'));
    const pods=Array.from({length:quantity},()=>{
      const image=document.createElement('img');
      image.src='/media/rgb-pod-single.png';
      image.alt='';
      image.width=1536;
      image.height=1024;
      image.decoding='async';
      return image;
    });
    container.append(...pods);
    find('#gallery-caption').textContent=quantity+' LED '+(quantity===1?'pod':'pods')+' · quantity illustration';
  } else {
    delete container.dataset.count;
    container.style.removeProperty('--pod-columns');
    container.setAttribute('aria-label','Choose a valid quantity to preview the pods');
    container.textContent='Enter a whole number from 1 to '+maxOrderQuantity+' to preview your pods.';
    find('#gallery-caption').textContent='Quantity preview';
  }
}
function showGallery(index) {
  const photo=gallery[index];
  if(!photo)return;
  const image=find('#gallery-image');
  find('#quantity-preview').hidden=!photo.quantity;
  image.hidden=Boolean(photo.quantity);
  if(photo.quantity)renderQuantityPreview();
  else {
    image.src='/media/'+photo.image;
    image.alt=photo.alt;
    find('#gallery-caption').textContent=photo.caption;
  }
  document.querySelectorAll('[data-gallery]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.gallery)===index)));
}
function renderItemQuantity() {
  const input = find('#item-quantity');
  const quantity = input.validity.valid ? input.valueAsNumber : null;
  state.itemQuantity = quantity;
  input.setAttribute('aria-invalid', String(quantity === null));
  const item = products.get(itemPage.dataset.itemPage);
  showGallery(0);
  const amount = quantity === null ? '—' : money(item.price * quantity);
  document.querySelectorAll('[data-item-subtotal]').forEach(total => {total.textContent = amount;});
  document.querySelectorAll('[data-piece-count]').forEach(button => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.pieceCount) === quantity));
  });
  document.querySelectorAll('[data-purchase] [data-add], [data-mobile-purchase] [data-add]').forEach(button => {
    button.disabled = quantity === null;
  });
}
function showSearch() {
  openPanel('search','SEARCH BEAMPAK','<form id="search-form" class="stack" role="search"><label>Search products<input type="search" name="query" value="' + safe(state.search) + '" placeholder="Try LED pod, indicators or grips" maxlength="80" data-autofocus></label><button type="submit" class="btn btn-primary">See catalog results</button></form><div class="search-results" aria-live="polite"></div>');
  updateSearchResults(state.search);
}
function updateSearchResults(query) {
  const matches = catalog.filter(item => matchesQuery(item,query.trim())).slice(0,5);
  panel.querySelector('.search-results').innerHTML = matches.length ? matches.map(item => {
    const attributes = item.page ? '<a href="' + item.page + '"' : '<button type="button" data-product="' + item.id + '"';
    const endTag = item.page ? '</a>' : '</button>';
    return attributes + ' class="search-result"><img src="/media/' + item.image + '" alt=""><span><strong>' + item.name + '</strong><small>' + unitPrice(item) + ' · ' + (item.confirmable ? 'Stock pending' : 'Out of stock') + '</small></span>' + endTag;
  }).join('') : '<p>No matching products.</p>';
}
function toggleMenu(open) {
  find('.nav').classList.toggle('open', open);
  find('.mobile-toggle').setAttribute('aria-expanded', String(open));
  find('.mobile-toggle').setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
}
const filmPage = 'https://www.pexels.com/video/sleek-sports-car-in-dimly-lit-garage-29498826/';
const actions = {
  search:showSearch,
  cart:()=>showCart(),
  close:()=>panel.close(),
  menu:()=>toggleMenu(!find('.nav').classList.contains('open')),
  film:()=>{recordActivity('film_open');return openPanel('film','AFTER DARK','<div class="film"><video controls playsinline preload="none" poster="/media/hero.jpg" src="https://videos.pexels.com/video-files/29498826/12698158_4070_2160_24fps.mp4"></video><p><a href="' + filmPage + '" target="_blank" rel="noopener">Watch on Pexels · Michael Pronin</a></p></div>','wide');},
  checkout:showCheckout,
  'copy-reference':async()=>{
    const feedback = panel.querySelector('.receipt-feedback');
    try {
      await navigator.clipboard.writeText(panel.querySelector('.order-ref').textContent);
      feedback.textContent = 'Reference copied.';
    } catch {
      feedback.textContent = 'Select and copy the reference shown above.';
    }
  },
  track:showTrack,
  continue:()=>{
    panel.close();
    const shop = find('#shop');
    if (shop) shop.scrollIntoView();
    else location.assign('/#shop');
  },
  'clear-search':()=>{state.search='';renderCatalog();},
  reset:()=>{state.search='';state.filter='all';state.availableOnly=false;renderCatalog();},
  help:()=>location.assign('/support.html'),
  credits:()=>openPanel('credits','PHOTO & FILM CREDITS','<p><a href="https://unsplash.com/photos/black-porsche-911-parked-in-garage-uH38ppzawSw" target="_blank" rel="noopener">Garage photography by Patrik Storm</a> on Unsplash.</p><p><a href="https://unsplash.com/photos/red-and-black-sports-bike-on-road-during-nighttime-X8ZAvIL-PjM" target="_blank" rel="noopener">Motorcycle photography by Valery Sysoev</a> on Unsplash.</p><p><a href="' + filmPage + '" target="_blank" rel="noopener">Film by Michael Pronin</a> on Pexels.</p><p>The After Dark hero scenes and LED pod installation examples are AI-generated illustrations. The kit pack shot was edited from a supplied product photo.</p>')
};
document.addEventListener('click', event => {
  const control = event.target.closest('[data-action],[data-filter],[data-product],[data-add],[data-qty],[data-slide],[data-gallery],[data-piece-count]');
  if (!control || state.submittingConfirmation) return;
  const {action,filter,product,add,qty,step,slide,gallery,pieceCount} = control.dataset;
  if (action) actions[action]?.();
  else if (filter) {
    recordActivity('catalog_filter',{filter});
    state.filter = filter;
    state.search = '';
    renderCatalog();
    toggleMenu(false);
  } else if (product) showProduct(product);
  else if (add) {
    if (!products.get(add)?.confirmable) return;
    if (isConfirmed(add)) return showUnavailable();
    const amount = control.closest('[data-purchase],[data-mobile-purchase]') ? state.itemQuantity : 1;
    if (amount === null) return;
    const quantity = (state.cart[add] || 0) + amount;
    if (quantity > maxOrderQuantity) return notify('Maximum ' + maxOrderQuantity + ' per product');
    setQuantity(add, quantity);
    recordActivity('add_to_bag',{productId:add,quantity:amount});
    trackAdEvent('AddToCart',[{id:add,quantity:amount,price:products.get(add).price}]);
    if (panel.open || control.hasAttribute('data-open-bag')) showCart();
    else notify(products.get(add).name + ' added to bag');
  } else if (qty) {
    const current = state.cart[qty];
    const next = Number(step) ? current + Number(step) : 0;
    if (next > maxOrderQuantity) return notify('Maximum ' + maxOrderQuantity + ' per product');
    setQuantity(qty,next);
    recordActivity(next ? 'bag_quantity' : 'bag_removed',{productId:qty,quantity:next});
    showCart('[data-qty="' + qty + '"][data-step="' + step + '"]');
  } else if (slide !== undefined) showSlide(Number(slide));
  else if (gallery !== undefined) {recordActivity('gallery_view',{index:Number(gallery)});showGallery(Number(gallery));}
  else if (pieceCount !== undefined) {
    recordActivity('quantity_selected',{quantity:Number(pieceCount)});
    find('#item-quantity').value = pieceCount;
    renderItemQuantity();
  }
});
panel.addEventListener('input', event => {
  if (event.target.form?.id === 'search-form') updateSearchResults(event.target.value);
});
find('#stock-only')?.addEventListener('change', event => {
  state.availableOnly = event.target.checked;
  renderCatalog();
});
find('#sort')?.addEventListener('change', event => {state.sort=event.target.value;recordActivity('catalog_sort',{sort:state.sort});renderCatalog();});
let visitorId;
function requestVisitor() {
  if (visitorId) return visitorId;
  try {
    visitorId = localStorage.getItem('beampak-availability-visitor');
    if (!visitorId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitorId)) {
      visitorId = crypto.randomUUID();
      localStorage.setItem('beampak-availability-visitor',visitorId);
    }
  } catch {visitorId ||= crypto.randomUUID();}
  return visitorId;
}
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['search-form','confirmation-form','track-form'].includes(form.id)) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (form.id === 'search-form') {
    const query = data.query.trim();
    if (!catalogGrid) return location.assign('/?q=' + encodeURIComponent(query) + '#shop');
    state.filter = 'all';
    state.search = query;
    state.availableOnly = false;
    renderCatalog();
    recordActivity('catalog_search',{results:find('#products')?.children.length || 0});
    return actions.continue();
  }
  const confirmation = form.id === 'confirmation-form';
  const error = form.querySelector('.form-error');
  const button = form.querySelector('button[type="submit"]');
  if (state.submittingConfirmation || button.disabled) return;
  error.hidden = true;
  button.disabled = true;
  const closeButton = panel.querySelector('[data-action="close"]');
  const backButton = form.querySelector('[data-action="cart"]');
  const idleLabel = button.textContent;
  if (confirmation) {
    state.submittingConfirmation = true;
    closeButton.disabled = true;
    backButton.disabled = true;
    button.textContent = 'Saving confirmation…';
  }
  let confirmedProduct;
  try {
    if (confirmation) {
      const entry = Object.entries(state.cart)[0];
      if (!entry) return showCart();
      const [productId,quantity] = entry;
      confirmedProduct = productId;
      Object.assign(data,{productId,quantity,expectedSubtotal:cartSubtotal(),visitorId:requestVisitor(),campaign});
    }
    const response = await fetch(confirmation ? '/api/order-confirmations' : '/api/orders/lookup',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(20000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Please try again.');
    if (confirmation) {
      if (result.saved !== true) throw new Error('Could not save your confirmation. Please try again.');
      recordActivity(result.created === true ? 'confirmation_saved' : 'confirmation_repeat',{productId:confirmedProduct,quantity:data.quantity});
      if (result.created === true) trackAdEvent('Lead',[{id:confirmedProduct,quantity:data.quantity,price:products.get(confirmedProduct).price}]);
      rememberConfirmation(confirmedProduct);
      setQuantity(confirmedProduct,0);
      showUnavailable();
    } else if (panel.open && panel.contains(form)) {
      if (!result.reference || !Array.isArray(result.items) || !Number.isSafeInteger(result.total)) throw new Error('Could not retrieve this order. Please try again.');
      showResult(result);
    }
  } catch (failure) {
    if (confirmation) recordActivity('checkout_error');
    error.textContent = ['TimeoutError','TypeError','SyntaxError'].includes(failure.name)
      ? 'Could not reach Beampak. Check your connection and try again.'
      : failure.message;
    error.hidden = false;
  } finally {
    if (confirmation) {
      state.submittingConfirmation = false;
      closeButton.disabled = false;
      backButton.disabled = false;
    }
    button.disabled = false;
    button.textContent = idleLabel;
  }
});
initIcons();
persistCart();
if (catalogGrid) {
  state.search = (new URLSearchParams(location.search).get('q') || '').trim().slice(0,80);
  renderCatalog();
}
const featuredProduct = find('[data-feature]');
if (itemPage || featuredProduct) {
  const item = products.get(itemPage?.dataset.itemPage ?? featuredProduct.dataset.feature);
  document.querySelectorAll('[data-item-price]').forEach(label => {label.textContent = unitPrice(item);});
  const stock = find('[data-item-stock]');
  stock.textContent = item.confirmable ? 'Stock pending' : 'Out of stock';
  stock.classList.toggle('stock-unavailable', !item.confirmable);
  if (itemPage) {
    find('[data-purchase]').hidden = !item.confirmable;
    find('[data-mobile-purchase]').hidden = !item.confirmable;
    const input = find('#item-quantity');
    input.max = maxOrderQuantity;
    find('#quantity-range').textContent = 'Whole numbers from 1 to ' + maxOrderQuantity;
    document.querySelectorAll('[data-piece-count]').forEach(button => {
      button.querySelector('small').textContent = money(item.price * Number(button.dataset.pieceCount));
    });
    input.addEventListener('input',()=>{
      renderItemQuantity();
      if (Number.isInteger(state.itemQuantity)) recordActivity('quantity_selected',{quantity:state.itemQuantity});
    });
    renderItemQuantity();
  }
}
if (new URLSearchParams(location.search).get('track') === '1') showTrack();
