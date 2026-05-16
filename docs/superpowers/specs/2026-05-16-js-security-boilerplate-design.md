# JS Security-Scanner Test Boilerplate — Design

**Date:** 2026-05-16
**Status:** Approved (pending spec review)

## 1. Goal & scope

Build a small, **clean** full-stack JavaScript boilerplate that will later serve as the target of a security-scanning application. The boilerplate is structured so that specific vulnerability classes (SQL injection, XSS, command injection, path traversal, weak crypto, broken auth, IDOR, etc.) can be introduced later in well-defined locations without restructuring the project.

**Important:** the initial code is intentionally **non-vulnerable**. Bugs are added in a follow-up step. This gives a meaningful "before/after" baseline against the scanner.

Out of scope for this spec:
- The actual bugs that will be planted later.
- The scanner itself.
- Tests, CI, Docker, observability, hardening middleware (Helmet/CSRF/rate-limit) — all explicitly deferred (YAGNI, and their absence is itself a useful scanner finding).

## 2. Stack

- **Runtime:** Node.js (current LTS)
- **Server:** Express
- **Database:** SQLite via `better-sqlite3` (file-backed, zero-config)
- **Frontend:** static HTML + vanilla JS (no framework, no bundler)
- **Auth:** cookie-based sessions stored in SQLite, passwords hashed with `bcrypt`

Rationale: minimal dependencies, no build step, easy for a static scanner to follow data flow.

## 3. Project structure

```
vora-test/
├── package.json
├── .gitignore
├── README.md
├── server.js                 # entry point: wires Express, middleware, routes
├── src/
│   ├── config.js             # env vars (PORT, SESSION_SECRET, DB_PATH)
│   ├── db.js                 # better-sqlite3 connection + schema bootstrap
│   ├── auth.js               # password hashing, session helpers
│   ├── middleware/
│   │   ├── session.js        # cookie-based session middleware
│   │   └── requireAuth.js    # gate for protected routes
│   ├── routes/
│   │   ├── auth.routes.js    # /signup, /login, /logout
│   │   ├── notes.routes.js   # CRUD on notes (owned by user)
│   │   └── search.routes.js  # /search?q= (note title/body)
│   └── utils/
│       └── render.js         # tiny HTML helper for server-rendered pages
├── public/                   # served statically
│   ├── index.html            # landing + login/signup forms
│   ├── app.html              # notes UI (after login)
│   ├── css/styles.css
│   └── js/
│       ├── auth.js           # fetch() calls to /signup, /login
│       └── notes.js          # render notes list, create/edit/delete
└── data/
    └── .gitkeep              # SQLite file lives here at runtime
```

### Module responsibilities

- **`server.js`** — creates the Express app, mounts middleware (`cookie-parser`, JSON body, session, static), mounts the route modules, starts the listener.
- **`src/config.js`** — reads env vars with defaults; exports a frozen config object.
- **`src/db.js`** — opens the SQLite file at `config.DB_PATH`, runs the `CREATE TABLE IF NOT EXISTS` bootstrap, exports the `Database` instance.
- **`src/auth.js`** — `hashPassword(plain)`, `verifyPassword(plain, hash)`, `createSession(userId)`, `loadSession(sid)`, `destroySession(sid)`. All session storage goes through `db.js`.
- **`src/middleware/session.js`** — reads the `sid` cookie, loads the session, attaches `req.user` (or `null`).
- **`src/middleware/requireAuth.js`** — returns 401 if `req.user` is missing.
- **`src/routes/*.routes.js`** — one Express `Router` per concern. Routes are thin: parse input, call DB, return JSON.
- **`src/utils/render.js`** — tiny HTML-escaping helper, used only if a server-rendered page is needed.
- **`public/js/*.js`** — frontend uses `fetch()` against the API and renders responses with `textContent` (never `innerHTML` on user data).

## 4. Data model

Schema is created by `db.js` on first run:

```sql
CREATE TABLE users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,        -- bcrypt hash
  created_at TEXT NOT NULL
);

CREATE TABLE notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  sid        TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);
```

