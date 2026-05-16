# vora-test

A clean full-stack JS boilerplate (Express + SQLite + vanilla HTML/JS) used as a target for a security-scanning application. The initial code is intentionally non-vulnerable; specific bug classes will be planted in a follow-up step.

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
| `NODE_ENV`        | `development`            | `production` requires `SESSION_SECRET`             |
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
