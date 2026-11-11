'use strict';
const express = require('express');
const config = require('./config');
const { rateLimit, securityHeaders, requestLogger, apiNotFound, errorHandler } = require('./lib/middleware');
const geoRoutes = require('./routes/geo');
const placesRoutes = require('./routes/places');
const createSavedRouter = require('./routes/saved');

/** Builds the Express application (exported separately from server.js so tests can use it). */
function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use(securityHeaders);
  app.use(requestLogger);
  app.use(express.json({ limit: '50kb' }));

  // ----- API -----
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: config.appName, version: config.version, uptime: Math.round(process.uptime()) });
  });
  app.use('/api', rateLimit({ windowMs: 60_000, max: config.rateLimitPerMinute }));
  app.use('/api', geoRoutes);
  app.use('/api', placesRoutes);
  app.use('/api/saved', createSavedRouter());
  app.use('/api', apiNotFound);

  // ----- Frontend -----
  app.use(express.static(config.frontendDir, { extensions: ['html'] }));

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
