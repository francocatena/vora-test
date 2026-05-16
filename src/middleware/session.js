const { loadSession } = require('../auth');

function sessionMiddleware(req, res, next) {
  const sid = req.cookies ? req.cookies.sid : null;
  req.user = loadSession(sid);
  next();
}

module.exports = sessionMiddleware;
