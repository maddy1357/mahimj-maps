'use strict';

/** HTTP error with a status code; its message is safe to show to clients. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}
const badRequest = (msg) => new HttpError(400, msg);
const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

function number(value, name, { min = -Infinity, max = Infinity, optional = false, fallback } = {}) {
  if (isEmpty(value)) {
    if (optional) return fallback;
    throw badRequest(`"${name}" is required`);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw badRequest(`"${name}" must be a number between ${min} and ${max}`);
  return n;
}

const lat = (value, name = 'lat', opts) => number(value, name, { min: -90, max: 90, ...opts });
const lon = (value, name = 'lon', opts) => number(value, name, { min: -180, max: 180, ...opts });

function string(value, name, { min = 1, max = 200, optional = false, fallback = '' } = {}) {
  if (isEmpty(value)) {
    if (optional) return fallback;
    throw badRequest(`"${name}" is required`);
  }
  if (typeof value !== 'string') throw badRequest(`"${name}" must be a string`);
  const s = value.trim();
  if (s.length < min || s.length > max) throw badRequest(`"${name}" must be between ${min} and ${max} characters`);
  return s;
}

function oneOf(value, name, allowed, fallback) {
  if (isEmpty(value) && fallback !== undefined) return fallback;
  if (!allowed.includes(value)) throw badRequest(`"${name}" must be one of: ${allowed.join(', ')}`);
  return value;
}

/** Parses "lat,lon". */
function latLon(value, name) {
  const parts = String(value ?? '').split(',');
  if (parts.length !== 2) throw badRequest(`"${name}" must look like "lat,lon"`);
  return { lat: lat(parts[0], name), lon: lon(parts[1], name) };
}

/** Wraps an async route handler so rejected promises reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { HttpError, badRequest, number, lat, lon, string, oneOf, latLon, asyncHandler };
