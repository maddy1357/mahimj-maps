'use strict';
const config = require('../config');

/** Error raised when an upstream (third-party) service fails. */
class UpstreamError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

/**
 * fetch() wrapper: JSON response, timeout, identifying User-Agent and
 * consistent errors. `allowStatus` lists non-2xx codes whose JSON body is still useful.
 */
async function fetchJSON(url, { method = 'GET', body, headers = {}, timeout = 12000, allowStatus = [] } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      body,
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json', ...headers },
      signal: controller.signal,
    });
    if (!res.ok && !allowStatus.includes(res.status)) {
      throw new UpstreamError(`Upstream service responded with ${res.status}`, res.status === 404 ? 404 : 502);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    if (err.name === 'AbortError') throw new UpstreamError('Upstream service timed out', 504);
    throw new UpstreamError('Upstream service is unavailable', 502);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns a scheduler that starts at most one task every `intervalMs`.
 * Used to respect the Nominatim usage policy (max 1 request per second).
 */
function throttle(intervalMs) {
  let next = 0;
  return (task) => {
    const now = Date.now();
    const startAt = Math.max(now, next);
    next = startAt + intervalMs;
    return new Promise((resolve) => setTimeout(resolve, startAt - now)).then(task);
  };
}

module.exports = { fetchJSON, throttle, UpstreamError };
