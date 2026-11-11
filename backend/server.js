'use strict';
const config = require('./src/config');
const { createApp } = require('./src/app');

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`${config.appName} v${config.version} running at http://localhost:${config.port}`);
  console.log(`API health check: http://localhost:${config.port}/api/health`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
