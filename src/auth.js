const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const db = require('./db');
const config = require('./config');

const BCRYPT_COST = 10;

function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_COST);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

const insertSession = db.prepare(
  'INSERT INTO sessions (sid, user_id, expires_at) VALUES (?, ?, ?)'
);
const selectSession = db.prepare(
  `SELECT s.sid, s.user_id, s.expires_at, u.username
   FROM sessions s
   JOIN users u ON u.id = s.user_id
   WHERE s.sid = ?`
);
const deleteSession = db.prepare('DELETE FROM sessions WHERE sid = ?');

function createSession(userId) {
  const sid = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_MS).toISOString();
  insertSession.run(sid, userId, expiresAt);
  return { sid, expiresAt };
}

function loadSession(sid) {
  if (!sid) return null;
  const row = selectSession.get(sid);
  if (!row) return null;
  return { sid: row.sid, userId: row.user_id, username: row.username };
}

function destroySession(sid) {
  if (!sid) return;
  deleteSession.run(sid);
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  loadSession,
  destroySession,
};
