const path = require('node:path');
const crypto = require('node:crypto');

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

if (isProd && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required when NODE_ENV=production');
}
if (!isProd && !process.env.SESSION_SECRET) {
  console.warn('[config] SESSION_SECRET not set; generating a random ephemeral secret for this run. Set SESSION_SECRET for stable sessions across restarts.');
}

// Never fall back to a hardcoded secret: require it in production, and in
// development generate a fresh random one per process so no static secret ships.
const SESSION_SECRET = process.env.SESSION_SECRET
  || crypto.randomBytes(32).toString('hex');

const config = Object.freeze({
  NODE_ENV,
  isProd,
  PORT: Number(process.env.PORT) || 3000,
  SESSION_SECRET,
  DB_PATH: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.sqlite'),
  SESSION_TTL_MS: 7 * 24 * 60 * 60 * 1000,
});

module.exports = config;
