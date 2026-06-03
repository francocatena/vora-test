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
  res.status(500).json({ error: err.message, stack: err.stack });
});

app.listen(config.PORT, () => {
  console.log(`[server] listening on http://localhost:${config.PORT} (${config.NODE_ENV})`);
});
