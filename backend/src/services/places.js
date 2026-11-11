'use strict';
/** Nearby places by category, using the OpenStreetMap Overpass API. */
const config = require('../config');
const TTLCache = require('../lib/cache');
const { fetchJSON, UpstreamError } = require('../lib/http');
const { fromPhoton } = require('./geocoding');

const cache = new TTLCache({ max: 500, ttl: 15 * 60 * 1000 });

/**
 * Public category list. `tags` (OSM key=value pairs) and `keyword` (used by the
 * Photon fallback) stay on the server.
 */
const CATEGORIES = [
  { id: 'restaurants', label: 'Restaurants', icon: 'restaurant', color: '#e8710a', keyword: 'restaurant', tags: ['amenity=restaurant', 'amenity=fast_food'] },
  { id: 'hotels', label: 'Hotels', icon: 'hotel', color: '#d01884', keyword: 'hotel', tags: ['tourism=hotel', 'tourism=guest_house'] },
  { id: 'coffee', label: 'Coffee', icon: 'local_cafe', color: '#b06000', keyword: 'cafe', tags: ['amenity=cafe'] },
  { id: 'fuel', label: 'Petrol', icon: 'local_gas_station', color: '#1a73e8', keyword: 'fuel', tags: ['amenity=fuel'] },
  { id: 'groceries', label: 'Groceries', icon: 'local_grocery_store', color: '#1967d2', keyword: 'supermarket', tags: ['shop=supermarket', 'shop=convenience'] },
  { id: 'hospitals', label: 'Hospitals', icon: 'local_hospital', color: '#d93025', keyword: 'hospital', tags: ['amenity=hospital', 'amenity=clinic'] },
  { id: 'pharmacy', label: 'Pharmacies', icon: 'local_pharmacy', color: '#c5221f', keyword: 'pharmacy', tags: ['amenity=pharmacy'] },
  { id: 'atms', label: 'ATMs', icon: 'local_atm', color: '#188038', keyword: 'atm', tags: ['amenity=atm', 'amenity=bank'] },
  { id: 'parks', label: 'Parks', icon: 'park', color: '#137333', keyword: 'park', tags: ['leisure=park'] },
  { id: 'todo', label: 'Things to do', icon: 'photo_camera', color: '#12a4af', keyword: 'attraction', tags: ['tourism=attraction', 'tourism=museum', 'tourism=viewpoint'] },
];

const publicCategories = () => CATEGORIES.map(({ tags, keyword, ...c }) => c);
const overpassFilter = (tag) => {
  const [k, v] = tag.split('=');
  return `["${k}"="${v}"]`;
};
const findCategory = (id) => CATEGORIES.find((c) => c.id === id) || null;

const pretty = (s) => (s ? String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '');

function fromOverpass(el) {
  const t = el.tags || {};
  const kind = t.amenity || t.tourism || t.leisure || t.shop || '';
  const address = [
    [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '),
    t['addr:suburb'] || t['addr:district'],
    t['addr:city'],
  ]
    .filter(Boolean)
    .join(', ');
  return {
    name: t.name,
    category: pretty(kind),
    kind,
    address,
    lat: el.lat ?? el.center?.lat,
    lon: el.lon ?? el.center?.lon,
    tags: t,
    osm: { type: { node: 'N', way: 'W', relation: 'R' }[el.type] || 'N', id: el.id },
    bbox: null,
  };
}

async function overpass(query) {
  let lastError;
  for (const url of config.overpassUrls) {
    try {
      return await fetchJSON(url, {
        method: 'POST',
        body: new URLSearchParams({ data: query }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 7000,
      });
    } catch (err) {
      lastError = err;
      // A timeout means the servers are overloaded; don't keep the user waiting on the next mirror.
      if (err.status === 504) break;
    }
  }
  throw lastError || new UpstreamError('Places service unavailable');
}

/**
 * @param {object} category  from findCategory()
 * @param {{bbox?:{s:number,w:number,n:number,e:number}, around?:{lat:number,lon:number,radius:number}}} area
 */
/** Great-circle distance in metres. */
function distance(a, b) {
  const R = 6371008.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * @param {object} category  from findCategory()
 * @param {{bbox?:{s:number,w:number,n:number,e:number}, around?:{lat:number,lon:number,radius:number}}} area
 */
async function nearby(category, area) {
  // Overpass answers bounding-box queries much faster than "around" queries,
  // so a radius search becomes the enclosing box, trimmed to the circle afterwards.
  let box = area.bbox;
  if (area.around) {
    const { lat, lon, radius } = area.around;
    const dLat = radius / 111320;
    const dLon = radius / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
    box = { s: Math.max(lat - dLat, -90), n: Math.min(lat + dLat, 90), w: Math.max(lon - dLon, -180), e: Math.min(lon + dLon, 180) };
  }
  const clause = `(${[box.s, box.w, box.n, box.e].map((n) => n.toFixed(4)).join(',')})`;
  const result = await cache.wrap(`${category.id}|${clause}`, async () => {
    // Public Overpass servers are often overloaded. Photon is fast but text-matched (fewer places),
    // so it is queried in parallel and only used when Overpass fails.
    const photon = photonNearby(category, box).catch(() => null);
    try {
      const query = `[out:json][timeout:7];(${category.tags.map((t) => `nwr${overpassFilter(t)}${clause};`).join('')});out center tags 150;`;
      const data = await overpass(query);
      const places = (data.elements || [])
        .map(fromOverpass)
        .filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lon));
      return { source: 'overpass', places };
    } catch (err) {
      const fallback = await photon;
      if (!fallback) throw err;
      console.warn(`[places] Overpass failed (${err.message}); using Photon results`);
      return { source: 'photon', places: fallback };
    }
  });
  if (result.source === 'photon') cache.set(`${category.id}|${clause}`, result, 2 * 60 * 1000);
  const places = area.around ? result.places.filter((p) => distance(area.around, p) <= area.around.radius) : result.places;
  return { source: result.source, places };
}

async function photonNearby(category, box) {
  const tagParams = category.tags.map((t) => `&osm_tag=${encodeURIComponent(t.replace('=', ':'))}`).join('');
  const bbox = [box.w, box.s, box.e, box.n].map((n) => n.toFixed(4)).join(',');
  const data = await fetchJSON(`${config.photonUrl}/api/?q=${encodeURIComponent(category.keyword)}&limit=50&lang=en&bbox=${bbox}${tagParams}`);
  return (data.features || []).map(fromPhoton).filter((p) => p.name && p.name !== 'Unnamed place');
}

module.exports = { publicCategories, findCategory, nearby };
