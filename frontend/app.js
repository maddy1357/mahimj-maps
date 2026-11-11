'use strict';
/* MahimJ Maps: a full-screen web map built with Leaflet.
 * Free, key-less open services:
 *   tiles       OpenStreetMap, Esri World Imagery, OpenTopoMap, CARTO, Waymarked Trails
 *   search      Photon (search-as-you-type) + Nominatim (full search, reverse geocoding, details)
 *   nearby      Overpass API
 *   directions  OSRM servers by FOSSGIS (car, bike, foot)
 */

// =====================================================================
// Utilities
// =====================================================================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ms = (name, cls = '') => `<span class="ms ${cls}">${name}</span>`;
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, t) => {
  let h;
  return (...a) => {
    clearTimeout(h);
    h = setTimeout(() => fn(...a), t);
  };
};
const isMobile = () => matchMedia('(max-width: 640px)').matches;
const pretty = (s) => (s ? String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '');
const fmtLL = (lat, lon) => `${(+lat).toFixed(6)}, ${(+lon).toFixed(6)}`;
const coordRe = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

function fmtDist(m) {
  if (m < 1000) return `${m < 100 ? Math.round(m) : Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}
function fmtDur(sec) {
  const mins = Math.max(1, Math.round(sec / 60));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d) return `${d} day ${h} hr`;
  if (h) return m ? `${h} hr ${m} min` : `${h} hr`;
  return `${m} min`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 2800);
}

async function copyText(text, msg = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    toast(text);
  }
}

function tileXY(lat, lon, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { x: ((x % n) + n) % n, y: Math.max(0, Math.min(n - 1, y)) };
}
const satTile = (lat, lon, z = 17) => {
  const { x, y } = tileXY(lat, lon, z);
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
};

// =====================================================================
// Data services
// =====================================================================
// All data comes from the MahimJ Maps backend (see backend/). It talks to the
// OpenStreetMap services, caches results and returns normalised "place" objects:
// { name, category, kind, address, lat, lon, tags, osm, bbox }.
const enc = encodeURIComponent;
const clampLat = (v) => Math.max(-90, Math.min(90, v));
const clampLon = (v) => Math.max(-180, Math.min(180, v));
const ll6 = (lat, lon) => `${(+lat).toFixed(6)},${(+lon).toFixed(6)}`;

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

const api = {
  suggest: (q, c) => request(`/api/suggest?q=${enc(q)}&lat=${clampLat(c.lat).toFixed(3)}&lon=${clampLon(c.lng).toFixed(3)}`).then((d) => d.results),
  search: (q, b) => {
    const vb = [clampLon(b.getWest()), clampLat(b.getNorth()), clampLon(b.getEast()), clampLat(b.getSouth())].map((n) => n.toFixed(4));
    return request(`/api/search?q=${enc(q)}&viewbox=${vb.join(',')}`).then((d) => d.results);
  },
  reverse: (lat, lon, zoom = 18) => request(`/api/reverse?lat=${(+lat).toFixed(6)}&lon=${(+lon).toFixed(6)}&zoom=${zoom}`).then((d) => d.place),
  lookup: (osm) => request(`/api/lookup?osm=${osm.type}${osm.id}`).then((d) => d.place),
  categories: () => request('/api/categories').then((d) => d.categories),
  nearby: (category, area) => request(`/api/nearby?category=${enc(category)}&${area}`).then((d) => d.results),
  route: (mode, from, to) => request(`/api/route?mode=${mode}&from=${ll6(from.lat, from.lon)}&to=${ll6(to.lat, to.lon)}`).then((d) => d.routes),
  saved: {
    list: () => request('/api/saved').then((d) => d.places),
    add: (p) => request('/api/saved', { method: 'POST', body: p }).then((d) => d.place),
    remove: (id) => request(`/api/saved/${enc(id)}`, { method: 'DELETE' }),
  },
};

const KIND_ICON = {
  restaurant: 'restaurant', fast_food: 'lunch_dining', cafe: 'local_cafe', bar: 'local_bar', pub: 'sports_bar',
  hotel: 'hotel', guest_house: 'hotel', hostel: 'hotel', motel: 'hotel', fuel: 'local_gas_station',
  hospital: 'local_hospital', clinic: 'local_hospital', doctors: 'stethoscope', pharmacy: 'local_pharmacy',
  atm: 'local_atm', bank: 'account_balance', park: 'park', garden: 'park', school: 'school', university: 'school',
  college: 'school', supermarket: 'local_grocery_store', convenience: 'local_grocery_store', mall: 'local_mall',
  aerodrome: 'flight', airport: 'flight', station: 'train', bus_station: 'directions_bus', bus_stop: 'directions_bus',
  museum: 'museum', attraction: 'photo_camera', viewpoint: 'photo_camera', city: 'location_city', town: 'location_city',
  village: 'holiday_village', country: 'flag', state: 'map', administrative: 'map', cinema: 'movie',
  parking: 'local_parking', police: 'local_police', post_office: 'local_post_office', library: 'local_library',
  stadium: 'stadium', zoo: 'pets', beach: 'beach_access', peak: 'landscape', house: 'home', residential: 'home',
};
const kindIcon = (k) => KIND_ICON[k] || 'location_on';

// =====================================================================
// Map & layers
// =====================================================================
const BASES = {
  default: {
    label: 'Default',
    layer: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }),
    thumb: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  },
  satellite: {
    label: 'Satellite',
    layer: L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
      }),
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19 }
      ),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        opacity: 0.7,
      }),
    ]),
    thumb: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  },
  terrain: {
    label: 'Terrain',
    layer: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      subdomains: 'abc',
      attribution: 'Map data &copy; OpenStreetMap contributors, SRTM | Style &copy; OpenTopoMap (CC-BY-SA)',
    }),
    thumb: (z, x, y) => `https://a.tile.opentopomap.org/${Math.min(z, 17)}/${x}/${y}.png`,
  },
  dark: {
    label: 'Dark',
    layer: L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        maxNativeZoom: 16,
        attribution: 'Basemap &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
      }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        maxNativeZoom: 16,
      }),
    ]),
    thumb: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${Math.min(z, 16)}/${y}/${x}`,
  },
};

function parseHash() {
  const m = location.hash.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)z/);
  return m ? { lat: +m[1], lon: +m[2], z: +m[3] } : null;
}

const start = parseHash() || { lat: 20.5937, lon: 78.9629, z: 5 };
const map = L.map('map', { zoomControl: false, worldCopyJump: true, minZoom: 2 }).setView([start.lat, start.lon], start.z);
map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
L.control.scale({ position: 'bottomright' }).addTo(map);

map.createPane('overlayTiles').style.zIndex = 250;
const OVERLAYS = {
  biking: {
    label: 'Biking',
    icon: 'directions_bike',
    layer: L.tileLayer('https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', {
      pane: 'overlayTiles',
      maxZoom: 18,
      attribution: 'Cycle routes &copy; Waymarked Trails',
    }),
  },
  hiking: {
    label: 'Hiking',
    icon: 'hiking',
    layer: L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
      pane: 'overlayTiles',
      maxZoom: 18,
      attribution: 'Hiking routes &copy; Waymarked Trails',
    }),
  },
};

const state = {
  base: 'default',
  place: null,
  back: null,
  dirMode: false,
  measuring: null,
  clickTimer: null,
  clickToken: 0,
  routeToken: 0,
};
const dir = { mode: 'driving', from: null, to: null, results: null, sel: 0 };

BASES.default.layer.addTo(map);

const searchLayer = L.layerGroup().addTo(map);
const nearbyLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
const dirMarkerLayer = L.layerGroup().addTo(map);
const placeLayer = L.layerGroup().addTo(map);
const clickLayer = L.layerGroup().addTo(map);
const meLayer = L.layerGroup().addTo(map);
const measureLayer = L.layerGroup().addTo(map);

const PIN_HTML = (fill = '#ea4335', dot = '#a50e0e', scale = 1) =>
  `<div class="pin"><svg width="${27 * scale}" height="${43 * scale}" viewBox="-1 -1 29 45"><path d="M13.5 0C6 0 0 6 0 13.5 0 23.6 13.5 43 13.5 43S27 23.6 27 13.5C27 6 21 0 13.5 0z" fill="${fill}" stroke="${dot}" stroke-width="1"/><circle cx="13.5" cy="13.5" r="5" fill="${dot}"/></svg></div>`;
const pinIcon = L.divIcon({ className: '', html: PIN_HTML(), iconSize: [27, 43], iconAnchor: [13.5, 43] });
const smallPinIcon = L.divIcon({
  className: '',
  html: PIN_HTML('#ea4335', '#a50e0e', 0.75),
  iconSize: [20, 32],
  iconAnchor: [10, 32],
});
const dotIcon = L.divIcon({ className: '', html: '<div class="result-dot"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
const originIcon = L.divIcon({ className: '', html: '<div class="origin-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
const meIcon = L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
const poiIcon = (icon, color) =>
  L.divIcon({ className: '', html: `<div class="poi" style="--c:${color}">${ms(icon)}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });

