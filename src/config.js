const path = require('node:path');

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

const SESSION_SECRET = process.env.SESSION_SECRET
  || (isProd ? null : 'dev-only-insecure-secret');

if (isProd && !SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required when NODE_ENV=production');
}
if (!isProd && !process.env.SESSION_SECRET) {
  console.warn('[config] Using dev fallback SESSION_SECRET. Set SESSION_SECRET to silence this warning.');
}

const config = Object.freeze({
  NODE_ENV,
  isProd,
  PORT: Number(process.env.PORT) || 3000,
  SESSION_SECRET,
  DB_PATH: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.sqlite'),
  SESSION_TTL_MS: 7 * 24 * 60 * 60 * 1000,
});

module.exports = config;
