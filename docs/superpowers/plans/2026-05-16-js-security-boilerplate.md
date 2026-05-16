# JS Security-Scanner Test Boilerplate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **User preference (overrides skill default):** Never run `git commit`. After each task, run `git add <files>` and tell the user the task is ready for them to commit. This rule supersedes any "Commit" instructions from sub-skills.

**Goal:** Scaffold a clean, full-stack JS boilerplate (Express + SQLite + vanilla HTML/JS) that later vulnerability-injection work will build on. No bugs are introduced in this plan.

**Architecture:** Single Node process. Express serves a static frontend from `public/` and a JSON API from `src/routes/`. Auth is cookie-based session stored in SQLite via `better-sqlite3`. Passwords hashed with `bcrypt`. No build step.

**Tech Stack:** Node.js (current LTS), Express, better-sqlite3, bcrypt, cookie-parser. Vanilla HTML/CSS/JS on the frontend. No tests/linter/bundler in this phase (per spec §10).

**Reference spec:** `docs/superpowers/specs/2026-05-16-js-security-boilerplate-design.md`

**Verification approach:** The spec explicitly excludes a test suite. Each task ends with a manual or `curl`-based smoke check. A final end-to-end smoke task exercises the full happy path through the browser.

---

## Task 1: Initialize package and project skeleton

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `data/.gitkeep`
- Create: `src/`, `src/middleware/`, `src/routes/`, `src/utils/`, `public/`, `public/css/`, `public/js/` (as directories — created by writing files into them in later tasks; here we just verify the structure)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "vora-test",
  "version": "0.1.0",
  "private": true,
  "description": "Clean JS full-stack boilerplate used as a target for a security scanner.",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "better-sqlite3": "^11.3.0",
    "bcrypt": "^5.1.1",
    "cookie-parser": "^1.4.6"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
