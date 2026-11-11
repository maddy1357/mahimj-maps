'use strict';
/** Geocoding endpoints: /api/suggest, /api/search, /api/reverse, /api/lookup */
const express = require('express');
const geocoding = require('../services/geocoding');
const v = require('../lib/validate');

const router = express.Router();

// GET /api/suggest?q=taj&lat=27.1&lon=78.0  → search-as-you-type suggestions
router.get(
  '/suggest',
  v.asyncHandler(async (req, res) => {
    const q = v.string(req.query.q, 'q', { min: 2, max: 200 });
    const hasBias = req.query.lat !== undefined && req.query.lon !== undefined;
    const near = hasBias ? { lat: v.lat(req.query.lat), lon: v.lon(req.query.lon) } : null;
    res.json({ results: await geocoding.suggest(q, near) });
  })
);

// GET /api/search?q=eiffel tower&viewbox=west,north,east,south  → full search
router.get(
  '/search',
  v.asyncHandler(async (req, res) => {
    const q = v.string(req.query.q, 'q', { min: 1, max: 200 });
    let viewbox = null;
    if (req.query.viewbox) {
      const parts = String(req.query.viewbox).split(',');
      if (parts.length !== 4) throw v.badRequest('"viewbox" must be "west,north,east,south"');
      viewbox = [v.lon(parts[0], 'viewbox'), v.lat(parts[1], 'viewbox'), v.lon(parts[2], 'viewbox'), v.lat(parts[3], 'viewbox')];
    }
    res.json({ results: await geocoding.search(q, viewbox) });
  })
);

// GET /api/reverse?lat=27.17&lon=78.04&zoom=18  → what is at this point?
router.get(
  '/reverse',
  v.asyncHandler(async (req, res) => {
    const lat = v.lat(req.query.lat);
    const lon = v.lon(req.query.lon);
    const zoom = Math.round(v.number(req.query.zoom, 'zoom', { min: 3, max: 18, optional: true, fallback: 18 }));
    const place = await geocoding.reverse(lat, lon, zoom);
    if (!place) throw new v.HttpError(404, 'Nothing found at this location');
    res.json({ place });
  })
);

// GET /api/lookup?osm=N123456  → details (website, phone, hours, wikipedia…) for an OSM object
router.get(
  '/lookup',
  v.asyncHandler(async (req, res) => {
    const m = String(req.query.osm || '').match(/^([NWR])(\d{1,12})$/);
    if (!m) throw v.badRequest('"osm" must look like N123, W123 or R123');
    const place = await geocoding.lookup(m[1], Number(m[2]));
    if (!place) throw new v.HttpError(404, 'Place not found');
    res.json({ place });
  })
);

module.exports = router;
