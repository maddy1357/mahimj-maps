'use strict';
/* API tests that need no internet access: health, validation, categories and the saved places CRUD. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mahimj-maps-test-'));
const { createApp } = require('../src/app');

let server;
let base;

before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

const call = async (method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

test('health check reports ok', async () => {
  const r = await call('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.app, 'MahimJ Maps');
});

test('serves the frontend', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /MahimJ Maps/);
});

test('unknown API route returns JSON 404', async () => {
  const r = await call('GET', '/api/nope');
  assert.equal(r.status, 404);
  assert.ok(r.body.error);
});

test('categories hide server-side query filters', async () => {
  const r = await call('GET', '/api/categories');
  assert.equal(r.status, 200);
  assert.ok(r.body.categories.length >= 8);
  for (const c of r.body.categories) {
    assert.ok(c.id && c.label && c.icon && c.color);
    assert.equal(c.filters, undefined);
  }
});

test('nearby validates category and area', async () => {
  assert.equal((await call('GET', '/api/nearby?category=unknown&lat=1&lon=1')).status, 400);
  assert.equal((await call('GET', '/api/nearby?category=coffee')).status, 400);
  assert.equal((await call('GET', '/api/nearby?category=coffee&bbox=10,10,15,15')).status, 400); // too large
  assert.equal((await call('GET', '/api/nearby?category=coffee&bbox=10,10,9,11')).status, 400); // inverted
  assert.equal((await call('GET', '/api/nearby?category=coffee&lat=10&lon=10&radius=999999')).status, 400);
});

test('route validates mode and points', async () => {
  assert.equal((await call('GET', '/api/route?mode=flying&from=1,1&to=2,2')).status, 400);
  assert.equal((await call('GET', '/api/route?from=1,1')).status, 400);
  assert.equal((await call('GET', '/api/route?from=91,1&to=2,2')).status, 400);
  assert.equal((await call('GET', '/api/route?from=abc&to=2,2')).status, 400);
});

test('geocoding endpoints validate input', async () => {
  assert.equal((await call('GET', '/api/suggest?q=x')).status, 400);
  assert.equal((await call('GET', '/api/search?q=')).status, 400);
  assert.equal((await call('GET', '/api/search?q=cafe&viewbox=1,2,3')).status, 400);
  assert.equal((await call('GET', '/api/reverse?lat=1&lon=500')).status, 400);
  assert.equal((await call('GET', '/api/lookup?osm=123')).status, 400);
});

test('saved places CRUD with de-duplication', async () => {
  assert.equal((await call('POST', '/api/saved', { name: '', lat: 1, lon: 1 })).status, 400);
  assert.equal((await call('POST', '/api/saved', { name: 'X', lat: 1 })).status, 400);

  const body = { name: 'Marina Beach', address: 'Chennai, India', category: 'Beach', kind: 'beach', lat: 13.0500, lon: 80.2824 };
  const created = await call('POST', '/api/saved', body);
  assert.equal(created.status, 201);
  const id = created.body.place.id;

  const dup = await call('POST', '/api/saved', body);
  assert.equal(dup.status, 200);
  assert.equal(dup.body.place.id, id);

  const patched = await call('PATCH', `/api/saved/${id}`, { note: 'Sunrise walk' });
  assert.equal(patched.body.place.note, 'Sunrise walk');
  assert.equal(patched.body.place.name, 'Marina Beach');

  assert.equal((await call('GET', '/api/saved')).body.places.length, 1);
  const onDisk = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'saved-places.json'), 'utf8'));
  assert.equal(onDisk[0].note, 'Sunrise walk');

  assert.equal((await call('DELETE', `/api/saved/${id}`)).status, 204);
  assert.equal((await call('DELETE', `/api/saved/${id}`)).status, 404);
  assert.equal((await call('GET', '/api/saved')).body.places.length, 0);
});