// Keep the URL in sync with the view so it can be shared or bookmarked.
map.on('moveend', () => {
  const c = map.getCenter();
  history.replaceState(null, '', `#@${c.lat.toFixed(5)},${c.lng.toFixed(5)},${map.getZoom()}z`);
  updateThumbs();
});

function fitOpts(maxZoom = 17) {
  if (isMobile()) return { maxZoom, paddingTopLeft: [24, 120], paddingBottomRight: [24, innerHeight * 0.6 + 16] };
  const open = document.body.classList.contains('panel-open') && !document.body.classList.contains('panel-collapsed');
  return { maxZoom, paddingTopLeft: [open ? 440 : 40, 80], paddingBottomRight: [70, 40] };
}
const focusPoint = (lat, lon, zoom = 17) => map.fitBounds(L.latLng(lat, lon).toBounds(200), fitOpts(zoom));

// =====================================================================
// Layer switcher
// =====================================================================
function buildLayerSwitcher() {
  const fly = $('#layerFlyout');
  fly.innerHTML =
    Object.entries(BASES)
      .map(([id, b]) => `<button class="layer-opt" data-base="${id}"><span class="opt-img" data-thumb="${id}"></span>${b.label}</button>`)
      .join('') +
    '<span class="flyout-sep"></span>' +
    Object.entries(OVERLAYS)
      .map(([id, o]) => `<button class="layer-opt overlay" data-overlay="${id}"><span class="opt-img">${ms(o.icon)}</span>${o.label}</button>`)
      .join('');

  fly.addEventListener('click', (e) => {
    const b = e.target.closest('.layer-opt');
    if (!b) return;
    if (b.dataset.base) setBase(b.dataset.base);
    if (b.dataset.overlay) {
      const o = OVERLAYS[b.dataset.overlay];
      if (map.hasLayer(o.layer)) map.removeLayer(o.layer);
      else o.layer.addTo(map);
      updateLayerUI();
    }
  });

  $('#layerThumb').addEventListener('click', () => {
    // On touch screens there is no hover, so the first tap opens the options.
    if (matchMedia('(hover: none)').matches && !$('#layers').classList.contains('open')) {
      $('#layers').classList.add('open');
      return;
    }
    $('#layers').classList.remove('open');
    setBase(state.base === 'satellite' ? 'default' : 'satellite');
  });
  updateLayerUI();
  updateThumbs();
}

function setBase(id) {
  if (id === state.base) return;
  map.removeLayer(BASES[state.base].layer);
  BASES[id].layer.addTo(map);
  state.base = id;
  updateLayerUI();
  updateThumbs();
}

function updateLayerUI() {
  $$('.layer-opt[data-base]').forEach((b) => b.classList.toggle('active', b.dataset.base === state.base));
  $$('.layer-opt[data-overlay]').forEach((b) => b.classList.toggle('active', map.hasLayer(OVERLAYS[b.dataset.overlay].layer)));
}

function updateThumbs() {
  const c = map.getCenter();
  const z = Math.max(3, Math.min(16, map.getZoom()));
  const { x, y } = tileXY(c.lat, c.lng, z);
  const alt = state.base === 'satellite' ? 'default' : 'satellite';
  $('#thumbImg').style.backgroundImage = `url('${BASES[alt].thumb(z, x, y)}')`;
  $$('[data-thumb]').forEach((el) => (el.style.backgroundImage = `url('${BASES[el.dataset.thumb].thumb(z, x, y)}')`));
}

