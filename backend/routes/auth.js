const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Регистрация менеджера
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Хэшируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);

    // Создаем менеджера
    const { data, error } = await supabase
      .from('managers')
      .insert({
        email,
        password_hash: hashedPassword,
        name,
        username: email // Используем email как username для совместимости
      })
      .select()
      .single();

    if (error) throw error;

    // Создаем JWT токен
    const token = jwt.sign(
      { id: data.id, email: data.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, manager: { id: data.id, email: data.email, name: data.name } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Авторизация менеджера
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Ищем менеджера
    const { data: manager, error } = await supabase
      .from('managers')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !manager) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // Проверяем пароль
    const validPassword = await bcrypt.compare(password, manager.password_hash || manager.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // Создаем JWT токен
    const token = jwt.sign(
      { id: manager.id, email: manager.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      manager: {
        id: manager.id,
        email: manager.email,
        name: manager.name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