## 5. HTTP API

| Method | Path             | Auth | Purpose                            |
|--------|------------------|------|------------------------------------|
| POST   | `/api/signup`    | no   | Create user (bcrypt-hashed pw)     |
| POST   | `/api/login`     | no   | Issue session cookie               |
| POST   | `/api/logout`    | yes  | Invalidate session                 |
| GET    | `/api/notes`     | yes  | List current user's notes          |
| POST   | `/api/notes`     | yes  | Create a note                      |
| GET    | `/api/notes/:id` | yes  | Fetch one note (owner check)       |
| PUT    | `/api/notes/:id` | yes  | Update one note (owner check)      |
| DELETE | `/api/notes/:id` | yes  | Delete one note (owner check)      |
| GET    | `/api/search`    | yes  | Search current user's notes by `q` |

All bodies and responses are JSON. Errors return `{ "error": "<message>" }` with an appropriate status code.

## 6. Initial (clean) security posture

The first version of the boilerplate is deliberately written without the bugs. Specifically:

- All SQL uses parameterized queries (`db.prepare(...).get(...)`).
- Passwords are hashed with `bcrypt` (cost 10), never stored or compared in plaintext.
- Session cookies are `httpOnly`, `sameSite=lax`, `secure` when `NODE_ENV=production`, and expire after 7 days (server-side check against `sessions.expires_at`).
- Every `/api/notes/:id` route verifies `note.user_id === req.user.id` before acting (no IDOR).
- The frontend renders user-supplied strings via `textContent` only — no `innerHTML`, no `eval`, no `Function()`.
- The server performs no shell execution and no filesystem reads/writes driven by user input.
- `SESSION_SECRET` is required when `NODE_ENV=production`; in dev a fixed fallback is used (and a warning is logged).

## 7. Seams for later bug injection

These are the places where vulnerabilities will be planted in the follow-up step. The structure exists to make each one a small, localized change:

- **SQLi** — `search.routes.js` (swap parameterized query for string concatenation).
- **Stored XSS** — `public/js/notes.js` (swap `textContent` for `innerHTML`).
- **IDOR** — `notes.routes.js` (drop the `user_id` ownership check on `/notes/:id`).
- **Weak crypto** — `auth.js` (swap `bcrypt` for `md5`/plaintext compare).
- **Broken auth** — `middleware/session.js` (skip expiry check or trust a client-supplied header).
- **Path traversal / command injection** — added as new endpoints later (e.g. `GET /api/notes/:id/export?format=...` that touches the filesystem or shells out).

No code for these is written in this phase.

## 8. Dependencies & scripts

**Runtime dependencies:**
- `express`
- `better-sqlite3`
- `bcrypt`
- `cookie-parser`

**Dev dependencies:** none.

**`package.json` scripts:**
- `npm start` → `node server.js`
- `npm run dev` → `node --watch server.js`

**`.gitignore`:** `node_modules/`, `data/*.sqlite`, `.env`

**Environment variables** (read by `src/config.js`, with defaults):
- `PORT` (default `3000`)
- `SESSION_SECRET` (dev fallback; required in production)
- `DB_PATH` (default `./data/app.sqlite`)
- `NODE_ENV` (default `development`)

## 9. Acceptance criteria

The boilerplate is complete when:

1. `npm install && npm start` brings up a server on `PORT` with no errors.
2. The SQLite file is created automatically on first run.
3. A user can sign up, log in, create a note, list notes, search notes, update a note, delete a note, and log out — entirely through the served frontend.
4. All routes behave per section 5 (status codes and JSON shapes).
5. None of the seams in section 7 contain planted bugs; the code matches the clean posture described in section 6.
6. There are no unused files, dead code, or TODO markers.

## 10. Non-goals

- Tests, CI, Docker, linting, TypeScript.
- Helmet, CSRF tokens, rate limiting, structured logging.
- Seed data / fixtures.
- Any UI polish beyond what's needed to exercise the API.