// =====================================================================
// Side panel
// =====================================================================
function openPanel(html, { pad = true } = {}) {
  const pc = $('#panelContent');
  pc.innerHTML = html;
  pc.classList.toggle('pad', pad);
  pc.scrollTop = 0;
  document.body.classList.add('panel-open');
  document.body.classList.remove('panel-collapsed');
}
function closePanel() {
  document.body.classList.remove('panel-open', 'panel-collapsed');
  $('#panelContent').innerHTML = '';
}
const loadingHtml = (msg) => `<div class="state"><div class="spinner"></div><p>${msg}</p></div>`;
const emptyHtml = (icon, title, text) => `<div class="state">${ms(icon)}<h3>${title}</h3><p>${text}</p></div>`;

$('#collapseTab').addEventListener('click', () => document.body.classList.toggle('panel-collapsed'));

// =====================================================================
// Autocomplete (used by the main search box and the directions inputs)
// =====================================================================
const MY_LOCATION = { myLocation: true, name: 'Your location', address: '' };

function attachAutocomplete(input, list, onPick, { myLocation = false, onEnter } = {}) {
  let items = [];
  let active = -1;
  let token = 0;

  const render = () => {
    list.innerHTML = items
      .map(
        (it, i) =>
          `<li class="${i === active ? 'active' : ''} ${it.myLocation ? 'my-loc' : ''}" data-i="${i}">${ms(
            it.myLocation ? 'my_location' : kindIcon(it.kind)
          )}<div><b>${esc(it.name)}</b>${it.address ? `<span class="addr">${esc(it.address)}</span>` : ''}</div></li>`
      )
      .join('');
    list.hidden = !items.length;
  };
  const hide = () => {
    items = [];
    active = -1;
    token++;
    list.hidden = true;
  };
  const baseItems = () => (myLocation ? [MY_LOCATION] : []);

  const fetchItems = debounce(async () => {
    const q = input.value.trim();
    const t = ++token;
    if (q.length < 2) {
      items = baseItems();
      active = -1;
      render();
      return;
    }
    try {
      const res = await api.suggest(q, map.getCenter());
      if (t !== token) return;
      items = baseItems().concat(res);
      active = -1;
      render();
    } catch {
      /* ignore suggestion errors */
    }
  }, 250);

  input.addEventListener('input', fetchItems);
  input.addEventListener('focus', () => {
    if (myLocation && !input.value.trim()) {
      items = baseItems();
      render();
    } else if (input.value.trim().length >= 2) fetchItems();
  });
  input.addEventListener('blur', () => setTimeout(hide, 150));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const it = active >= 0 ? items[active] : null;
      hide();
      if (it) onPick(it);
      else onEnter?.(input.value.trim());
      input.blur();
    } else if (e.key === 'Escape') {
      hide();
    } else if (!list.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const n = items.length;
      active = e.key === 'ArrowDown' ? (active + 1) % n : (active - 1 + n) % n;
      render();
    }
  });
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    e.preventDefault();
    const it = items[+li.dataset.i];
    hide();
    input.blur();
    onPick(it);
  });
  return { hide };
}

// =====================================================================
// Search
// =====================================================================
const qInput = $('#q');
const toggleClear = () => {
  $('#clearBtn').hidden = !qInput.value;
  $('#searchBtn').hidden = !!qInput.value;
};
qInput.addEventListener('input', toggleClear);

const mainAC = attachAutocomplete(
  qInput,
  $('#suggest'),
  (p) => {
    state.back = null;
    searchLayer.clearLayers();
    nearbyLayer.clearLayers();
    setActiveChip(null);
    openPlace(p);
  },
  { onEnter: (q) => runSearch(q) }
);

$('#searchBtn').addEventListener('click', () => runSearch(qInput.value.trim()));
$('#clearBtn').addEventListener('click', () => {
  qInput.value = '';
  toggleClear();
  clearAll();
  qInput.focus();
});

function clearAll() {
  [searchLayer, nearbyLayer, placeLayer, clickLayer].forEach((l) => l.clearLayers());
  state.place = null;
  state.back = null;
  setActiveChip(null);
  hideInfoCard();
  closePanel();
}

async function runSearch(q) {
  if (!q) return qInput.focus();
  const m = q.match(coordRe);
  if (m) {
    state.back = null;
    return whatsHere(L.latLng(+m[1], +m[2]), { open: true });
  }
  setActiveChip(null);
  hideInfoCard();
  openPanel(loadingHtml(`Searching for “${esc(q)}”…`));
  try {
    const results = await api.search(q, map.getBounds());
    if (!results.length) {
      openPanel(emptyHtml('search_off', `No results for “${esc(q)}”`, 'Check the spelling or try a different search.'));
      return;
    }
    searchLayer.clearLayers();
    nearbyLayer.clearLayers();
    if (results.length === 1) {
      state.back = null;
      openPlace(results[0]);
      return;
    }
    showResults(q, results, true);
  } catch {
    openPanel(emptyHtml('cloud_off', 'Search failed', 'Check your connection and try again.'));
  }
}

function showResults(q, results, fit) {
  state.back = () => showResults(q, results, false);
  placeLayer.clearLayers();
  searchLayer.clearLayers();
  const markers = results.map((p) =>
    L.marker([p.lat, p.lon], { icon: dotIcon, title: p.name }).on('click', () => openPlace(p)).addTo(searchLayer)
  );
  openPanel(
    `<div class="list-head"><h2>Results</h2><p>${results.length} places for “${esc(q)}”</p></div>` +
      results
        .map(
          (p, i) => `<div class="result" data-i="${i}">
            <div class="r-main"><div class="r-name">${esc(p.name)}</div>
            <div class="r-sub">${esc([p.category, p.address].filter(Boolean).join(' · '))}</div></div>
            <div class="r-thumb" style="background-image:url('${satTile(p.lat, p.lon, 16)}')"></div></div>`
        )
        .join('')
  );
  wireList(results, markers);
  if (fit) map.fitBounds(L.latLngBounds(results.map((p) => [p.lat, p.lon])), fitOpts(15));
}

function wireList(places, markers) {
  $$('#panelContent .result').forEach((el) => {
    const i = +el.dataset.i;
    el.onclick = () => openPlace(places[i]);
    el.onmouseenter = () => markers[i]?.getElement()?.classList.add('hl');
    el.onmouseleave = () => markers[i]?.getElement()?.classList.remove('hl');
  });
}

// =====================================================================
// Place details
// =====================================================================
// Saved places live on the backend (/api/saved); this is a local copy of that list.
let savedPlaces = [];
const sameSpot = (a, b) => a.lat.toFixed(5) === b.lat.toFixed(5) && a.lon.toFixed(5) === b.lon.toFixed(5);
const findSaved = (p) => savedPlaces.find((s) => sameSpot(s, p));
const isSaved = (p) => !!findSaved(p);

