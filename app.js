import { buildData, SRC } from './normalize.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripBom = (s) => s.replace(/^﻿/, '');
const RT_CACHE = 'hever-runtime-v1';
const CACHE_KEY = new URL('__hever_data__.json', location.href).href; // valid http(s) key for Cache API
const LIST_CAP = 500;

let DATA, STORES = [], CHAINS = [], CHAIN_BY_ID = new Map(), filtered = [];
let map, cluster;
const state = { q: '', keva: true, teamim: true, both: false, cat: '', region: '', online: 'all', kosher: false, access: false };

/* ---------- Data loading: live → device cache → bundled ---------- */
async function fetchLive() {
  const [giftcard, giftBranches, teamimRaw, cats] = await Promise.all(
    SRC.files.map((f) => fetch(SRC.base + f, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(`${f} ${r.status}`); return r.text(); })
      .then((t) => JSON.parse(stripBom(t))))
  );
  return buildData({ giftcard, giftBranches, teamimRaw, cats });
}
async function cachePut(d) {
  try { localStorage.setItem('hever_at', d.generatedAt || ''); } catch (e) {}
  try {
    const c = await caches.open(RT_CACHE);
    await c.put(CACHE_KEY, new Response(JSON.stringify(d), { headers: { 'content-type': 'application/json' } }));
  } catch (e) { /* ignore quota */ }
}
async function cacheGet() {
  try { const c = await caches.open(RT_CACHE); const r = await c.match(CACHE_KEY); if (r) return await r.json(); } catch (e) {}
  return null;
}
async function loadData() {
  try {
    const d = await fetchLive();
    cachePut(d);
    return { data: d, src: 'live' };
  } catch (e) {
    const cached = await cacheGet();
    if (cached) return { data: cached, src: 'cached' };
    const d = await fetch('./data.json').then((r) => r.json());
    return { data: d, src: 'archived' };
  }
}

/* ---------- Source badge ---------- */
function setSource(src, at) {
  const el = $('#source'); el.className = 'source-badge ' + (src === 'live' ? '' : src);
  const d = at ? new Date(at) : null;
  const when = d && !isNaN(d) ? d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  const label = src === 'live' ? 'מעודכן · חי' : src === 'cached' ? `שמור במכשיר${when ? ' · ' + when : ''}` : `ארכיון${when ? ' · ' + when : ''}`;
  $('.txt', el).textContent = label;
}

