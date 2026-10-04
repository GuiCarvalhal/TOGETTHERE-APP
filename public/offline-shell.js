// TOGETTHERE offline shell — standalone JS (no React/SDK/imports).
// Served as a static .js file and precached by the service worker.
// Reads IndexedDB snapshots with safe textContent (no innerHTML for untrusted data).
// Unique marker: <meta name="tt-offline-shell" content="v2">
'use strict';

var DB_NAME = 'tt-offline';
var DB_VERSION = 1;
var TTL_MS = 7 * 24 * 60 * 60 * 1000;
var STORES = { META: 'meta', GATHERINGS: 'gatherings', JOURNEY: 'journey', EXPENSES: 'expenses' };
var TYPE_LABELS = { flight: 'Flight', car: 'Car', train: 'Train', hotel: 'Stay', activity: 'Activity', cruise: 'Cruise', other: 'Other' };
var CAT_LABELS = { food: 'Food', lodging: 'Lodging', transport: 'Transport', activities: 'Activities', other: 'Other' };

function openDB() {
  return new Promise(function (resolve, reject) {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function (e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(STORES.META)) db.createObjectStore(STORES.META, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORES.GATHERINGS)) db.createObjectStore(STORES.GATHERINGS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.JOURNEY)) db.createObjectStore(STORES.JOURNEY, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.EXPENSES)) db.createObjectStore(STORES.EXPENSES, { keyPath: 'id' });
    };
    req.onsuccess = function (e) { resolve(e.target.result); };
    req.onerror = function (e) { reject(e.target.error); };
  });
}
function storeReq(db, name, mode) { return db.transaction(name, mode).objectStore(name); }
function asPromise(req) {
  return new Promise(function (resolve, reject) {
    req.onsuccess = function (e) { resolve(e.target.result); };
    req.onerror = function (e) { reject(e.target.error); };
  });
}
function userRange(userId) { var p = userId + ':'; return IDBKeyRange.bound(p, p + '\uffff'); }
function isExpired(entry, now) { return !entry || !entry.expiresAt || entry.expiresAt < (now || Date.now()); }