async function loadSaved() {
  try {
    savedPlaces = await api.saved.list();
  } catch {
    toast('Could not load saved places from the server');
  }
}

async function toggleSave(p) {
  try {
    const existing = findSaved(p);
    if (existing) {
      await api.saved.remove(existing.id);
      savedPlaces = savedPlaces.filter((s) => s.id !== existing.id);
      toast('Removed from saved places');
    } else {
      const place = await api.saved.add({
        name: p.name.slice(0, 150),
        address: (p.address || '').slice(0, 500),
        category: (p.category || '').slice(0, 100),
        kind: (p.kind || '').slice(0, 60),
        lat: p.lat,
        lon: p.lon,
      });
      savedPlaces = [place, ...savedPlaces.filter((s) => s.id !== place.id)];
      toast('Saved to your places');
    }
  } catch (e) {
    toast(e.message);
  }
}

function isArea(p) {
  if (!p.bbox) return false;
  const [s, n, w, e] = p.bbox;
  return Math.abs(n - s) > 0.004 || Math.abs(e - w) > 0.004;
}

async function openPlace(p, { fly = true } = {}) {
  hideInfoCard();
  clickLayer.clearLayers();
  placeLayer.clearLayers();
  state.place = p;
  L.marker([p.lat, p.lon], { icon: pinIcon, zIndexOffset: 1000, title: p.name }).addTo(placeLayer);
  qInput.value = p.name;
  toggleClear();
  renderPlace(p);
  if (fly) {
    if (isArea(p)) {
      const [s, n, w, e] = p.bbox;
      map.fitBounds([[s, w], [n, e]], fitOpts(17));
    } else focusPoint(p.lat, p.lon, 17);
  }
  // Suggestions arrive without OSM tags (tags === null); fetch website, phone, hours, etc.
  if (p.osm && !p.tags) {
    try {
      const r = await api.lookup(p.osm);
      p.tags = r?.tags || {};
      if (r?.address) p.address = r.address;
      if (state.place === p && !state.dirMode) renderPlace(p);
    } catch {
      p.tags = {};
    }
  }
}

function safeUrl(u) {
  const s = String(u).trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function renderPlace(p) {
  const t = p.tags || {};
  const saved = isSaved(p);
  const row = (icon, html, { cls = '', act = '' } = {}) =>
    `<div class="row ${cls}">${ms(icon)}<div>${html}</div>${act ? ms(act, 'row-act') : ''}</div>`;
  const rows = [];
  if (p.address) rows.push(row('location_on', esc(p.address), { cls: 'clickable copy-addr', act: 'content_copy' }));
  if (t.opening_hours) rows.push(row('schedule', esc(t.opening_hours.replace(/;\s*/g, '; '))));
  const web = t.website || t['contact:website'] || t.url;
  if (web)
    rows.push(
      row('public', `<a href="${esc(safeUrl(web))}" target="_blank" rel="noopener">${esc(web.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''))}</a>`)
    );
  const phone = t.phone || t['contact:phone'];
  if (phone) rows.push(row('call', `<a href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">${esc(phone)}</a>`));
  if (t.cuisine) rows.push(row('restaurant_menu', esc(pretty(t.cuisine.replace(/;/g, ', ')))));
  if (t.wheelchair === 'yes') rows.push(row('accessible', 'Wheelchair accessible entrance'));
  if (t.wikipedia && t.wikipedia.includes(':')) {
    const [lang, ...title] = t.wikipedia.split(':');
    rows.push(
      row('menu_book', `<a href="https://${esc(lang)}.wikipedia.org/wiki/${encodeURIComponent(title.join(':'))}" target="_blank" rel="noopener">Wikipedia</a>`)
    );
  }
  rows.push(row('my_location', fmtLL(p.lat, p.lon), { cls: 'clickable copy-coords', act: 'content_copy' }));

  const color = p.color || '#ea4335';
  const icon = p.icon || kindIcon(p.kind);
  openPanel(
    `<div class="hero" style="background-image:url('${satTile(p.lat, p.lon, 17)}')">
       <span class="hero-icon" style="--c:${color}">${ms(icon, 'filled')}</span></div>
     <div class="place-head">
       ${state.back ? `<button class="back-link" id="backBtn">${ms('arrow_back')} Back to results</button>` : ''}
       <h1>${esc(p.name)}</h1>${p.category ? `<div class="place-cat">${esc(p.category)}</div>` : ''}
     </div>
     <div class="actions">
       <button class="act primary" id="actDir"><span class="circle">${ms('directions', 'filled')}</span>Directions</button>
       <button class="act" id="actSave"><span class="circle">${ms('bookmark', saved ? 'filled' : '')}</span>${saved ? 'Saved' : 'Save'}</button>
       <button class="act" id="actNearby"><span class="circle">${ms('travel_explore')}</span>Nearby</button>
       <button class="act" id="actShare"><span class="circle">${ms('share')}</span>Share</button>
     </div>
     <div class="rows">${rows.join('')}</div>
     <div id="nearbyArea"></div>`,
    { pad: false }
  );

  $('#backBtn')?.addEventListener('click', () => {
    placeLayer.clearLayers();
    state.back();
  });
  $('#actDir').onclick = () => openDirections({ to: { label: p.name, lat: p.lat, lon: p.lon } });
  $('#actSave').onclick = async () => {
    await toggleSave(p);
    if (state.place === p && !state.dirMode) renderPlace(p);
  };
  $('#actShare').onclick = () => copyText(`${location.origin}${location.pathname}#@${p.lat.toFixed(6)},${p.lon.toFixed(6)},17z`, 'Link copied to clipboard');
  $('#actNearby').onclick = () => {
    $('#nearbyArea').innerHTML =
      `<h3 class="section-title">Search nearby ${esc(p.name)}</h3><div class="cat-grid">` +
      CATS.map((c) => `<button class="chip" data-cat="${c.id}" style="--c:${c.color}">${ms(c.icon)}${c.label}</button>`).join('') +
      '</div>';
    $('#nearbyArea').scrollIntoView({ behavior: 'smooth' });
    $$('#nearbyArea .chip').forEach((b) => (b.onclick = () => nearbySearch(CATS.find((c) => c.id === b.dataset.cat), p)));
  };
  $('.copy-coords').onclick = () => copyText(fmtLL(p.lat, p.lon), 'Coordinates copied');
  $('.copy-addr')?.addEventListener('click', () => copyText(p.address, 'Address copied'));
}

// =====================================================================
// Nearby (category chips → Overpass)
// =====================================================================
// Categories ({ id, label, icon, color }) come from the backend.
let CATS = [];

async function buildChips() {
  try {
    CATS = await api.categories();
  } catch {
    return;
  }
  $('#chips').innerHTML = CATS.map(
    (c) => `<button class="chip" data-cat="${c.id}" style="--c:${c.color}">${ms(c.icon)}${c.label}</button>`
  ).join('');
  $('#chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    if (b.classList.contains('active')) return clearAll();
    nearbySearch(CATS.find((c) => c.id === b.dataset.cat));
  });
}
function setActiveChip(id) {
  $$('#chips .chip').forEach((b) => b.classList.toggle('active', b.dataset.cat === id));
}

