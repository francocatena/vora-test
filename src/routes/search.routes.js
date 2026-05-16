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
