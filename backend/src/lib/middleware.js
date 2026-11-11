'use strict';

/** Fixed-window rate limiter keyed by client IP. */
function rateLimit({ windowMs = 60_000, max = 120 } = {}) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.reset < now) hits.delete(key);
  }, windowMs);
  sweep.unref();

  return (req, res, next) => {
    const now = Date.now();
    let entry = hits.get(req.ip);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(req.ip, entry);
    }
    entry.count++;
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', Math.max(0, max - entry.count));
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.' });
    }
    next();
  };
}

/** Basic hardening headers. */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  next();
}

/** Logs API calls: method, path, status and duration. */
function requestLogger(req, res, next) {
  if (!req.path.startsWith('/api') || process.env.NODE_ENV === 'test') return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${ms.toFixed(0)}ms`);
  });
  next();
}

/** JSON 404 for unknown API routes. */
function apiNotFound(req, res) {
  res.status(404).json({ error: `No API route for ${req.method} ${req.path}` });
}

/** Final error handler: JSON body, no stack traces leaked. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  if (err.type === 'entity.parse.failed') status = 400;
  if (status >= 500 && !err.expose) console.error(err);
  const message = status >= 500 && !err.expose ? 'Internal server error' : err.message;
  res.status(status).json({ error: message });
}

module.exports = { rateLimit, securityHeaders, requestLogger, apiNotFound, errorHandler };