function formatDateTime(iso, tz) {
  if (!iso) return 'Unscheduled';
  try {
    var opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    if (tz) { opts.timeZone = tz; opts.timeZoneName = 'short'; }
    return new Intl.DateTimeFormat('en-US', opts).format(new Date(iso));
  } catch (e) { return new Date(iso).toLocaleString('en-US'); }
}
function relativeTime(ts) {
  if (!ts) return '';
  var s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  var m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
  var h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  var d = Math.floor(h / 24); if (d < 7) return d + 'd ago';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function routeLabel(item) {
  if (item.type === 'flight' || item.type === 'car' || item.type === 'train' || item.type === 'cruise') {
    var from = item.from_place ? (item.from_place.iata || item.from_place.city || item.location_from) : item.location_from;
    var to = item.to_place ? (item.to_place.iata || item.to_place.city || item.location_to) : item.location_to;
    if (from && to) return from + ' \u2192 ' + to;
    if (from) return from;
    if (to) return to;
  }
  if (item.location_name) return item.location_name;
  if (item.place && item.place.name) return item.place.name;
  return '';
}
function el(tag, className) {
  var e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
function text(tag, className, content) {
  var e = el(tag, className);
  e.textContent = content;
  return e;
}

// ─── List view ───────────────────────────────────────────────────
async function showList() {
  document.getElementById('listView').classList.remove('hidden');
  document.getElementById('detailView').classList.add('hidden');
  var container = document.getElementById('listView');
  container.textContent = '';

  var activeUser, gatherings;
  try {
    var db = await openDB();
    activeUser = (await asPromise(storeReq(db, STORES.META, 'readonly').get('activeUser'))) || {};
    var all = await asPromise(storeReq(db, STORES.GATHERINGS, 'readonly').getAll(activeUser.value ? userRange(activeUser.value) : null));
    db.close();
    gatherings = (all || []).filter(function (e) { return !isExpired(e); });
  } catch (e) {
    // Cache unavailable (IDB failure) — distinct from no saved data.
    showCacheUnavailable(container);
    return;
  }

  var syncInfo = document.getElementById('syncInfo');
  if (gatherings.length > 0) {
    var newest = gatherings.reduce(function (a, b) { return a.snapshotAt > b.snapshotAt ? a : b; });
    syncInfo.textContent = '';
    syncInfo.appendChild(text('span', '', 'Last synced ' + relativeTime(newest.snapshotAt) + '. '));
    syncInfo.appendChild(text('span', '', 'Data may be incomplete or outdated.'));
    syncInfo.classList.remove('hidden');
  } else {
    syncInfo.classList.add('hidden');
  }

  if (!activeUser.value) {
    var empty = el('div', 'empty-state');
    empty.appendChild(text('h2', '', 'No saved items'));
    empty.appendChild(text('p', '', 'You haven\u2019t opened any gatherings while online. Open the app online first, then return here to view saved items offline.'));
    container.appendChild(empty);
    return;
  }
  if (gatherings.length === 0) {
    var empty2 = el('div', 'empty-state');
    empty2.appendChild(text('h2', '', 'No cached gatherings'));
    empty2.appendChild(text('p', '', 'Your saved gatherings have expired or been cleared. Go online to refresh.'));
    container.appendChild(empty2);
    return;
  }

  gatherings.forEach(function (g) {
    var card = el('div', 'card clickable');
    card.addEventListener('click', function () { showDetail(g.userId, g.gatheringId); });
    card.appendChild(text('div', 'card-title', g.gathering.name || 'Untitled gathering'));
    var dests = (g.gathering.destination_places || []).map(function (d) { return d.name; }).filter(Boolean);
    if (!dests.length) dests = (g.gathering.destinations || []).filter(Boolean);
    if (dests.length) card.appendChild(text('div', 'card-sub', dests.join(' \u00b7 ')));
    var meta = el('div', 'card-meta');
    var stamp = el('span', 'role-stamp ' + (g.role || 'member'));
    stamp.textContent = (g.role || 'member').charAt(0).toUpperCase() + (g.role || 'member').slice(1);
    meta.appendChild(stamp);
    meta.appendChild(text('span', '', '\u00b7 Synced ' + relativeTime(g.snapshotAt)));
    card.appendChild(meta);
    container.appendChild(card);
  });
}

// ─── Detail view ─────────────────────────────────────────────────
async function showDetail(userId, gatheringId) {
  document.getElementById('listView').classList.add('hidden');
  document.getElementById('detailView').classList.remove('hidden');
  var container = document.getElementById('detailView');
  container.textContent = '';

  var back = el('button', 'back-btn');
  back.textContent = '\u2190 Back';
  back.addEventListener('click', showList);
  container.appendChild(back);

  var snap;
  try {
    var db = await openDB();
    var id = userId + ':' + gatheringId;
    var now = Date.now();
    var g = await asPromise(storeReq(db, STORES.GATHERINGS, 'readonly').get(id));
    if (!g || isExpired(g)) { db.close(); showExpired(container); return; }
    var j = await asPromise(storeReq(db, STORES.JOURNEY, 'readonly').get(id));
    var ex = await asPromise(storeReq(db, STORES.EXPENSES, 'readonly').get(id));
    db.close();
    snap = {
      gathering: g.gathering, role: g.role, members: g.members, snapshotAt: g.snapshotAt,
      journeyItems: (j && !isExpired(j)) ? j.items : [],
      journeySnapshotAt: j ? j.snapshotAt : null,
      expenses: (ex && !isExpired(ex)) ? ex.expenses : null,
      expensesSnapshotAt: ex ? ex.snapshotAt : null,
    };
  } catch (e) {
    showCacheUnavailable(container);
    return;
  }

  // Header
  container.appendChild(text('div', 'card-title', snap.gathering.name || 'Untitled gathering'));
  var dests = (snap.gathering.destination_places || []).map(function (d) { return d.name; }).filter(Boolean);
  if (!dests.length) dests = (snap.gathering.destinations || []).filter(Boolean);
  if (dests.length) container.appendChild(text('div', 'card-sub', dests.join(' \u00b7 ')));
  var stamp = el('span', 'role-stamp ' + (snap.role || 'member'));
  stamp.textContent = (snap.role || 'member').charAt(0).toUpperCase() + (snap.role || 'member').slice(1);
  container.appendChild(el('div', 'card-meta')).appendChild(stamp);

  // Per-dataset sync timestamps (accurate per section, not one global time)
  var syncCard = el('div', 'card');
  syncCard.appendChild(text('div', 'section-label', 'Last synced'));
  var gRow = el('div', 'sync-row');
  gRow.appendChild(text('span', '', 'Gathering'));
  gRow.appendChild(text('span', '', relativeTime(snap.snapshotAt) || 'Unknown'));
  syncCard.appendChild(gRow);
  var jRow = el('div', 'sync-row');
  jRow.appendChild(text('span', '', 'Journey'));
  jRow.appendChild(text('span', '', snap.journeySnapshotAt ? relativeTime(snap.journeySnapshotAt) : 'Not cached'));
  syncCard.appendChild(jRow);
  var exRow = el('div', 'sync-row');
  if (snap.role === 'owner' || snap.role === 'admin' || snap.role === 'member') {
    exRow.appendChild(text('span', '', 'Expenses'));
    exRow.appendChild(text('span', '', snap.expensesSnapshotAt ? relativeTime(snap.expensesSnapshotAt) : 'Not cached'));
  } else {
    exRow.appendChild(text('span', '', 'Expenses'));
    exRow.appendChild(text('span', '', 'N/A for viewers'));
  }
  syncCard.appendChild(exRow);
  container.appendChild(syncCard);

  // Journey section
  container.appendChild(text('div', 'section-label', 'Journey'));
  if (snap.journeyItems.length === 0) {
    container.appendChild(text('div', 'notice', 'No journey items were cached. Open the Journey tab online first.'));
  } else {
    var timeline = el('div', 'timeline');
    snap.journeyItems.forEach(function (item) {
      var entry = el('div', 'timeline-item');
      var dot = el('div', 'timeline-dot');
      dot.textContent = (TYPE_LABELS[item.type] || 'Other').charAt(0);
      entry.appendChild(dot);

      entry.appendChild(text('div', 'journey-type', TYPE_LABELS[item.type] || 'Other'));
      entry.appendChild(text('div', 'journey-title', item.title || 'Untitled'));
      var tz = (item.from_place && item.from_place.tz) || (item.to_place && item.to_place.tz) || (item.place && item.place.tz) || null;
      entry.appendChild(text('div', 'journey-time', formatDateTime(item.start_datetime, tz)));
      var route = routeLabel(item);
      if (route) entry.appendChild(text('div', 'journey-route', route));
      if (item.confirmation_number) entry.appendChild(text('div', 'journey-route', item.confirmation_number));
      if (item.airline) entry.appendChild(text('div', 'journey-route', item.airline));
      if (item.notes) entry.appendChild(text('div', 'journey-notes', item.notes));

      // Attendees — resolved via member.id (kept by extractMinimalMember)
      var attendees = (item.attendee_user_ids || []).map(function (uid) {
        var m = (snap.members || []).find(function (mm) { return mm.user_id === uid; });
        return m ? m.full_name : null;
      }).filter(Boolean);
      if (attendees.length) entry.appendChild(text('div', 'journey-attendees', 'Attendees: ' + attendees.join(', ')));

      timeline.appendChild(entry);
    });
    container.appendChild(timeline);
  }

  // Map unavailable notice
  container.appendChild(text('div', 'notice', 'Maps and live status updates are unavailable offline.'));

  // Expenses section (only for owner/admin/member — NEVER for viewer)
  if (snap.role === 'owner' || snap.role === 'admin' || snap.role === 'member') {
    container.appendChild(text('div', 'section-label', 'Expenses'));
    if (snap.expenses === null) {
      container.appendChild(text('div', 'notice', 'No expenses were cached. Open the Expenses tab online first.'));
    } else if (snap.expenses.length === 0) {
      container.appendChild(text('div', 'notice', 'No expenses recorded.'));
    } else {
      var list = el('div', 'card');
      snap.expenses.forEach(function (exp) {
        var row = el('div', 'expense-row');
        var left = el('div');
        var titleLine = el('div');
        var cat = el('span', 'expense-cat');
        cat.textContent = CAT_LABELS[exp.category] || 'Other';
        titleLine.appendChild(cat);
        titleLine.appendChild(text('span', 'expense-title', exp.title || 'Untitled'));
        left.appendChild(titleLine);
        var meta = el('div', 'expense-meta');
        // Payer name lookup via member.id (extractMinimalMember keeps id)
        var payer = (snap.members || []).find(function (m) { return m.id === exp.payer_member_id; });
        var parts = [];
        if (payer) parts.push('Paid by ' + payer.full_name);
        if (exp.date) parts.push(exp.date);
        if (exp.place_name) parts.push(exp.place_name);
        if (exp.settled) parts.push('Settled');
        meta.textContent = parts.join(' \u00b7 ');
        left.appendChild(meta);
        if (exp.notes) left.appendChild(text('div', 'expense-meta', exp.notes));
        row.appendChild(left);
        var amt = text('div', 'expense-amount', (exp.currency || 'USD') + ' ' + Number(exp.amount).toFixed(2));
        row.appendChild(amt);
        list.appendChild(row);
      });
      container.appendChild(list);
      container.appendChild(text('div', 'notice', 'Amounts shown in their original payment currency. No currency conversion offline.'));
    }
  } else {
    container.appendChild(text('div', 'notice', 'Expenses are not available for your role in this gathering.'));
  }

  // Remote images unavailable
  container.appendChild(text('div', 'notice', 'Remote images (cover photos, place photos, receipts) are unavailable offline.'));
}

function showExpired(container) {
  var empty = el('div', 'empty-state');
  empty.appendChild(text('h2', '', 'Cache expired'));
  empty.appendChild(text('p', '', 'This gathering\u2019s saved data has expired or been cleared. Go online to refresh.'));
  container.appendChild(empty);
}

function showCacheUnavailable(container) {
  var empty = el('div', 'empty-state');
  empty.appendChild(text('h2', '', 'Offline data unavailable'));
  empty.appendChild(text('p', '', 'Could not read saved data from this device. This may be a temporary storage issue.'));
  container.appendChild(empty);
}

// ─── Init ─────────────────────────────────────────────────────────
showList().catch(function () {
  var c = document.getElementById('listView');
  c.textContent = '';
  showCacheUnavailable(c);
});
