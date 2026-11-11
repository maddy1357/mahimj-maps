'use strict';
const path = require('path');
const pkg = require('../../package.json');

const ROOT = path.resolve(__dirname, '..', '..');
const env = process.env;
const list = (v, fallback) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : fallback);

/** Central configuration. Every value can be overridden with an environment variable. */
module.exports = {
  appName: 'MahimJ Maps',
  version: pkg.version,
  port: Number(env.PORT) || 3001,
  frontendDir: path.join(ROOT, 'frontend'),
  dataDir: env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(ROOT, 'data'),

  // Identifies this app to the public OpenStreetMap services, as their usage policies require.
  userAgent: env.USER_AGENT || `MahimJ-Maps/${pkg.version} (+https://github.com/maddy1357/mahimj-maps)`,
  nominatimUrl: env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org',
  photonUrl: env.PHOTON_URL || 'https://photon.komoot.io',
  overpassUrls: list(env.OVERPASS_URLS, ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']),
  osrmUrl: env.OSRM_URL || 'https://routing.openstreetmap.de',

  rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MIN) || 120,
  maxSavedPlaces: Number(env.MAX_SAVED_PLACES) || 500,
};