data/*.sqlite
data/*.sqlite-journal
.env
.DS_Store
```

- [ ] **Step 3: Create `data/.gitkeep`** (empty file so the runtime DB directory is tracked).

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: dependencies installed, `package-lock.json` written, no audit errors that block install.

- [ ] **Step 5: Stage for user commit**

Run: `git add package.json package-lock.json .gitignore data/.gitkeep`
Then tell the user: "Task 1 staged — package skeleton ready to commit."

---

## Task 2: Config module

**Files:**
- Create: `src/config.js`

- [ ] **Step 1: Write `src/config.js`**

```javascript
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
```

- [ ] **Step 2: Smoke-check the module loads**

Run: `node -e "console.log(require('./src/config.js'))"`
Expected: prints a frozen config object including a `DB_PATH` ending in `data/app.sqlite`, plus the dev-fallback warning to stderr.

- [ ] **Step 3: Stage for user commit**

Run: `git add src/config.js`
Then tell the user: "Task 2 staged — config module ready to commit."

---

## Task 3: Database bootstrap

**Files:**
- Create: `src/db.js`

- [ ] **Step 1: Write `src/db.js`**

```javascript
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const config = require('./config');

fs.mkdirSync(path.dirname(config.DB_PATH), { recursive: true });

const db = new Database(config.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid        TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL
  );
`);

module.exports = db;
```

- [ ] **Step 2: Smoke-check the DB initializes**

Run: `node -e "const db = require('./src/db.js'); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all());"`
Expected: prints an array containing `users`, `notes`, `sessions`. A new `data/app.sqlite` file exists afterwards.

- [ ] **Step 3: Stage for user commit**

Run: `git add src/db.js`
Then tell the user: "Task 3 staged — DB bootstrap ready to commit."

---

## Task 4: Auth helpers

**Files:**
- Create: `src/auth.js`

- [ ] **Step 1: Write `src/auth.js`**

```javascript
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
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    deleteSession.run(sid);
    return null;
  }
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
```

- [ ] **Step 2: Smoke-check hashing round-trips**

Run:
```
node -e "(async () => { const a = require('./src/auth.js'); const h = await a.hashPassword('pw'); console.log(await a.verifyPassword('pw', h), await a.verifyPassword('nope', h)); })()"
```
Expected: prints `true false`.

- [ ] **Step 3: Stage for user commit**

Run: `git add src/auth.js`
Then tell the user: "Task 4 staged — auth helpers ready to commit."

---

## Task 5: Session and requireAuth middleware

**Files:**
- Create: `src/middleware/session.js`
- Create: `src/middleware/requireAuth.js`

- [ ] **Step 1: Write `src/middleware/session.js`**

```javascript
const { loadSession } = require('../auth');

function sessionMiddleware(req, res, next) {
  const sid = req.cookies ? req.cookies.sid : null;
  req.user = loadSession(sid);
  next();
}

module.exports = sessionMiddleware;
```

- [ ] **Step 2: Write `src/middleware/requireAuth.js`**

```javascript
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'authentication required' });
  }
  next();
}

module.exports = requireAuth;
```

- [ ] **Step 3: Smoke-check both modules parse**

Run: `node -e "require('./src/middleware/session.js'); require('./src/middleware/requireAuth.js'); console.log('ok');"`
Expected: prints `ok`.

- [ ] **Step 4: Stage for user commit**

Run: `git add src/middleware/session.js src/middleware/requireAuth.js`
Then tell the user: "Task 5 staged — middleware ready to commit."

---

## Task 6: Auth routes

**Files:**
- Create: `src/routes/auth.routes.js`

- [ ] **Step 1: Write `src/routes/auth.routes.js`**

```javascript
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
```

- [ ] **Step 2: Smoke-check the module parses**

Run: `node -e "require('./src/routes/auth.routes.js'); console.log('ok');"`
Expected: prints `ok`.

- [ ] **Step 3: Stage for user commit**

Run: `git add src/routes/auth.routes.js`
Then tell the user: "Task 6 staged — auth routes ready to commit."

---

## Task 7: Notes routes (CRUD with ownership checks)

**Files:**
- Create: `src/routes/notes.routes.js`

- [ ] **Step 1: Write `src/routes/notes.routes.js`**

```javascript
const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

const listNotes = db.prepare(
  `SELECT id, title, body, created_at
   FROM notes WHERE user_id = ?
   ORDER BY datetime(created_at) DESC`
);
const insertNote = db.prepare(
  'INSERT INTO notes (user_id, title, body, created_at) VALUES (?, ?, ?, ?)'
);
const selectNote = db.prepare(
  'SELECT id, user_id, title, body, created_at FROM notes WHERE id = ?'
);
const updateNote = db.prepare(
  'UPDATE notes SET title = ?, body = ? WHERE id = ? AND user_id = ?'
);
const deleteNote = db.prepare(
  'DELETE FROM notes WHERE id = ? AND user_id = ?'
);

function validNoteBody(body) {
  return body
    && typeof body.title === 'string' && body.title.trim().length > 0
    && typeof body.body === 'string';
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get('/', (req, res) => {
  res.json(listNotes.all(req.user.userId));
});

router.post('/', (req, res) => {
  if (!validNoteBody(req.body)) {
    return res.status(400).json({ error: 'title and body required' });
  }
  const now = new Date().toISOString();
  const result = insertNote.run(req.user.userId, req.body.title, req.body.body, now);
  res.status(201).json({
    id: result.lastInsertRowid,
    title: req.body.title,
    body: req.body.body,
    created_at: now,
  });
});

router.get('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'invalid id' });
  const note = selectNote.get(id);
  if (!note || note.user_id !== req.user.userId) {
    return res.status(404).json({ error: 'not found' });
  }
  res.json({ id: note.id, title: note.title, body: note.body, created_at: note.created_at });
});

router.put('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'invalid id' });
  if (!validNoteBody(req.body)) {
    return res.status(400).json({ error: 'title and body required' });
  }
  const note = selectNote.get(id);
  if (!note || note.user_id !== req.user.userId) {
    return res.status(404).json({ error: 'not found' });
  }
  updateNote.run(req.body.title, req.body.body, id, req.user.userId);
  res.json({ id, title: req.body.title, body: req.body.body, created_at: note.created_at });
});

router.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'invalid id' });
  const result = deleteNote.run(id, req.user.userId);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'not found' });
  }
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 2: Smoke-check the module parses**

Run: `node -e "require('./src/routes/notes.routes.js'); console.log('ok');"`
Expected: prints `ok`.

- [ ] **Step 3: Stage for user commit**

Run: `git add src/routes/notes.routes.js`
Then tell the user: "Task 7 staged — notes routes ready to commit."

---

## Task 8: Search route

**Files:**
- Create: `src/routes/search.routes.js`

- [ ] **Step 1: Write `src/routes/search.routes.js`**

```javascript
const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

const searchNotes = db.prepare(
  `SELECT id, title, body, created_at
   FROM notes
   WHERE user_id = ?
     AND (title LIKE ? OR body LIKE ?)
   ORDER BY datetime(created_at) DESC
   LIMIT 100`
);

router.get('/', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length === 0) {
    return res.json([]);
  }
  const like = `%${q}%`;
  res.json(searchNotes.all(req.user.userId, like, like));
});

module.exports = router;
```

- [ ] **Step 2: Smoke-check the module parses**

Run: `node -e "require('./src/routes/search.routes.js'); console.log('ok');"`
Expected: prints `ok`.

- [ ] **Step 3: Stage for user commit**

Run: `git add src/routes/search.routes.js`
Then tell the user: "Task 8 staged — search route ready to commit."

---

## Task 9: HTML render helper

**Files:**
- Create: `src/utils/render.js`

This is a small server-side HTML escape helper. The frontend renders user data client-side via `textContent`, but the helper is kept available as a seam.

- [ ] **Step 1: Write `src/utils/render.js`**

```javascript
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { escapeHtml };
```

- [ ] **Step 2: Smoke-check**

Run: `node -e "console.log(require('./src/utils/render.js').escapeHtml('<script>alert(1)</script>'));"`
Expected: prints `&lt;script&gt;alert(1)&lt;/script&gt;`.

- [ ] **Step 3: Stage for user commit**

Run: `git add src/utils/render.js`
Then tell the user: "Task 9 staged — render util ready to commit."

---

## Task 10: Server entry point

**Files:**
- Create: `server.js`

- [ ] **Step 1: Write `server.js`**

```javascript
const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');

const config = require('./src/config');
const sessionMiddleware = require('./src/middleware/session');
const authRoutes = require('./src/routes/auth.routes');
const notesRoutes = require('./src/routes/notes.routes');
const searchRoutes = require('./src/routes/search.routes');

const app = express();

app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());
app.use(sessionMiddleware);

app.use('/api', authRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/search', searchRoutes);

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, _next) => {
  console.error('[server] unhandled error:', err);
  res.status(500).json({ error: 'internal server error' });
});

app.listen(config.PORT, () => {
  console.log(`[server] listening on http://localhost:${config.PORT} (${config.NODE_ENV})`);
});
```

- [ ] **Step 2: Boot the server and verify the API is reachable**

In one shell: `node server.js`
In another shell:
```
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/notes
```
Expected: `401` (unauthenticated). Stop the server with Ctrl+C.

- [ ] **Step 3: Stage for user commit**

Run: `git add server.js`
Then tell the user: "Task 10 staged — server entry ready to commit."

---

## Task 11: Frontend — landing page and auth flow

**Files:**
- Create: `public/index.html`
- Create: `public/css/styles.css`
- Create: `public/js/auth.js`

- [ ] **Step 1: Write `public/css/styles.css`**

```css
* { box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  margin: 0;
  background: #f6f7f9;
  color: #1c1c1c;
}
.wrap { max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
h1 { margin-top: 0; }
form { display: flex; flex-direction: column; gap: 0.5rem; max-width: 320px; }
input, textarea, button {
  font: inherit;
  padding: 0.5rem 0.75rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fff;
}
button { background: #1f6feb; color: #fff; border-color: #1f6feb; cursor: pointer; }
button.secondary { background: #fff; color: #1f6feb; }
.row { display: flex; gap: 0.5rem; align-items: center; }
.error { color: #b00020; min-height: 1.25em; }
.note { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 0.75rem; }
.note h3 { margin: 0 0 0.25rem; }
.note p { margin: 0; white-space: pre-wrap; }
.note .meta { color: #666; font-size: 0.85em; margin-top: 0.5rem; }
```

- [ ] **Step 2: Write `public/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>vora-test — sign in</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="/css/styles.css" />
</head>
<body>
  <main class="wrap">
    <h1>vora-test</h1>
    <p>Sign in or create an account to manage notes.</p>

    <section>
      <h2>Log in</h2>
      <form id="login-form">
        <input name="username" placeholder="username" autocomplete="username" required minlength="3" />
        <input name="password" type="password" placeholder="password" autocomplete="current-password" required minlength="6" />
        <button type="submit">Log in</button>
      </form>
    </section>

    <section style="margin-top:2rem">
      <h2>Sign up</h2>
      <form id="signup-form">
        <input name="username" placeholder="username" autocomplete="username" required minlength="3" />
        <input name="password" type="password" placeholder="password" autocomplete="new-password" required minlength="6" />
        <button type="submit">Create account</button>
      </form>
    </section>

    <p class="error" id="err"></p>
  </main>
  <script src="/js/auth.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write `public/js/auth.js`**

```javascript
const errEl = document.getElementById('err');

function setError(msg) {
  errEl.textContent = msg || '';
}

async function submitCredentials(path, form) {
  setError('');
  const data = Object.fromEntries(new FormData(form).entries());
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let msg = 'Request failed';
    try { msg = (await res.json()).error || msg; } catch (_) {}
    setError(msg);
    return;
  }
  window.location.href = '/app.html';
}

document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  submitCredentials('/api/login', e.target);
});

document.getElementById('signup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  submitCredentials('/api/signup', e.target);
});

(async () => {
  try {
    const res = await fetch('/api/me');
    if (res.ok) window.location.href = '/app.html';
  } catch (_) {}
})();
```

- [ ] **Step 4: Smoke-check in a browser**

In one shell: `node server.js`
Open `http://localhost:3000/` in a browser. Confirm both forms render and the error line is empty. Stop the server.

- [ ] **Step 5: Stage for user commit**

Run: `git add public/index.html public/css/styles.css public/js/auth.js`
Then tell the user: "Task 11 staged — landing page ready to commit."

---

## Task 12: Frontend — notes app

**Files:**
- Create: `public/app.html`
- Create: `public/js/notes.js`

- [ ] **Step 1: Write `public/app.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>vora-test — notes</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="/css/styles.css" />
</head>
<body>
  <main class="wrap">
    <div class="row" style="justify-content: space-between; align-items: baseline;">
      <h1>Notes</h1>
      <div class="row">
        <span id="who"></span>
        <button id="logout" class="secondary" type="button">Log out</button>
      </div>
    </div>

    <form id="new-note">
      <input name="title" placeholder="Title" required />
      <textarea name="body" placeholder="Write something..." rows="4"></textarea>
      <button type="submit">Add note</button>
    </form>

    <form id="search" class="row" style="margin-top:1rem">
      <input name="q" placeholder="Search your notes..." />
      <button type="submit">Search</button>
      <button type="button" id="clear-search" class="secondary">Clear</button>
    </form>

    <p class="error" id="err"></p>
    <section id="list" style="margin-top:1rem"></section>
  </main>
  <script src="/js/notes.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `public/js/notes.js`**

```javascript
const listEl = document.getElementById('list');
const errEl = document.getElementById('err');
const whoEl = document.getElementById('who');

function setError(msg) { errEl.textContent = msg || ''; }

async function api(path, init) {
  const res = await fetch(path, init);
  if (res.status === 401) {
    window.location.href = '/';
    return null;
  }
  if (!res.ok) {
    let msg = 'Request failed';
    try { msg = (await res.json()).error || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

function renderNotes(notes) {
  listEl.replaceChildren();
  if (!notes.length) {
    const p = document.createElement('p');
    p.textContent = 'No notes yet.';
    listEl.appendChild(p);
    return;
  }
  for (const note of notes) {
    const card = document.createElement('article');
    card.className = 'note';

    const title = document.createElement('h3');
    title.textContent = note.title;

    const body = document.createElement('p');
    body.textContent = note.body;

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `Created ${note.created_at}`;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'secondary';
    del.textContent = 'Delete';
    del.addEventListener('click', () => deleteNote(note.id));

    card.append(title, body, meta, del);
    listEl.appendChild(card);
  }
}

async function loadNotes() {
  try {
    const notes = await api('/api/notes');
    if (notes) renderNotes(notes);
  } catch (err) { setError(err.message); }
}

async function searchNotes(q) {
  try {
    const notes = await api(`/api/search?q=${encodeURIComponent(q)}`);
    if (notes) renderNotes(notes);
  } catch (err) { setError(err.message); }
}

async function deleteNote(id) {
  try {
    await api(`/api/notes/${id}`, { method: 'DELETE' });
    await loadNotes();
  } catch (err) { setError(err.message); }
}

document.getElementById('new-note').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('');
  const data = Object.fromEntries(new FormData(e.target).entries());
  try {
    await api('/api/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    e.target.reset();
    await loadNotes();
  } catch (err) { setError(err.message); }
});

document.getElementById('search').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = new FormData(e.target).get('q') || '';
  if (!q.toString().trim()) loadNotes();
  else searchNotes(q.toString().trim());
});

document.getElementById('clear-search').addEventListener('click', () => {
  document.querySelector('#search input[name="q"]').value = '';
  loadNotes();
});

document.getElementById('logout').addEventListener('click', async () => {
  try {
    await api('/api/logout', { method: 'POST' });
  } catch (_) {}
  window.location.href = '/';
});

(async () => {
  try {
    const me = await api('/api/me');
    if (me) whoEl.textContent = `Signed in as ${me.username}`;
    await loadNotes();
  } catch (err) { setError(err.message); }
})();
```

- [ ] **Step 3: Stage for user commit**

Run: `git add public/app.html public/js/notes.js`
Then tell the user: "Task 12 staged — notes UI ready to commit."

---

## Task 13: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `README.md`**

```markdown
# vora-test

Clean full-stack JS boilerplate (Express + SQLite + vanilla HTML/JS) used as a target for a security-scanning application. The initial code is intentionally non-vulnerable; specific bug classes will be planted in a follow-up step.

## Quick start

```bash
npm install
npm start
# open http://localhost:3000
```

For auto-reload during development:

```bash
npm run dev
```

## Environment

| Variable          | Default                  | Notes                                              |
|-------------------|--------------------------|----------------------------------------------------|
| `PORT`            | `3000`                   |                                                    |
| `NODE_ENV`        | `development`            | `production` requires `SESSION_SECRET`            |
| `SESSION_SECRET`  | dev fallback (insecure)  | Required when `NODE_ENV=production`                |
| `DB_PATH`         | `./data/app.sqlite`      | SQLite file is created on first run                |

## Layout

- `server.js` — Express entry point
- `src/` — server modules (config, db, auth, middleware, routes)
- `public/` — static frontend (HTML/CSS/JS)
- `data/` — runtime SQLite file (ignored by git)
- `docs/superpowers/` — design spec and implementation plan

## What this is *not*

No tests, no Docker, no CSRF/Helmet/rate-limiting middleware. Those are deferred deliberately (see `docs/superpowers/specs/2026-05-16-js-security-boilerplate-design.md` §10).
```

- [ ] **Step 2: Stage for user commit**

Run: `git add README.md`
Then tell the user: "Task 13 staged — README ready to commit."

---

## Task 14: End-to-end smoke test

This is the final acceptance check (spec §9). Run it from a clean checkout of all prior tasks.

- [ ] **Step 1: Delete any pre-existing dev DB so the run starts clean**

Run: `rm -f data/app.sqlite data/app.sqlite-journal`

- [ ] **Step 2: Start the server**

Run: `node server.js` (leave running in this shell)
Expected log line: `[server] listening on http://localhost:3000 (development)`

- [ ] **Step 3: Drive the happy path with `curl` in a second shell**

Run each in order. Use `-c cookies.txt -b cookies.txt` to persist the session cookie.

```bash
# signup
curl -s -c cookies.txt -b cookies.txt -H 'content-type: application/json' \
  -d '{"username":"alice","password":"hunter22"}' \
  http://localhost:3000/api/signup
# -> {"id":1,"username":"alice"}

# create a note
curl -s -c cookies.txt -b cookies.txt -H 'content-type: application/json' \
  -d '{"title":"first","body":"hello world"}' \
  http://localhost:3000/api/notes
# -> {"id":1,"title":"first","body":"hello world","created_at":"..."}

# list
curl -s -c cookies.txt -b cookies.txt http://localhost:3000/api/notes
# -> [{"id":1,...}]

# search
curl -s -c cookies.txt -b cookies.txt 'http://localhost:3000/api/search?q=hello'
# -> [{"id":1,...}]

# update
curl -s -c cookies.txt -b cookies.txt -X PUT -H 'content-type: application/json' \
  -d '{"title":"first (edited)","body":"hello world"}' \
  http://localhost:3000/api/notes/1
# -> {"id":1,"title":"first (edited)",...}

# logout
curl -s -c cookies.txt -b cookies.txt -X POST http://localhost:3000/api/logout
# -> {"ok":true}

# verify auth gate
curl -s -o /dev/null -w "%{http_code}\n" -b cookies.txt http://localhost:3000/api/notes
# -> 401
```

Expected: every command returns the response shown.

- [ ] **Step 4: Browser smoke**

Open `http://localhost:3000/` in a browser. Sign up as a new user (e.g. `bob`/`hunter22`), create a note, search for part of its body, delete it, then log out. Confirm the UI updates without page-reload errors.

- [ ] **Step 5: Stop the server, clean the cookie jar**

Ctrl+C the server. Run: `rm -f cookies.txt`

- [ ] **Step 6: Final report to user**

Tell the user: "End-to-end smoke complete. All acceptance criteria from spec §9 verified. Nothing left to stage — boilerplate is ready."

---

## Self-review notes

- **Spec coverage:** stack (Task 1), structure (all tasks), data model (Task 3), endpoints (Tasks 6–8), clean security posture (Tasks 4, 6, 7), seams (preserved — no bug code anywhere), deps/scripts (Task 1), env vars (Task 2), acceptance criteria (Task 14).
- **Placeholder scan:** no TBDs, no "implement later," every code step contains complete code.
- **Type consistency:** `req.user` is set to `{ sid, userId, username }` or `null` by `sessionMiddleware` (Task 5), and consumed in that shape by `auth.routes.js`, `notes.routes.js`, `search.routes.js` (Tasks 6–8). Cookie name `sid` is consistent across `auth.routes.js`, `session.js`, and the logout `clearCookie` call.
- **User preference:** every task ends with `git add` + a "ready to commit" message; no task runs `git commit`.
