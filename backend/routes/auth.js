const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
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

    // Создаем менеджера (новые пользователи получают роль operator по умолчанию)
    const { data, error } = await supabase
      .from('managers')
      .insert({
        email,
        password_hash: hashedPassword,
        name,
        username: email, // Используем email как username для совместимости
        role: 'operator' // По умолчанию оператор
      })
      .select()
      .single();

    if (error) throw error;

    // Создаем JWT токен с ролью
    const token = jwt.sign(
      { id: data.id, email: data.email, name: data.name, role: data.role || 'operator' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      manager: {
        id: data.id,
        email: data.email,
        name: data.name,
        role: data.role || 'operator'
      }
    });
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

    // Создаем JWT токен с ролью
    const token = jwt.sign(
      { id: manager.id, email: manager.email, name: manager.name, role: manager.role || 'operator' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      manager: {
        id: manager.id,
        email: manager.email,
        name: manager.name,
        role: manager.role || 'operator'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Запрос на восстановление пароля
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email обязателен' });
    }

    // Ищем менеджера
    const { data: manager, error: findError } = await supabase
      .from('managers')
      .select('id, email, name')
      .eq('email', email)
      .single();

    // Не раскрываем существует ли email (безопасность)
    if (findError || !manager) {
      // Возвращаем успех даже если email не найден
      return res.json({ success: true, message: 'Если email зарегистрирован, вы получите письмо' });
    }

    // Генерируем токен
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 час

    // Удаляем старые токены для этого пользователя
    await supabase
      .from('password_reset_tokens')
      .delete()
      .eq('manager_id', manager.id);

    // Создаем новый токен
    const { error: insertError } = await supabase
      .from('password_reset_tokens')
      .insert({
        manager_id: manager.id,
        email: manager.email,
        token,
        expires_at: expiresAt.toISOString()
      });

    if (insertError) throw insertError;

    // Отправляем email через Supabase Edge Function
    const resetUrl = `${process.env.FRONTEND_URL || 'https://crmvega.vercel.app'}/reset-password?token=${token}`;

    try {
      // Вызываем Edge Function для отправки email
      const response = await fetch(`${process.env.SUPABASE_URL}/functions/v1/send-reset-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          to: manager.email,
          name: manager.name || 'Пользователь',
          resetUrl
        })
      });

      if (!response.ok) {
        console.error('Email send failed:', await response.text());
      }
    } catch (emailError) {
      console.error('Failed to send reset email:', emailError);
      // Не прерываем — токен создан, можно использовать URL напрямую для тестов
    }

    console.log(`[Password Reset] Token created for ${email}. Reset URL: ${resetUrl}`);

    res.json({ success: true, message: 'Инструкции отправлены на email' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Сброс пароля по токену
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Токен и пароль обязательны' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }

    // Ищем токен
    const { data: resetToken, error: findError } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('token', token)
      .eq('used', false)
      .single();

    if (findError || !resetToken) {
      return res.status(400).json({ error: 'Недействительная или использованная ссылка' });
    }

    // Проверяем срок действия
    if (new Date(resetToken.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Ссылка истекла. Запросите новую.' });
    }

    // Хэшируем новый пароль
    const hashedPassword = await bcrypt.hash(password, 10);

    // Обновляем пароль
    const { error: updateError } = await supabase
      .from('managers')
      .update({ password_hash: hashedPassword })
      .eq('id', resetToken.manager_id);

    if (updateError) throw updateError;

    // Помечаем токен как использованный
    await supabase
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('id', resetToken.id);

    console.log(`[Password Reset] Password updated for manager ${resetToken.manager_id}`);

    res.json({ success: true, message: 'Пароль успешно изменён' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Проверка валидности токена
router.get('/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { data: resetToken, error } = await supabase
      .from('password_reset_tokens')
      .select('email, expires_at, used')
      .eq('token', token)
      .single();

    if (error || !resetToken) {
      return res.status(400).json({ valid: false, error: 'Недействительная ссылка' });
    }

    if (resetToken.used) {
      return res.status(400).json({ valid: false, error: 'Ссылка уже использована' });
    }

    if (new Date(resetToken.expires_at) < new Date()) {
      return res.status(400).json({ valid: false, error: 'Ссылка истекла' });
    }

    res.json({ valid: true, email: resetToken.email });
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({ valid: false, error: 'Ошибка сервера' });
  }
});

module.exports = router;
