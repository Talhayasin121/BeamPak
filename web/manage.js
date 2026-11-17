const statuses = ['Received','Confirmed','Shipped','Delivered','Cancelled'];
const find = selector => document.querySelector(selector);
const login = find('#manage-login');
const filter = find('#manage-filter');
const list = find('#manage-orders');
const error = find('#manager-error');
const result = find('#manager-result');
const more = find('#more-orders');
const notice = find('#manager-notice');
const interest = find('#manage-interest');
const interestTotals = find('#interest-totals');
const interestCampaigns = find('#interest-campaigns');
const refreshInterest = find('#refresh-interest');
const ordersTitle = find('#orders-title');
const ownerOpen = find('#owner-open');
const escapes = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const safe = value => String(value).replace(/[&<>"']/g, character => escapes[character]);
let key = '';
let requestNumber = 0;
let cursor;
let ownerSession = false;
let activeFilters = {};
let managedOrders = [];

function lock() {
  requestNumber++;
  key = '';
  login.reset();
  filter.reset();
  list.replaceChildren();
  interest.hidden = true;
  ordersTitle.hidden = true;
  interestTotals.textContent = '';
  interestCampaigns.replaceChildren();
  refreshInterest.disabled = false;
  managedOrders = [];
  cursor = null;
  error.hidden = true;
  result.textContent = '';
  login.hidden = false;
  notice.hidden = false;
  ownerOpen.hidden = !ownerSession;
  filter.hidden = true;
  more.hidden = true;
  login.elements.key.focus();
}
find('#lock').addEventListener('click', lock);
ownerOpen.addEventListener('click', () => {
  activeFilters = {};
  loadOrders();
});

async function request(path, options) {
  const headers = new Headers(options?.headers);
  if (key) headers.set('Authorization','Bearer ' + key);
  const response = await fetch(path,{...options,headers,signal:AbortSignal.timeout(15000)});
  if (response.status === 401) throw Object.assign(new Error('Enter the store access key.'),{status:401});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request failed. Try again.');
  return data;
}
function showError(failure) {
  error.hidden = false;
  error.textContent = ['TypeError','TimeoutError','SyntaxError'].includes(failure.name)
    ? 'Could not reach the order service. Please try again.'
    : failure.message;
}
const formatCount = count => Number(count).toLocaleString('en-PK');
async function loadInterest(sequence) {
  refreshInterest.disabled = true;
  interestCampaigns.replaceChildren();
  interestTotals.textContent = 'Loading requests…';
  try {
    const summary = await request('/api/manage/interest');
    if (sequence !== requestNumber) return;
    interestTotals.textContent = formatCount(summary.requests) + ' requests · ' + formatCount(summary.pieces) + ' pieces';
    for (const campaign of summary.campaigns) {
      const line = document.createElement('li');
      const label = [campaign.source,campaign.medium,campaign.campaign].filter(Boolean).join(' / ') || 'Untagged';
      line.textContent = label + ' · ' + formatCount(campaign.requests) + ' requests · ' + formatCount(campaign.pieces) + ' pieces';
      interestCampaigns.append(line);
    }
  } catch {
    if (sequence === requestNumber) interestTotals.textContent = 'Could not load availability requests. Try refreshing.';
  } finally {
    if (sequence === requestNumber) refreshInterest.disabled = false;
  }
}
refreshInterest.addEventListener('click', () => loadInterest(requestNumber));
function renderOrders() {
  result.textContent = managedOrders.length ? managedOrders.length + ' order(s) shown' : 'No orders found.';
  list.innerHTML = managedOrders.map(order => {
    const options = statuses.map(status=>'<option' + (order.status === status ? ' selected' : '') + '>' + status + '</option>').join('');
    const items = order.items.map(item=>'<li>' + safe(item.name) + ' × ' + Number(item.quantity) + '</li>').join('');
    return '<article class="manage-order"><h2>' + safe(order.reference) + '</h2><p>' + safe(order.createdAt) + ' UTC</p><p>' + safe(order.name) + ' · ' + safe(order.phone) + '</p><p>' + safe(order.address) + ', ' + safe(order.city) + '</p><ul>' + items + '</ul><p><strong>Rs. ' + order.total.toLocaleString('en-PK') + '</strong> · Cash on delivery</p><form data-reference="' + safe(order.reference) + '" data-current-status="' + safe(order.status) + '"><label>Status<select name="status">' + options + '</select></label><button class="btn btn-ghost">Save</button></form></article>';
  }).join('');
  more.hidden = !cursor;
}
async function loadOrders({append=false, silent=false}={}) {
  const sequence = ++requestNumber;
  const query = new URLSearchParams();
  if (activeFilters.reference) query.set('reference',activeFilters.reference);
  else if (activeFilters.status) query.set('status',activeFilters.status);
  if (append && cursor) query.set('after',cursor);
  error.hidden = true;
  if (!silent) result.textContent = 'Loading orders…';
  more.disabled = true;
  try {
    const data = await request('/api/manage/orders?' + query.toString());
    if (sequence !== requestNumber) return;
    if (!key) ownerSession = true;
    managedOrders = append ? managedOrders.concat(data.orders) : data.orders;
    cursor = data.next;
    renderOrders();
    login.reset();
    login.hidden = true;
    notice.hidden = true;
    ownerOpen.hidden = true;
    filter.hidden = false;
    ordersTitle.hidden = false;
    interest.hidden = false;
    void loadInterest(sequence);
  } catch (failure) {
    if (sequence !== requestNumber) return;
    result.textContent = '';
    refreshInterest.disabled = false;
    if (!silent || failure.status !== 401) showError(failure);
  } finally {
    if (sequence === requestNumber) more.disabled = false;
  }
}
login.addEventListener('submit', async event => {
  event.preventDefault();
  const button = login.querySelector('button');
  button.disabled = true;
  key = login.elements.key.value.trim();
  login.reset();
  activeFilters = {};
  try {await loadOrders();}
  finally {button.disabled = false;}
});
filter.addEventListener('submit', event => {
  event.preventDefault();
  activeFilters = {reference:filter.elements.reference.value.trim(),status:filter.elements.status.value};
  loadOrders();
});
more.addEventListener('click', () => loadOrders({append:true}));
list.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector('button');
  const sequence = requestNumber;
  button.disabled = true;
  error.hidden = true;
  try {
    const {status} = await request('/api/manage/status',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({reference:form.dataset.reference,status:form.elements.status.value,previousStatus:form.dataset.currentStatus})
    });
    if (sequence !== requestNumber) return;
    const order = managedOrders.find(item => item.reference === form.dataset.reference);
    order.status = status;
    form.dataset.currentStatus = status;
    if (!activeFilters.reference && activeFilters.status && activeFilters.status !== status) {
      managedOrders = managedOrders.filter(item => item !== order);
      renderOrders();
    }
    result.textContent = 'Saved status for ' + order.reference;
  } catch (failure) {
    if (sequence === requestNumber) showError(failure);
  } finally {
    button.disabled = false;
  }
});
statuses.forEach(status => filter.elements.status.add(new Option(status,status)));
login.querySelector('button').disabled = false;
loadOrders({silent:true});
