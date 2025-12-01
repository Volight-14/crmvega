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
    console.log(`[Auth] Authenticated: ${decoded.email || decoded.id} (role: ${decoded.role || 'unknown'})`);
    next();
  } catch (error) {
    console.error('[Auth] Token verification failed:', error.message);
    res.status(401).json({ error: 'Неверный токен авторизации' });
  }
};

// Middleware для проверки роли админа
const requireAdmin = (req, res, next) => {
  if (!req.manager) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  
  if (req.manager.role !== 'admin') {
    console.log(`[Auth] Admin required, but user role is: ${req.manager.role}`);
    return res.status(403).json({ error: 'Требуются права администратора' });
  }
  
  next();
};

// Проверка: админ или владелец ресурса
const requireAdminOrOwner = (ownerIdField = 'created_by') => {
  return (req, res, next) => {
    if (!req.manager) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    // Админы могут всё
    if (req.manager.role === 'admin') {
      return next();
    }
    
    // Для остальных проверяем владение при наличии ресурса
    // Реальная проверка будет в роуте
    req.checkOwnership = true;
    req.ownerIdField = ownerIdField;
    next();
  };
};

module.exports = auth;
module.exports.auth = auth;
module.exports.requireAdmin = requireAdmin;
module.exports.requireAdminOrOwner = requireAdminOrOwner;
