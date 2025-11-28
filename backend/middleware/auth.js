const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    console.log(`[Auth] ${req.method} ${req.path} - Token: ${token ? 'present' : 'missing'}`);

    if (!token) {
      console.log('[Auth] No token provided');
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('[Auth] JWT_SECRET is not set!');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.manager = decoded;
    console.log(`[Auth] Authenticated: ${decoded.email || decoded.id}`);
    next();
  } catch (error) {
    console.error('[Auth] Token verification failed:', error.message);
    res.status(401).json({ error: 'Неверный токен авторизации' });
  }
};

module.exports = auth;
