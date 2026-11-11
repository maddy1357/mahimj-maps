'use strict';
/** Driving, cycling and walking directions from the OSRM servers run by FOSSGIS. */
const config = require('../config');
const TTLCache = require('../lib/cache');
const { fetchJSON } = require('../lib/http');

const cache = new TTLCache({ max: 500, ttl: 60 * 60 * 1000 });
const PROFILES = { driving: 'routed-car', cycling: 'routed-bike', walking: 'routed-foot' };
const MODES = Object.keys(PROFILES);

const round6 = (n) => Math.round(n * 1e6) / 1e6;

function normaliseRoute(r) {
  const leg = r.legs[0] || { steps: [], summary: '' };
  return {
    duration: r.duration,
    distance: r.distance,
    summary: leg.summary || '',
    // [lat, lon] pairs, ready for Leaflet.
    geometry: r.geometry.coordinates.map(([lon, lat]) => [round6(lat), round6(lon)]),
    steps: leg.steps.map((s) => ({
      name: s.name || '',
      ref: s.ref || '',
      distance: s.distance,
      duration: s.duration,
      maneuver: {
        type: s.maneuver.type,
        modifier: s.maneuver.modifier || '',
        exit: s.maneuver.exit ?? null,
        bearingAfter: s.maneuver.bearing_after ?? 0,
        location: [round6(s.maneuver.location[1]), round6(s.maneuver.location[0])],
      },
    })),
  };
}

/** Returns up to 3 alternative routes (fastest first); [] when no route exists. */
async function route(mode, from, to) {
  const coords = `${from.lon.toFixed(6)},${from.lat.toFixed(6)};${to.lon.toFixed(6)},${to.lat.toFixed(6)}`;
  return cache.wrap(`${mode}|${coords}`, async () => {
    const url = `${config.osrmUrl}/${PROFILES[mode]}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&alternatives=true`;
    // OSRM answers 400 with code "NoRoute"/"NoSegment" when points are unreachable.
    const data = await fetchJSON(url, { timeout: 20000, allowStatus: [400] });
    if (data.code !== 'Ok' || !Array.isArray(data.routes)) return [];
    return data.routes.map(normaliseRoute);
  });
}

module.exports = { route, MODES };
