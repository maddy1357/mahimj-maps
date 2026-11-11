/* MahimJ Maps – interactive 2D web map powered by Leaflet.
 * Free, key-less services:
 *   - Map tiles: OpenStreetMap, Esri World Imagery, OpenTopoMap, CARTO
 *   - Search & reverse geocoding: OpenStreetMap Nominatim
 *   - Directions: OSRM public routing server
 */

const $ = (sel) => document.querySelector(sel);

// ---------- Map & base layers ----------
const layers = {
  Streets: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }),
  Satellite: L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
    }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
    }),
  ]),
  Terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'Map data &copy; OpenStreetMap contributors, SRTM | Style &copy; OpenTopoMap',
  }),
  Dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  }),
};

const map = L.map('map', {
  center: [20.5937, 78.9629],
  zoom: 5,
  layers: [layers.Streets],
  zoomControl: false,
});

L.control.zoom({ position: 'bottomright' }).addTo(map);
L.control.layers(layers, null, { position: 'topright' }).addTo(map);
L.control.scale({ position: 'bottomleft' }).addTo(map);

// "Locate me" control
const LocateControl = L.Control.extend({
  options: { position: 'bottomright' },
  onAdd() {
    const btn = L.DomUtil.create('a', 'leaflet-bar');
    btn.href = '#';
    btn.title = 'Show my location';
    btn.innerHTML = '◎';
    Object.assign(btn.style, {
      width: '34px', height: '34px', lineHeight: '34px', textAlign: 'center',
      fontSize: '20px', background: '#fff', color: '#1a73e8', display: 'block',
    });
    L.DomEvent.on(btn, 'click', (e) => {
      L.DomEvent.stop(e);
      locateMe();
    });
    return btn;
  },
});
new LocateControl().addTo(map);

// ---------- Helpers ----------
function pinIcon(color, label = '') {
  return L.divIcon({
    className: '',
    html: `<div class="pin" style="background:${color}"><span>${label}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -26],
  });
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function formatDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 100000 ? 0 : 1)} km` : `${Math.round(m)} m`;
}

function formatDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

async function geocode(query, limit = 6) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=${limit}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  return res.json();
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Reverse geocoding failed (${res.status})`);
  return res.json();
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      reject,
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// ---------- Panel & tabs ----------
$('#togglePanel').addEventListener('click', () => {
  const panel = $('#panel');
  panel.classList.toggle('collapsed');
  $('#togglePanel').textContent = panel.classList.contains('collapsed') ? '+' : '−';
});

function showTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${name}`));
}
document.querySelector('.tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (btn) showTab(btn.dataset.tab);
});

// ---------- Search ----------
const searchLayer = L.layerGroup().addTo(map);
const resultsEl = $('#searchResults');
const placeCard = $('#placeCard');

function showPlace(lat, lon, title, address) {
  searchLayer.clearLayers();
  L.marker([lat, lon], { icon: pinIcon('#dc2626') })
    .addTo(searchLayer)
    .bindPopup(`<b>${escapeHtml(title)}</b><br>${escapeHtml(address)}`)
    .openPopup();

  placeCard.classList.remove('hidden');
  placeCard.innerHTML = `
    <h3>${escapeHtml(title)}</h3>
    <div class="muted">${escapeHtml(address)}</div>
    <div class="muted">${lat.toFixed(5)}, ${lon.toFixed(5)}</div>
    <div class="actions">
      <button class="primary" id="directionsHere">Directions</button>
      <button id="copyCoords">Copy coordinates</button>
    </div>`;
  $('#directionsHere').onclick = () => {
    $('#toInput').value = address || `${lat}, ${lon}`;
    $('#toInput').dataset.lat = lat;
    $('#toInput').dataset.lon = lon;
    showTab('directions');
    $('#fromInput').focus();
  };
  $('#copyCoords').onclick = async () => {
    try {
      await navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
      $('#copyCoords').textContent = 'Copied!';
    } catch {
      $('#copyCoords').textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    }
  };
}

$('#searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#searchInput').value.trim();
  if (!q) return;
  resultsEl.innerHTML = '<li>Searching…</li>';
  placeCard.classList.add('hidden');
  try {
    const places = await geocode(q);
    resultsEl.innerHTML = '';
    if (!places.length) {
      resultsEl.innerHTML = '<li>No results found</li>';
      return;
    }
    places.forEach((p) => {
      const li = document.createElement('li');
      const title = p.name || p.display_name.split(',')[0];
      li.innerHTML = `<b>${escapeHtml(title)}</b><span>${escapeHtml(p.display_name)}</span>`;
      li.addEventListener('click', () => {
        const lat = parseFloat(p.lat);
        const lon = parseFloat(p.lon);
        const [s, n, w, ea] = p.boundingbox.map(Number);
        map.fitBounds([[s, w], [n, ea]], { maxZoom: 17 });
        showPlace(lat, lon, title, p.display_name);
        resultsEl.innerHTML = '';
      });
      resultsEl.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    resultsEl.innerHTML = '<li>Search failed – check your connection</li>';
  }
});