async function nearbySearch(cat, around) {
  let area;
  if (around) area = `lat=${around.lat.toFixed(6)}&lon=${around.lon.toFixed(6)}&radius=1500`;
  else {
    if (map.getZoom() < 12) {
      toast(`Zoom in to see ${cat.label.toLowerCase()} in this area`);
      return;
    }
    const b = map.getBounds();
    const box = [clampLat(b.getSouth()), clampLon(b.getWest()), clampLat(b.getNorth()), clampLon(b.getEast())];
    area = `bbox=${box.map((n) => n.toFixed(5)).join(',')}`;
  }
  setActiveChip(cat.id);
  hideInfoCard();
  searchLayer.clearLayers();
  placeLayer.clearLayers();
  qInput.value = around ? `${cat.label} near ${around.name}` : cat.label;
  toggleClear();
  openPanel(loadingHtml(`Finding ${cat.label.toLowerCase()}…`));
  try {
    const results = await api.nearby(cat.id, area);
    const center = around ? L.latLng(around.lat, around.lon) : map.getCenter();
    const places = results
      .map((p) => Object.assign(p, { dist: center.distanceTo([p.lat, p.lon]), color: cat.color, icon: cat.icon }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 60);
    showNearby(cat, places, around, true);
  } catch (e) {
    openPanel(emptyHtml('cloud_off', 'Could not load nearby places', esc(e.message || 'Please try again in a moment.')));
  }
}

function showNearby(cat, places, around, fit) {
  state.back = () => showNearby(cat, places, around, false);
  placeLayer.clearLayers();
  nearbyLayer.clearLayers();
  if (!places.length) {
    openPanel(emptyHtml(cat.icon, `No ${cat.label.toLowerCase()} found`, 'Try zooming out or moving the map to another area.'));
    return;
  }
  const markers = places.map((p) =>
    L.marker([p.lat, p.lon], { icon: poiIcon(cat.icon, cat.color), title: p.name }).on('click', () => openPlace(p)).addTo(nearbyLayer)
  );
  openPanel(
    `<div class="list-head"><h2>${cat.label}</h2><p>${places.length} results ${around ? `near ${esc(around.name)}` : 'in this area'}</p></div>` +
      places
        .map((p, i) => {
          const t = p.tags || {};
          const extra = t.opening_hours ? esc(t.opening_hours) : t.cuisine ? esc(pretty(t.cuisine.replace(/;/g, ', '))) : '';
          return `<div class="result" data-i="${i}">
            <span class="r-icon" style="--c:${cat.color}">${ms(cat.icon)}</span>
            <div class="r-main"><div class="r-name">${esc(p.name)}</div>
            <div class="r-sub">${esc([p.category, fmtDist(p.dist), p.address].filter(Boolean).join(' · '))}</div>
            ${extra ? `<div class="r-extra">${extra}</div>` : ''}</div></div>`;
        })
        .join('')
  );
  wireList(places, markers);
  if (fit) map.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lon])), fitOpts(17));
}

// =====================================================================
// Map clicks: info card, "What's here?", context menu
// =====================================================================
function showInfoCard(html, img, onOpen) {
  const c = $('#infoCard');
  c.innerHTML = `${img ? `<div class="ic-img" style="background-image:url('${img}')"></div>` : ''}<div class="ic-body">${html}</div>
    <button class="icon-btn ic-close" title="Close">${ms('close')}</button>`;
  c.hidden = false;
  c.onclick = (e) => {
    if (e.target.closest('.ic-close')) {
      hideInfoCard();
      clickLayer.clearLayers();
      return;
    }
    onOpen?.();
  };
}
const hideInfoCard = () => ($('#infoCard').hidden = true);

const shortAddr = (address, name) =>
  address
    .split(', ')
    .filter((x) => x !== name)
    .slice(0, 3)
    .join(', ');

async function whatsHere(ll, { open = false } = {}) {
  const { lat, lng } = ll;
  clickLayer.clearLayers();
  L.marker(ll, { icon: smallPinIcon }).addTo(clickLayer);
  const img = satTile(lat, lng, 17);
  let place = { name: 'Dropped pin', category: 'Dropped pin', address: '', lat, lon: lng, tags: {}, tagsLoaded: true };
  const card = () =>
    showInfoCard(
      `<div class="ic-title">${esc(place.name)}</div>${place.address ? `<div class="ic-sub">${esc(shortAddr(place.address, place.name))}</div>` : ''}<div class="ic-coords">${fmtLL(lat, lng)}</div>`,
      img,
      () => {
        state.back = null;
        openPlace(place, { fly: false });
      }
    );
  if (open) {
    focusPoint(lat, lng, 16);
  }
  card();
  const token = ++state.clickToken;
  try {
    const zoom = map.getZoom() >= 15 ? 18 : Math.max(map.getZoom() + 3, 5);
    const r = await api.reverse(lat, lng, zoom);
    if (token !== state.clickToken || !r) return;
    place = Object.assign(r, { lat, lon: lng, bbox: null });
    card();
    if (open) openPlace(place, { fly: false });
  } catch {
    /* keep the coordinates-only card */
  }
}

function handleMapClick(ll) {
  if (state.dirMode) {
    const which = !dir.from ? 'from' : !dir.to ? 'to' : null;
    if (which) {
      setDirPoint(which, { label: fmtLL(ll.lat, ll.lng), lat: ll.lat, lon: ll.lng, reverse: true });
      return;
    }
  }
  whatsHere(ll);
}

