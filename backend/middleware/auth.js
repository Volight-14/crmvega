const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.manager = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Неверный токен авторизации' });
  }
};

module.exports = auth;
