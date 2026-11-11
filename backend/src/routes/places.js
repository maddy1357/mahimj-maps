'use strict';
/** Nearby & directions endpoints: /api/categories, /api/nearby, /api/route */
const express = require('express');
const places = require('../services/places');
const routing = require('../services/routing');
const v = require('../lib/validate');

const router = express.Router();
const MAX_BBOX_DEG = 1; // keeps Overpass queries small (roughly city-sized)

// GET /api/categories
router.get('/categories', (req, res) => {
  res.json({ categories: places.publicCategories() });
});

// GET /api/nearby?category=coffee&bbox=south,west,north,east
// GET /api/nearby?category=coffee&lat=13.08&lon=80.27&radius=1500
router.get(
  '/nearby',
  v.asyncHandler(async (req, res) => {
    const category = places.findCategory(req.query.category);
    if (!category) {
      throw v.badRequest(`"category" must be one of: ${places.publicCategories().map((c) => c.id).join(', ')}`);
    }
    let area;
    if (req.query.bbox) {
      const parts = String(req.query.bbox).split(',');
      if (parts.length !== 4) throw v.badRequest('"bbox" must be "south,west,north,east"');
      const [s, w, n, e] = [v.lat(parts[0], 'bbox'), v.lon(parts[1], 'bbox'), v.lat(parts[2], 'bbox'), v.lon(parts[3], 'bbox')];
      if (n <= s || e <= w) throw v.badRequest('"bbox" south/west must be smaller than north/east');
      if (n - s > MAX_BBOX_DEG || e - w > MAX_BBOX_DEG) throw v.badRequest('Area too large. Zoom in to search nearby places.');
      area = { bbox: { s, w, n, e } };
    } else {
      area = {
        around: {
          lat: v.lat(req.query.lat),
          lon: v.lon(req.query.lon),
          radius: v.number(req.query.radius, 'radius', { min: 50, max: 10000, optional: true, fallback: 1500 }),
        },
      };
    }
    const { source, places: results } = await places.nearby(category, area);
    res.json({ category: places.publicCategories().find((c) => c.id === category.id), source, results });
  })
);

// GET /api/route?mode=driving&from=13.08,80.27&to=12.97,77.59
router.get(
  '/route',
  v.asyncHandler(async (req, res) => {
    const mode = v.oneOf(req.query.mode, 'mode', routing.MODES, 'driving');
    const from = v.latLon(req.query.from, 'from');
    const to = v.latLon(req.query.to, 'to');
    const routes = await routing.route(mode, from, to);
    if (!routes.length) throw new v.HttpError(404, `No ${mode} route found between these points`);
    res.json({ mode, routes });
  })
);

module.exports = router;