/* ---------- Map ---------- */
function initMap() {
  map = L.map('map', { zoomControl: true }).setView([32.0853, 34.7818], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap',
  }).addTo(map);
  cluster = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50, spiderfyOnMaxZoom: true });
  map.addLayer(cluster);
}
function pinIcon(card, both) {
  const cls = both ? 'both' : card;
  return L.divIcon({ className: '', html: `<div class="pin ${cls}"></div>`, iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24] });
}
function renderMarkers() {
  cluster.clearLayers();
  const markers = [];
  for (const s of filtered) {
    if (s.lat == null || s.lng == null) continue;
    const m = L.marker([s.lat, s.lng], { icon: pinIcon(s.card, s.acceptsBoth) });
    const nav = `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;
    m.bindPopup(
      `<div class="popup"><h4>${esc(s.chain)}</h4>` +
      `<div class="addr">${esc(placeLine(s))}</div>` +
      `<div class="acts"><a href="${nav}" target="_blank" rel="noopener">ניווט ›</a>` +
      `<a href="#" data-chain="${esc(s.chainId)}">פרטי הרשת ›</a></div></div>`
    );
    markers.push(m);
  }
  cluster.addLayers(markers);
}

/* ---------- List ---------- */
function logoHtml(s, big) {
  const cls = 'logo' + (big ? ' big' : '');
  const initial = esc((s.chain || '?').trim()[0] || '?');
  if (s.logo) return `<img class="${cls}" loading="lazy" src="${esc(s.logo)}" alt="" onerror="this.outerHTML='<div class=\\'${cls} ph\\'>${initial}</div>'">`;
  return `<div class="${cls} ph">${initial}</div>`;
}
function placeLine(s) {
  const addr = (s.address || '').replace(/\s*,\s*/g, ', ').replace(/^[\s,]+|[\s,]+$/g, '');
  if (s.card === 'teamim') return [s.city, addr].filter(Boolean).join(' · ') || (s.online ? 'חנות מקוונת' : '');
  // Keva: branch name is itself a location label (e.g. "הרצליה קניון ארנה"); fall back to address.
  const loc = s.branch && s.branch !== s.chain ? s.branch : '';
  return loc || addr || (s.online ? 'חנות מקוונת' : '');
}
function badges(s) {
  const b = [];
  b.push(`<span class="badge ${s.card}"><span class="swatch" style="background:var(--${s.card})"></span>${s.card === 'keva' ? 'חבר קבע' : 'חבר טעמים'}</span>`);
  if (s.acceptsBoth) b.push('<span class="badge both">בשניהם</span>');
  if (s.online) b.push('<span class="badge online">אונליין</span>');
  if (/כשר/.test(s.kosher || '')) b.push('<span class="badge kosher">כשר</span>');
  if (s.handicap === 'Y') b.push('<span class="badge access">נגיש</span>');
  if ((s.category || '').trim()) b.push(`<span class="badge cat">${esc((s.category || '').split(',')[0])}</span>`);
  return b.join(' ');
}
function renderList() {
  const list = $('#list');
  if (!filtered.length) { list.innerHTML = `<div class="state">לא נמצאו בתי עסק התואמים את הסינון.</div>`; return; }
  const shown = filtered.slice(0, LIST_CAP);
  const frag = shown.map((s) => `
    <div class="card" data-chain="${esc(s.chainId)}" role="button" tabindex="0">
      ${logoHtml(s)}
      <div class="body">
        <p class="title">${esc(s.chain)}</p>
        <div class="sub">${esc(placeLine(s) || '—')}</div>
        <div class="meta">${badges(s)}</div>
      </div>
    </div>`).join('');
  const more = filtered.length > LIST_CAP ? `<div class="state">מוצגים ${LIST_CAP} מתוך ${filtered.length.toLocaleString('he-IL')} — צמצמו את הסינון לתוצאות מדויקות יותר.</div>` : '';
  list.innerHTML = frag + more;
}
function updateCount() {
  $('#count').textContent = `${filtered.length.toLocaleString('he-IL')} בתי עסק · ${filtered.filter((s) => s.lat != null).length.toLocaleString('he-IL')} על המפה`;
}

/* ---------- Filtering ---------- */
function applyFilters() {
  const q = state.q.trim().toLowerCase();
  filtered = STORES.filter((s) => {
    if (s.card === 'keva' && !state.keva) return false;
    if (s.card === 'teamim' && !state.teamim) return false;
    if (state.both && !s.acceptsBoth) return false;
    if (state.cat && !(s.category || '').includes(state.cat)) return false;
    if (state.region && s.region !== state.region) return false;
    if (state.online === 'online' && !s.online) return false;
    if (state.online === 'physical' && s.online) return false;
    if (state.kosher && !/כשר/.test(s.kosher || '')) return false;
    if (state.access && s.handicap !== 'Y') return false;
    if (q) {
      const hay = `${s.chain} ${s.branch} ${s.city} ${s.address} ${s.category}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  renderList(); renderMarkers(); updateCount();
}

/* ---------- Chain detail panel ---------- */
function openChain(chainId) {
  const ch = CHAIN_BY_ID.get(chainId);
  if (!ch) return;
  const branches = STORES.filter((s) => s.chainId === chainId);
  const physical = branches.filter((s) => s.lat != null);
  const terms = [];
  if (ch.instructions?.inStore) terms.push(`<div class="note"><b>בחנות:</b> ${esc(ch.instructions.inStore)}</div>`);
  if (ch.instructions?.online) terms.push(`<div class="note" style="margin-top:8px"><b>אונליין:</b> ${esc(ch.instructions.online)}</div>`);
  if (ch.desc) terms.unshift(`<p style="margin:0 0 10px;color:var(--muted)">${esc(ch.desc)}</p>`);
  if (!terms.length) terms.push(`<div class="note">מכובד בכרטיס ${ch.card === 'keva' ? '"חבר של קבע"' : '"חבר טעמים"'} בכפוף לתקנון. ראו רשימת סניפים מטה.</div>`);

  const rows = branches.map((b) => {
    const nav = b.lat != null ? `https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lng}` : (b.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address + ' ' + b.city)}` : '');
    const bl = (b.branch && b.branch !== b.chain) ? b.branch : (b.city || b.branch || b.chain);
    return `<tr>
      <td>${esc(bl)}</td>
      <td>${esc([b.address, b.city].filter(Boolean).join(', ') || (b.online ? 'מקוון' : '—'))}</td>
      <td>${b.phone ? `<a href="tel:${esc(b.phone)}">${esc(b.phone)}</a>` : ''}</td>
      <td>${nav ? `<a class="map-link" href="${nav}" target="_blank" rel="noopener">מפה ›</a>` : ''}</td>
    </tr>`;
  }).join('');

  $('#detail-root').innerHTML = `
    <div class="detail-backdrop" id="detailBackdrop"></div>
    <aside class="detail-panel" role="dialog" aria-label="${esc(ch.name)}">
      <button class="detail-x" id="detailX" aria-label="סגור">✕</button>
      <div class="detail">
        <div class="head">${logoHtml({ chain: ch.name, logo: ch.logo }, true)}
          <div><h2>${esc(ch.name)}</h2>
          <div class="sub">${esc(ch.category || '')}${ch.types ? ' · ' + esc(ch.types) : ''}</div>
          <div class="meta" style="margin-top:8px">
            <span class="badge ${ch.card}">${ch.card === 'keva' ? 'חבר קבע' : 'חבר טעמים'}</span>
            ${ch.website ? `<a class="badge cat" href="${/^https?:/.test(ch.website) ? '' : 'https://'}${esc(ch.website)}" target="_blank" rel="noopener">אתר הרשת ›</a>` : ''}
          </div></div>
        </div>
        <div class="terms"><h3>הוראות שימוש ומגבלות</h3>${terms.join('')}</div>
        <div class="terms" style="padding-top:0">
          <h3>רשימת הסניפים (${branches.length}${physical.length !== branches.length ? `, ${physical.length} על המפה` : ''})</h3>
          <div style="max-height:46vh;overflow:auto">
            <table class="branch-table"><thead><tr><th>שם הסניף</th><th>כתובת</th><th>טלפון</th><th>מפה</th></tr></thead>
            <tbody>${rows}</tbody></table>
          </div>
        </div>
      </div>
    </aside>`;
  document.body.style.overflow = 'hidden';
  const close = () => { $('#detail-root').innerHTML = ''; document.body.style.overflow = ''; };
  $('#detailX').onclick = close;
  $('#detailBackdrop').onclick = close;
}

/* ---------- Filter UI wiring ---------- */
function populateSelects() {
  const cats = new Set(), regions = new Set();
  for (const s of STORES) {
    (s.category || '').split(',').map((c) => c.trim()).filter(Boolean).forEach((c) => cats.add(c));
    if (s.region) regions.add(s.region);
  }
  const fill = (sel, vals) => { for (const v of [...vals].sort((a, b) => a.localeCompare(b, 'he'))) { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); } };
  fill($('#cat'), cats); fill($('#region'), regions);
}
function wire() {
  let t;
  $('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; applyFilters(); }, 180); });
  for (const btn of document.querySelectorAll('.chip[data-toggle]')) {
    btn.addEventListener('click', () => { const k = btn.dataset.toggle; state[k] = !state[k]; btn.setAttribute('aria-pressed', String(state[k])); applyFilters(); });
  }
  $('#cat').addEventListener('change', (e) => { state.cat = e.target.value; applyFilters(); });
  $('#region').addEventListener('change', (e) => { state.region = e.target.value; applyFilters(); });
  $('#online').addEventListener('change', (e) => { state.online = e.target.value; applyFilters(); });
  $('#reset').addEventListener('click', () => {
    Object.assign(state, { q: '', keva: true, teamim: true, both: false, cat: '', region: '', online: 'all', kosher: false, access: false });
    $('#q').value = ''; $('#cat').value = ''; $('#region').value = ''; $('#online').value = 'all';
    document.querySelector('[data-toggle="keva"]').setAttribute('aria-pressed', 'true');
    document.querySelector('[data-toggle="teamim"]').setAttribute('aria-pressed', 'true');
    for (const b of document.querySelectorAll('[data-toggle="both"],[data-toggle="kosher"],[data-toggle="access"]')) b.setAttribute('aria-pressed', 'false');
    applyFilters();
  });
  // open chain on card / popup click
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-chain]');
    if (el) { e.preventDefault(); openChain(el.dataset.chain); }
  });
  $('#list').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const el = e.target.closest('[data-chain]'); if (el) openChain(el.dataset.chain); } });
  // mobile drawer
  const inner = $('#filters'), backdrop = $('#backdrop');
  const openD = () => { inner.classList.add('collapsible', 'open'); backdrop.classList.add('open'); $('#drawerClose').style.display = 'inline-flex'; };
  const closeD = () => { inner.classList.remove('open'); backdrop.classList.remove('open'); };
  $('#drawerOpen').addEventListener('click', openD);
  $('#drawerClose').addEventListener('click', closeD);
  backdrop.addEventListener('click', closeD);
  const mq = window.matchMedia('(max-width: 860px)');
  const sync = () => { if (mq.matches) inner.classList.add('collapsible'); else { inner.classList.remove('collapsible', 'open'); backdrop.classList.remove('open'); } };
  mq.addEventListener('change', sync); sync();
}

/* ---------- Boot ---------- */
async function boot() {
  initMap(); wire();
  $('#list').innerHTML = '<div class="skeleton"></div>'.repeat(6);
  const { data, src } = await loadData();
  DATA = data; STORES = data.stores; CHAINS = data.chains;
  CHAIN_BY_ID = new Map(CHAINS.map((c) => [c.id, c]));
  setSource(src, data.generatedAt);
  populateSelects();
  applyFilters();
  if ('serviceWorker' in navigator) { try { await navigator.serviceWorker.register('./sw.js'); } catch (e) {} }
}
boot();
