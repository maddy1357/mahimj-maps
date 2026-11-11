'use strict';
/**
 * Geocoding via OpenStreetMap services:
 *   - Photon: fast search-as-you-type suggestions
 *   - Nominatim: full search, reverse geocoding and place details
 * Every result is normalised to one "place" shape and cached.
 */
const config = require('../config');
const TTLCache = require('../lib/cache');
const { fetchJSON, throttle } = require('../lib/http');

const DAY = 24 * 60 * 60 * 1000;
const cache = new TTLCache({ max: 2000, ttl: DAY });
const suggestCache = new TTLCache({ max: 3000, ttl: 6 * 60 * 60 * 1000 });

// Nominatim allows at most 1 request per second.
const nominatimSlot = throttle(1100);
const nominatim = (pathAndQuery) =>
  nominatimSlot(() => fetchJSON(`${config.nominatimUrl}${pathAndQuery}`, { headers: { 'Accept-Language': 'en' } }));

const OSM_TYPE = { node: 'N', way: 'W', relation: 'R', N: 'N', W: 'W', R: 'R' };
const pretty = (s) => (s ? String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '');

/**
 * @typedef {object} Place
 * @property {string} name
 * @property {string} category  Human readable type, e.g. "Restaurant"
 * @property {string} kind      Raw OSM type, e.g. "restaurant"
 * @property {string} address
 * @property {number} lat
 * @property {number} lon
 * @property {object|null} tags  Extra OSM tags (website, phone, opening_hours, wikipedia…); null if not loaded
 * @property {{type:string,id:number}|null} osm
 * @property {number[]|null} bbox [south, north, west, east]
 */

function fromNominatim(r) {
  const a = r.address || {};
  const kind = r.type === 'yes' ? r.category : r.type;
  const street = a.road ? (a.house_number ? `${a.house_number} ${a.road}` : a.road) : '';
  return {
    name:
      r.name || street || a.suburb || a.city || a.town || a.village || (r.display_name || '').split(',')[0] || 'Unnamed place',
    category: pretty(kind),
    kind: kind || '',
    address: r.display_name || '',
    lat: Number(r.lat),
    lon: Number(r.lon),
    tags: r.extratags || {},
    osm: r.osm_type && r.osm_id ? { type: OSM_TYPE[r.osm_type] || 'N', id: Number(r.osm_id) } : null,
    bbox: Array.isArray(r.boundingbox) ? r.boundingbox.map(Number) : null,
  };
}

function fromPhoton(feature) {
  const p = feature.properties || {};
  const [lon, lat] = feature.geometry.coordinates;
  const street = p.street ? (p.housenumber ? `${p.housenumber} ${p.street}` : p.street) : '';
  const name = p.name || street || p.city || p.state || p.country || 'Unnamed place';
  const parts = [street, p.district || p.locality, p.city, p.state, p.country].filter((x) => x && x !== name);
  return {
    name,
    category: pretty(p.osm_value),
    kind: p.osm_value || '',
    address: [...new Set(parts)].join(', '),
    lat,
    lon,
    tags: null, // Photon has no extra tags; clients can call /api/lookup for details.
    osm: p.osm_type && p.osm_id ? { type: OSM_TYPE[p.osm_type] || 'N', id: Number(p.osm_id) } : null,
    // Photon extent is [minLon, maxLat, maxLon, minLat].
    bbox: Array.isArray(p.extent) ? [p.extent[3], p.extent[1], p.extent[0], p.extent[2]] : null,
  };
}

async function suggest(q, near) {
  const bias = near ? `&lat=${near.lat.toFixed(2)}&lon=${near.lon.toFixed(2)}` : '';
  const key = `${q.toLowerCase()}|${bias}`;
  return suggestCache.wrap(key, async () => {
    const data = await fetchJSON(`${config.photonUrl}/api/?q=${encodeURIComponent(q)}&limit=6&lang=en${bias}`);
    return (data.features || []).map(fromPhoton);
  });
}

async function search(q, viewbox) {
  const vb = viewbox ? `&viewbox=${viewbox.map((n) => n.toFixed(4)).join(',')}` : '';
  const key = `search|${q.toLowerCase()}|${vb}`;
  return cache.wrap(key, async () => {
    const rows = await nominatim(`/search?format=jsonv2&addressdetails=1&extratags=1&limit=10&q=${encodeURIComponent(q)}${vb}`);
    return rows.map(fromNominatim);
  });
}

async function reverse(lat, lon, zoom = 18) {
  const key = `rev|${lat.toFixed(5)}|${lon.toFixed(5)}|${zoom}`;
  return cache.wrap(key, async () => {
    const r = await nominatim(`/reverse?format=jsonv2&addressdetails=1&extratags=1&zoom=${zoom}&lat=${lat}&lon=${lon}`);
    return r && !r.error ? fromNominatim(r) : null;
  });
}

async function lookup(type, id) {
  return cache.wrap(`lookup|${type}${id}`, async () => {
    const rows = await nominatim(`/lookup?format=jsonv2&addressdetails=1&extratags=1&osm_ids=${type}${id}`);
    return rows[0] ? fromNominatim(rows[0]) : null;
  });
}

module.exports = { suggest, search, reverse, lookup, fromNominatim, fromPhoton };
