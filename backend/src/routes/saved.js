'use strict';
/** Saved places REST API: /api/saved */
const path = require('path');
const express = require('express');
const config = require('../config');
const JsonStore = require('../lib/store');
const v = require('../lib/validate');

function createSavedRouter(store = new JsonStore(path.join(config.dataDir, 'saved-places.json'))) {
  const router = express.Router();

  const parse = (body, { partial = false } = {}) => {
    if (!body || typeof body !== 'object') throw v.badRequest('Request body must be a JSON object');
    const out = {};
    if (!partial || body.name !== undefined) out.name = v.string(body.name, 'name', { max: 150 });
    if (!partial || body.note !== undefined) out.note = v.string(body.note, 'note', { max: 500, optional: true });
    if (!partial) {
      out.address = v.string(body.address, 'address', { max: 500, optional: true });
      out.category = v.string(body.category, 'category', { max: 100, optional: true });
      out.kind = v.string(body.kind, 'kind', { max: 60, optional: true });
      out.lat = v.lat(body.lat);
      out.lon = v.lon(body.lon);
    }
    return out;
  };

  // GET /api/saved
  router.get(
    '/',
    v.asyncHandler(async (req, res) => {
      res.json({ places: await store.all() });
    })
  );

  // POST /api/saved  { name, lat, lon, address?, category?, kind?, note? }
  router.post(
    '/',
    v.asyncHandler(async (req, res) => {
      const data = parse(req.body);
      const existing = (await store.all()).find((p) => p.lat.toFixed(5) === data.lat.toFixed(5) && p.lon.toFixed(5) === data.lon.toFixed(5));
      if (existing) return res.status(200).json({ place: existing });
      if ((await store.count()) >= config.maxSavedPlaces) {
        throw new v.HttpError(409, `You can save up to ${config.maxSavedPlaces} places. Remove some first.`);
      }
      res.status(201).json({ place: await store.insert(data) });
    })
  );

  // PATCH /api/saved/:id  { name?, note? }
  router.patch(
    '/:id',
    v.asyncHandler(async (req, res) => {
      const place = await store.update(req.params.id, parse(req.body, { partial: true }));
      if (!place) throw new v.HttpError(404, 'Saved place not found');
      res.json({ place });
    })
  );

  // DELETE /api/saved/:id
  router.delete(
    '/:id',
    v.asyncHandler(async (req, res) => {
      if (!(await store.remove(req.params.id))) throw new v.HttpError(404, 'Saved place not found');
      res.status(204).end();
    })
  );

  return router;
}

module.exports = createSavedRouter;