map.on('click', (e) => {
  hideCtx();
  $('#layers').classList.remove('open');
  if (state.measuring) return addMeasurePoint(e.latlng);
  clearTimeout(state.clickTimer);
  state.clickTimer = setTimeout(() => handleMapClick(e.latlng.wrap()), 260);
});
map.on('dblclick', () => clearTimeout(state.clickTimer));
map.on('movestart', hideCtx);
map.on('dragstart', () => $('#locateBtn').classList.remove('active'));

map.on('contextmenu', (e) => {
  const ll = e.latlng.wrap();
  const m = $('#ctxMenu');
  m.innerHTML = `
    <button data-a="copy" class="ctx-coords">${fmtLL(ll.lat, ll.lng)}</button>
    <button data-a="what">${ms('help')} What's here?</button>
    <button data-a="from">${ms('trip_origin')} Directions from here</button>
    <button data-a="to">${ms('location_on')} Directions to here</button>
    <button data-a="measure">${ms('straighten')} Measure distance</button>
    <button data-a="center">${ms('center_focus_strong')} Centre map here</button>`;
  m.hidden = false;
  const p = e.containerPoint;
  m.style.left = `${Math.min(p.x, innerWidth - m.offsetWidth - 8)}px`;
  m.style.top = `${Math.min(p.y, innerHeight - m.offsetHeight - 8)}px`;
  m.onclick = (ev) => {
    const a = ev.target.closest('button')?.dataset.a;
    if (!a) return;
    hideCtx();
    const pt = { label: fmtLL(ll.lat, ll.lng), lat: ll.lat, lon: ll.lng, reverse: true };
    if (a === 'copy') copyText(fmtLL(ll.lat, ll.lng), 'Coordinates copied');
    if (a === 'what') whatsHere(ll);
    if (a === 'from' || a === 'to') {
      if (!state.dirMode) openDirections();
      setDirPoint(a, pt);
    }
    if (a === 'measure') startMeasure(ll);
    if (a === 'center') map.panTo(ll);
  };
});
function hideCtx() {
  $('#ctxMenu').hidden = true;
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#ctxMenu')) hideCtx();
});

// =====================================================================
// Directions
// =====================================================================
const MODES = [
  { id: 'driving', icon: 'directions_car', label: 'Driving' },
  { id: 'cycling', icon: 'directions_bike', label: 'Cycling' },
  { id: 'walking', icon: 'directions_walk', label: 'Walking' },
];

function openDirections({ from, to } = {}) {
  if (from !== undefined) dir.from = from;
  if (to !== undefined) dir.to = to;
  state.dirMode = true;
  document.body.classList.add('dir-mode');
  hideInfoCard();
  mainAC.hide();
  [clickLayer, placeLayer, searchLayer, nearbyLayer].forEach((l) => l.clearLayers());
  setActiveChip(null);
  openPanel(
    `<div class="dir-head">
      <div class="dir-top">
        <div class="modes">${MODES.map(
          (m) => `<button class="mode ${m.id === dir.mode ? 'active' : ''}" data-mode="${m.id}" title="${m.label}">${ms(m.icon)}<span class="mode-time"></span></button>`
        ).join('')}</div>
        <button class="icon-btn" id="dirClose" title="Close directions">${ms('close')}</button>
      </div>
      <div class="dir-fields">
        <div class="dir-icons"><span class="origin-ico"></span><span class="dir-dots"><i></i><i></i><i></i></span>${ms('location_on', 'dest-ico')}</div>
        <div class="dir-inputs">
          <div class="input-wrap"><input id="dirFrom" placeholder="Choose starting point, or click on the map" autocomplete="off" /><ul class="suggest" hidden></ul></div>
          <div class="input-wrap"><input id="dirTo" placeholder="Choose destination, or click on the map" autocomplete="off" /><ul class="suggest" hidden></ul></div>
        </div>
        <button class="icon-btn" id="dirSwap" title="Reverse starting point and destination">${ms('swap_vert')}</button>
      </div>
    </div>
    <div class="dir-body" id="dirBody"></div>`,
    { pad: false }
  );
  wireDirections();
  updateDirInputs();
  computeRoutes();
  setTimeout(() => {
    if (!dir.from) $('#dirFrom')?.focus();
    else if (!dir.to) $('#dirTo')?.focus();
  }, 60);
}

function closeDirections() {
  state.dirMode = false;
  state.routeToken++;
  dir.from = dir.to = dir.results = null;
  routeLayer.clearLayers();
  dirMarkerLayer.clearLayers();
  document.body.classList.remove('dir-mode');
  closePanel();
}

function wireDirections() {
  $('#dirClose').onclick = closeDirections;
  $('#dirSwap').onclick = () => {
    [dir.from, dir.to] = [dir.to, dir.from];
    updateDirInputs();
    computeRoutes();
  };
  $$('.mode').forEach(
    (b) =>
      (b.onclick = () => {
        dir.mode = b.dataset.mode;
        $$('.mode').forEach((x) => x.classList.toggle('active', x === b));
        dir.sel = 0;
        if (dir.results) showRoutes(true);
        else computeRoutes();
      })
  );
  [
    ['from', '#dirFrom'],
    ['to', '#dirTo'],
  ].forEach(([which, sel]) => {
    const input = $(sel);
    input.addEventListener('input', () => (dir[which] = null));
    attachAutocomplete(
      input,
      input.nextElementSibling,
      async (it) => {
        if (it.myLocation) {
          const pos = await locate({ fly: false });
          if (pos) setDirPoint(which, { label: 'Your location', lat: pos.lat, lon: pos.lon });
          else updateDirInputs();
        } else setDirPoint(which, { label: it.name, lat: it.lat, lon: it.lon });
      },
      {
        myLocation: true,
        onEnter: async (q) => {
          if (!q) return;
          const m = q.match(coordRe);
          if (m) return setDirPoint(which, { label: q, lat: +m[1], lon: +m[2] });
          try {
            const [p] = await api.suggest(q, map.getCenter());
            if (p) setDirPoint(which, { label: p.name, lat: p.lat, lon: p.lon });
            else toast(`Couldn't find “${q}”`);
          } catch {
            toast('Search failed. Check your connection.');
          }
        },
      }
    );
  });
}

function updateDirInputs() {
  if ($('#dirFrom')) $('#dirFrom').value = dir.from?.label || '';
  if ($('#dirTo')) $('#dirTo').value = dir.to?.label || '';
}

