const express = require('express');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
    if (req.manager.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admins only.' });
    }
    next();
};

// Получить всех менеджеров (только для админов)
router.get('/', auth, requireAdmin, async (req, res) => {
    try {
        const { data: managers, error } = await supabase
            .from('managers')
            .select('id, name, email, role, created_at, username')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(managers);
    } catch (error) {
        console.error('Error fetching managers:', error);
        res.status(500).json({ error: error.message });
    }
});

// Создать нового менеджера (только для админов)
router.post('/', auth, requireAdmin, async (req, res) => {
    try {
        const { email, password, name, role } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, name and password are required' });
        }

        // Проверяем существование пользователя
        const { data: existing } = await supabase
            .from('managers')
            .select('id')
            .eq('email', email)
            .single();

        if (existing) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }

        // Хэшируем пароль
        const hashedPassword = await bcrypt.hash(password, 10);

        const { data, error } = await supabase
            .from('managers')
            .insert({
                email,
                password_hash: hashedPassword,
                name,
                username: email,
                role: role || 'operator'
            })
            .select('id, name, email, role, created_at')
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Error creating manager:', error);
        res.status(500).json({ error: error.message });
    }
});

// Обновить менеджера (только для админов)
router.patch('/:id', auth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, password } = req.body;

        const updates = {};
        if (name) updates.name = name;
        if (role) updates.role = role;
        if (password) {
            if (password.length < 6) {
                return res.status(400).json({ error: 'Password must be at least 6 characters' });
            }
            updates.password_hash = await bcrypt.hash(password, 10);
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const { data, error } = await supabase
            .from('managers')
            .update(updates)
            .eq('id', id)
            .select('id, name, email, role, created_at')
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Error updating manager:', error);
        res.status(500).json({ error: error.message });
    }
});

// Удалить менеджера (только для админов)
router.delete('/:id', auth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Нельзя удалить самого себя
        if (parseInt(id) === req.manager.id) {
            return res.status(400).json({ error: 'Cannot delete yourself' });
        }

        const { error } = await supabase
            .from('managers')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting manager:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
