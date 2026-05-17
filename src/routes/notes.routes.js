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