function setDirPoint(which, pt) {
  dir[which] = pt;
  updateDirInputs();
  computeRoutes();
  if (pt.reverse) {
    api
      .reverse(pt.lat, pt.lon, 18)
      .then((r) => {
        if (dir[which] === pt && r?.name) {
          pt.label = r.name;
          updateDirInputs();
        }
      })
      .catch(() => {});
  }
}

function drawDirMarkers() {
  dirMarkerLayer.clearLayers();
  [
    ['from', originIcon],
    ['to', pinIcon],
  ].forEach(([which, icon]) => {
    const p = dir[which];
    if (!p) return;
    L.marker([p.lat, p.lon], { icon, draggable: true, zIndexOffset: 900, title: 'Drag to change' })
      .on('dragend', (e) => {
        const ll = e.target.getLatLng();
        setDirPoint(which, { label: fmtLL(ll.lat, ll.lng), lat: ll.lat, lon: ll.lng, reverse: true });
      })
      .addTo(dirMarkerLayer);
  });
}

async function computeRoutes() {
  const body = $('#dirBody');
  if (!body) return;
  const token = ++state.routeToken;
  routeLayer.clearLayers();
  drawDirMarkers();
  dir.results = null;
  $$('.mode-time').forEach((el) => (el.textContent = ''));
  if (!dir.from || !dir.to) {
    body.innerHTML = `<div class="dir-hint">${ms('touch_app')}<div>Choose a starting point and a destination by searching, or by clicking on the map. You can also drag the markers to adjust your route.</div></div>`;
    const p = dir.from || dir.to;
    if (p) focusPoint(p.lat, p.lon, 15);
    return;
  }
  body.innerHTML = loadingHtml('Finding the best routes…');
  const results = await Promise.allSettled(MODES.map((m) => api.route(m.id, dir.from, dir.to)));
  if (token !== state.routeToken) return;
  dir.results = {};
  MODES.forEach((m, i) => {
    const r = results[i];
    const routes = r.status === 'fulfilled' && r.value.length ? r.value : null;
    dir.results[m.id] = routes;
    const el = $(`.mode[data-mode="${m.id}"] .mode-time`);
    if (el) el.textContent = routes ? fmtDur(routes[0].duration) : '';
  });
  dir.sel = 0;
  showRoutes(true);
}

const lineCoords = (r) => r.geometry; // already [lat, lon] pairs from the backend