// ---------- Click on map → reverse geocode ----------
map.on('click', async (e) => {
  const { lat, lng } = e.latlng;
  $('#coords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)} – looking up address…`;
  try {
    const r = await reverseGeocode(lat, lng);
    const title = r.name || (r.address && (r.address.road || r.address.suburb || r.address.city)) || 'Dropped pin';
    showTab('search');
    showPlace(lat, lng, title, r.display_name || '');
    $('#coords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    showPlace(lat, lng, 'Dropped pin', '');
    $('#coords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
});

map.on('mousemove', (e) => {
  if (!$('#coords').textContent.includes('looking up')) {
    $('#coords').textContent = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)} · zoom ${map.getZoom()}`;
  }
});

// ---------- My location ----------
const meLayer = L.layerGroup().addTo(map);
let myPosition = null;

async function locateMe() {
  try {
    const pos = await getCurrentPosition();
    myPosition = pos;
    meLayer.clearLayers();
    L.circle([pos.lat, pos.lon], { radius: pos.accuracy, color: '#1a73e8', weight: 1, fillOpacity: 0.1 }).addTo(meLayer);
    L.marker([pos.lat, pos.lon], {
      icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
    })
      .addTo(meLayer)
      .bindPopup('You are here');
    map.setView([pos.lat, pos.lon], 16);
    return pos;
  } catch (err) {
    alert(`Could not get your location: ${err.message}`);
    return null;
  }
}

// ---------- Directions (OSRM) ----------
const routeLayer = L.layerGroup().addTo(map);

$('#fromMe').addEventListener('click', async () => {
  const pos = await locateMe();
  if (pos) {
    $('#fromInput').value = 'My location';
    $('#fromInput').dataset.lat = pos.lat;
    $('#fromInput').dataset.lon = pos.lon;
  }
});

$('#swapBtn').addEventListener('click', () => {
  const a = $('#fromInput');
  const b = $('#toInput');
  [a.value, b.value] = [b.value, a.value];
  const [la, lo] = [a.dataset.lat, a.dataset.lon];
  setCoords(a, b.dataset.lat, b.dataset.lon);
  setCoords(b, la, lo);
});

function setCoords(input, lat, lon) {
  if (lat === undefined) {
    delete input.dataset.lat;
    delete input.dataset.lon;
  } else {
    input.dataset.lat = lat;
    input.dataset.lon = lon;
  }
}

// Typing in a field invalidates any coordinates stored from earlier picks.
['#fromInput', '#toInput'].forEach((sel) =>
  $(sel).addEventListener('input', (e) => setCoords(e.target, undefined))
);

async function resolveInput(input) {
  if (input.dataset.lat) return { lat: +input.dataset.lat, lon: +input.dataset.lon };
  const value = input.value.trim();
  if (!value) throw new Error('Please fill in both start and destination.');
  const coordMatch = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (coordMatch) return { lat: +coordMatch[1], lon: +coordMatch[2] };
  const [first] = await geocode(value, 1);
  if (!first) throw new Error(`Could not find "${value}".`);
  return { lat: +first.lat, lon: +first.lon };
}

const MANEUVER = {
  'turn-left': '↰', 'turn-right': '↱', 'turn-slight left': '↖', 'turn-slight right': '↗',
  'turn-sharp left': '↰', 'turn-sharp right': '↱', 'turn-uturn': '↶',
  depart: '🚗', arrive: '🏁', roundabout: '⟳', rotary: '⟳', merge: '⤵', fork: '⑂',
};

function describeStep(step) {
  const m = step.maneuver;
  const icon = MANEUVER[`${m.type}-${m.modifier}`] || MANEUVER[m.type] || '↑';
  const road = step.name ? ` onto <b>${escapeHtml(step.name)}</b>` : '';
  let text;
  switch (m.type) {
    case 'depart': text = `Head ${m.modifier || ''}${road}`; break;
    case 'arrive': text = 'Arrive at your destination'; break;
    case 'roundabout':
    case 'rotary': text = `Enter the roundabout, take exit ${m.exit || ''}${road}`; break;
    case 'continue':
    case 'new name': text = `Continue${road}`; break;
    default: text = `${m.type.charAt(0).toUpperCase() + m.type.slice(1)} ${m.modifier || ''}${road}`;
  }
  return `${icon} ${text}`;
}

$('#routeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const summary = $('#routeSummary');
  const stepsEl = $('#routeSteps');
  summary.classList.remove('hidden');
  summary.innerHTML = 'Finding the best route…';
  stepsEl.innerHTML = '';
  try {
    const from = await resolveInput($('#fromInput'));
    const to = await resolveInput($('#toInput'));
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes.length) throw new Error('No route found between these places.');

    const route = data.routes[0];
    routeLayer.clearLayers();
    const coords = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    L.polyline(coords, { color: '#1a73e8', weight: 7, opacity: 0.85 }).addTo(routeLayer);
    L.marker([from.lat, from.lon], { icon: pinIcon('#16a34a', 'A') }).addTo(routeLayer);
    L.marker([to.lat, to.lon], { icon: pinIcon('#dc2626', 'B') }).addTo(routeLayer);
    map.fitBounds(L.latLngBounds(coords), { padding: [40, 40] });

    summary.innerHTML = `
      <div class="big">${formatDuration(route.duration)}</div>
      <div class="muted">${formatDistance(route.distance)} · by car</div>`;

    route.legs[0].steps.forEach((step) => {
      const li = document.createElement('li');
      li.innerHTML = `${describeStep(step)}<small>${formatDistance(step.distance)}</small>`;
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => {
        const [lon, lat] = step.maneuver.location;
        map.setView([lat, lon], 17);
      });
      stepsEl.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    summary.innerHTML = `<span style="color:#dc2626">${escapeHtml(err.message)}</span>`;
  }
});
