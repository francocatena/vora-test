const express = require('express');
const db = require('../db');
const auth = require('../auth');
const config = require('../config');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const insertUser = db.prepare(
  'INSERT INTO users (username, password, created_at) VALUES (?, ?, ?)'
);
const selectUserByName = db.prepare(
  'SELECT id, username, password FROM users WHERE username = ?'
);

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProd,
  maxAge: config.SESSION_TTL_MS,
};

function validCredentials(body) {
  if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
    return false;
  }
  return body.username.length >= 3 && body.password.length >= 6;
}

router.post('/signup', async (req, res) => {
  if (!validCredentials(req.body)) {
    return res.status(400).json({ error: 'username (>=3) and password (>=6) required' });
  }
  const { username, password } = req.body;
  try {
    const hash = await auth.hashPassword(password);
    const result = insertUser.run(username, hash, new Date().toISOString());
    const { sid } = auth.createSession(result.lastInsertRowid);
    res.cookie('sid', sid, COOKIE_OPTS);
    res.status(201).json({ id: result.lastInsertRowid, username });
  } catch (err) {
    if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'username already taken' });
    }
    throw err;
  }
});

router.post('/login', async (req, res) => {
  if (!validCredentials(req.body)) {
    return res.status(400).json({ error: 'username and password required' });
  }
  const { username, password } = req.body;
  const user = selectUserByName.get(username);
  if (!user) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const ok = await auth.verifyPassword(password, user.password);
  if (!ok) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const { sid } = auth.createSession(user.id);
  res.cookie('sid', sid, COOKIE_OPTS);
  res.json({ id: user.id, username: user.username });
});

router.post('/logout', requireAuth, (req, res) => {
  auth.destroySession(req.user.sid);
  res.clearCookie('sid');
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.userId, username: req.user.username });
});

module.exports = router;