function drawRoutes(routes, sel, fit) {
  routeLayer.clearLayers();
  const walking = dir.mode === 'walking';
  routes.forEach((r, i) => {
    if (i === sel) return;
    L.polyline(lineCoords(r), {
      color: '#a8c7fa',
      weight: walking ? 6 : 7,
      dashArray: walking ? '0 11' : null,
      lineCap: 'round',
      lineJoin: 'round',
      bubblingMouseEvents: false,
    })
      .on('click', () => {
        dir.sel = i;
        showRoutes(false);
      })
      .addTo(routeLayer);
  });
  const c = lineCoords(routes[sel]);
  if (walking) {
    L.polyline(c, { color: '#1a73e8', weight: 7, dashArray: '0 11', lineCap: 'round', interactive: false }).addTo(routeLayer);
  } else {
    L.polyline(c, { color: '#1558b0', weight: 9, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(routeLayer);
    L.polyline(c, { color: '#4a8af4', weight: 6, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(routeLayer);
  }
  if (fit) map.fitBounds(L.latLngBounds(routes.flatMap(lineCoords)), fitOpts(17));
}

function stepIcon(m) {
  const t = m.type;
  const mod = (m.modifier || '').replace(' ', '_');
  if (t === 'depart') return 'trip_origin';
  if (t === 'arrive') return 'location_on';
  if (/roundabout|rotary/.test(t)) return 'roundabout_right';
  if (t === 'merge') return 'merge';
  if (t === 'fork') return mod.includes('left') ? 'fork_left' : 'fork_right';
  if (t === 'on ramp' || t === 'off ramp') return mod.includes('left') ? 'ramp_left' : 'ramp_right';
  return (
    {
      left: 'turn_left',
      right: 'turn_right',
      slight_left: 'turn_slight_left',
      slight_right: 'turn_slight_right',
      sharp_left: 'turn_sharp_left',
      sharp_right: 'turn_sharp_right',
      uturn: 'u_turn_left',
    }[mod] || 'straight'
  );
}

const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

function stepText(s) {
  const m = s.maneuver;
  const road = s.name || s.ref || '';
  const onto = road ? ` onto <b>${esc(road)}</b>` : '';
  const d = m.modifier === 'uturn' ? 'U-turn' : m.modifier || '';
  switch (m.type) {
    case 'depart':
      return `Head <b>${COMPASS[Math.round((m.bearingAfter || 0) / 45) % 8]}</b>${road ? ` on <b>${esc(road)}</b>` : ''}`;
    case 'arrive':
      return `Arrive at your destination${d && d !== 'straight' ? `, on the ${d}` : ''}`;
    case 'roundabout':
    case 'rotary':
      return `At the roundabout, take the <b>${ordinal(m.exit || 1)}</b> exit${onto}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Exit the roundabout${onto}`;
    case 'merge':
      return `Merge${onto}`;
    case 'fork':
      return `Keep <b>${d}</b> at the fork${onto}`;
    case 'on ramp':
      return `Take the ramp${onto}`;
    case 'off ramp':
      return `Take the exit${onto}`;
    case 'end of road':
      return `At the end of the road, turn <b>${d}</b>${onto}`;
    case 'continue':
    case 'new name':
      if (d === 'U-turn') return `Make a U-turn${onto}`;
      return !d || d === 'straight' ? `Continue${onto || ' straight'}` : `Continue <b>${d}</b>${onto}`;
    default:
      if (d === 'straight') return `Continue straight${onto}`;
      if (d === 'U-turn') return `Make a U-turn${onto}`;
      return `Turn <b>${d}</b>${onto}`;
  }
}

function showRoutes(fit) {
  const body = $('#dirBody');
  if (!body) return;
  const routes = dir.results?.[dir.mode];
  const mode = MODES.find((m) => m.id === dir.mode);
  if (!routes) {
    routeLayer.clearLayers();
    body.innerHTML = emptyHtml('wrong_location', `No ${mode.label.toLowerCase()} route found`, 'Try another travel mode, or move the start or destination.');
    return;
  }
  drawRoutes(routes, dir.sel, fit);
  const best = routes[0].duration;
  const r = routes[dir.sel];
  body.innerHTML =
    routes
      .map(
        (rt, i) => `<div class="route-card ${i === dir.sel ? 'selected' : ''}" data-i="${i}">${ms(mode.icon)}
          <div class="route-main"><div class="route-via">via ${esc(rt.summary || 'the best route')}</div>
          <div class="route-note">${i === 0 ? 'Fastest route' : `${fmtDur(rt.duration - best)} slower`}</div></div>
          <div class="route-time"><b>${fmtDur(rt.duration)}</b><span>${fmtDist(rt.distance)}</span></div></div>`
      )
      .join('') +
    `<div class="steps-head">${ms('format_list_bulleted')} Steps · ${fmtDist(r.distance)} · ${fmtDur(r.duration)}</div>
     <ol class="steps">${r.steps
       .map(
         (s, i) => `<li data-i="${i}">${ms(stepIcon(s.maneuver), 'step-ico')}<div class="step-main">
           <div>${stepText(s)}</div>${s.distance > 0 ? `<div class="step-dist">${fmtDist(s.distance)}</div>` : ''}</div></li>`
       )
       .join('')}</ol>`;
  $$('.route-card', body).forEach(
    (el) =>
      (el.onclick = () => {
        dir.sel = +el.dataset.i;
        showRoutes(false);
      })
  );
  $$('.steps li', body).forEach(
    (el) =>
      (el.onclick = () => {
        const [lat, lon] = r.steps[+el.dataset.i].maneuver.location;
        focusPoint(lat, lon, 18);
      })
  );
}

$('#dirBtn').addEventListener('click', () => {
  const p = state.place;
  openDirections(p ? { to: { label: p.name, lat: p.lat, lon: p.lon } } : {});
});

// =====================================================================
// Your location
// =====================================================================
function getPos() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Geolocation is not supported by this browser'));
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      rej,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

async function locate({ fly = true } = {}) {
  const btn = $('#locateBtn');
  btn.classList.add('busy');
  try {
    const pos = await getPos();
    meLayer.clearLayers();
    L.circle([pos.lat, pos.lon], { radius: pos.acc, color: '#1a73e8', weight: 1, opacity: 0.4, fillOpacity: 0.12, interactive: false }).addTo(meLayer);
    L.marker([pos.lat, pos.lon], { icon: meIcon, zIndexOffset: 800 }).bindTooltip('Your location').addTo(meLayer);
    btn.classList.add('active');
    if (fly) map.flyTo([pos.lat, pos.lon], Math.max(map.getZoom(), 16), { duration: 1.2 });
    return pos;
  } catch (e) {
    toast(`Couldn't get your location${e.message ? `: ${e.message}` : ''}`);
    return null;
  } finally {
    btn.classList.remove('busy');
  }
}

$('#locateBtn').addEventListener('click', () => locate());
$('#zoomIn').addEventListener('click', () => map.zoomIn());
$('#zoomOut').addEventListener('click', () => map.zoomOut());

// =====================================================================
// Measure distance
// =====================================================================
function startMeasure(first) {
  stopMeasure();
  state.measuring = { pts: [], line: null };
  document.body.classList.add('measuring');
  map.doubleClickZoom.disable();
  hideInfoCard();
  $('#measureCard').hidden = false;
  $('#mcText').textContent = 'Click on the map to add to your path';
  if (first) addMeasurePoint(first);
}

function addMeasurePoint(ll) {
  const m = state.measuring;
  m.pts.push(ll);
  L.marker(ll, {
    icon: L.divIcon({ className: '', html: '<div class="measure-pt"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }),
    interactive: false,
  }).addTo(measureLayer);
  if (m.line) measureLayer.removeLayer(m.line);
  m.line = L.polyline(m.pts, { color: '#000', weight: 2.5, interactive: false }).addTo(measureLayer);
  let total = 0;
  for (let i = 1; i < m.pts.length; i++) total += m.pts[i - 1].distanceTo(m.pts[i]);
  $('#mcText').innerHTML =
    m.pts.length > 1
      ? `Total distance: <b>${fmtDist(total)}</b> (${(total / 1609.344).toFixed(2)} mi)`
      : 'Click on the map to add to your path';
}

function stopMeasure() {
  state.measuring = null;
  measureLayer.clearLayers();
  document.body.classList.remove('measuring');
  map.doubleClickZoom.enable();
  $('#measureCard').hidden = true;
}
$('#mcClose').addEventListener('click', stopMeasure);

// =====================================================================
// Drawer menu
// =====================================================================
async function openDrawer() {
  renderSaved();
  await loadSaved();
  renderSaved();
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  $('#scrim').hidden = false;
}
function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $('#scrim').hidden = true;
}
function renderSaved() {
  const saved = savedPlaces;
  $('#savedList').innerHTML = saved.length
    ? saved
        .map(
          (s, i) => `<li data-i="${i}">${ms('star')}<div><b>${esc(s.name)}</b><small>${esc(s.address || fmtLL(s.lat, s.lon))}</small></div>
          <button class="icon-btn" data-remove="${i}" title="Remove">${ms('delete')}</button></li>`
        )
        .join('')
    : '<li class="empty">No saved places yet</li>';
  $$('#savedList li[data-i]').forEach(
    (li) =>
      (li.onclick = (e) => {
        const s = saved[+li.dataset.i];
        if (e.target.closest('[data-remove]')) {
          toggleSave(s).then(renderSaved);
          return;
        }
        closeDrawer();
        state.back = null;
        openPlace({ ...s, tags: {}, osm: null, bbox: null });
      })
  );
}

$('#menuBtn').addEventListener('click', openDrawer);
$('#drawerClose').addEventListener('click', closeDrawer);
$('#scrim').addEventListener('click', closeDrawer);
$('#drawer').addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]')?.dataset.action;
  if (!a) return;
  closeDrawer();
  if (a === 'locate') locate();
  if (a === 'directions') openDirections();
  if (a === 'measure') startMeasure();
  if (a === 'share') copyText(location.href, 'Map link copied to clipboard');
});

// =====================================================================
// Keyboard shortcuts
// =====================================================================
document.addEventListener('keydown', (e) => {
  const typing = /input|textarea/i.test(document.activeElement?.tagName);
  if (e.key === 'Escape') {
    hideCtx();
    closeDrawer();
    if (state.measuring) stopMeasure();
  }
  if (!typing && e.key === '/') {
    e.preventDefault();
    qInput.focus();
  }
});

// =====================================================================
// Boot
// =====================================================================
buildChips();
buildLayerSwitcher();
toggleClear();
loadSaved();
