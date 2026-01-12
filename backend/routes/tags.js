const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { auth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// --- Settings ---

// Get tag settings
router.get('/settings', auth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'disable_user_tag_creation')
            .single();

        // Default to false if not found
        const disabled = data?.value || false;
        res.json({ disable_user_tag_creation: disabled });
    } catch (error) {
        console.error('Error fetching settings:', error);
        // Default to false on error to avoid blocking
        res.json({ disable_user_tag_creation: false });
    }
});

// Update tag settings (Admin only)
router.post('/settings', auth, requireAdmin, async (req, res) => {
    try {
        const { disable_user_tag_creation } = req.body;

        const { data, error } = await supabase
            .from('app_settings')
            .upsert({
                key: 'disable_user_tag_creation',
                value: disable_user_tag_creation,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(400).json({ error: error.message });
    }
});

// --- Tags CRUD ---

// Get all tags
router.get('/', auth, async (req, res) => {
    try {
        // We also want to return counts of orders using each tag
        // Supabase can do this with select(..., count) on related table if set up properly
        // Or we fetch all tags, and then maybe we need a separate query for counts or join.
        // Given the architecture, let's just fetch tags. Counts can be expensive.
        // But the requirement says "Show counters".
        // We can do: select tags.*, count(order_tags.tag_id) ... group by tags.id
        // But supabase-js simple client doesn't support complex GROUP BY easily without views or rpc.
        // I'll try to use a view or just fetch raw tags for now.
        // If user needs counts, I might need to make a second request or calculate on client if list is small.
        // List of tags is usually small (<100).
        // I can fetch `order_tags` grouped by tag_id.

        // Fetch tags
        const { data: tags, error: tagsError } = await supabase
            .from('tags')
            .select('*')
            .order('name');

        if (tagsError) throw tagsError;

        // Fetch usage counts
        // We can't easily do "select count(*) group by tag_id" in one SDK call without RPC.
        // I'll assume for now client can live without counts OR I do a separate query.
        // Let's try to get counts.
        const { data: allLinks, error: linksError } = await supabase
            .from('order_tags')
            .select('tag_id');

        // Calculate counts in memory (it's fast enough for <10000 links)
        const counts = {};
        if (!linksError && allLinks) {
            allLinks.forEach(l => {
                counts[l.tag_id] = (counts[l.tag_id] || 0) + 1;
            });
        }

        const result = tags.map(t => ({
            ...t,
            count: counts[t.id] || 0
        }));

        res.json(result);
    } catch (error) {
        console.error('Error fetching tags:', error);
        res.status(400).json({ error: error.message });
    }
});

// Create tag
router.post('/', auth, async (req, res) => {
    try {
        const { name, color } = req.body;

        // Check permission
        if (req.manager.role !== 'admin') {
            // Check setting
            const { data: setting } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'disable_user_tag_creation')
                .single();

            if (setting?.value === true) {
                return res.status(403).json({ error: 'Создание тегов запрещено администратором' });
            }
        }

        const { data, error } = await supabase
            .from('tags')
            .insert({ name, color })
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error creating tag:', error);
        res.status(400).json({ error: error.message });
    }
});

// Update tag
router.patch('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, color } = req.body;

        // Check permission logic same as create? Implicitly yes.
        if (req.manager.role !== 'admin') {
            const { data: setting } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'disable_user_tag_creation')
                .single();

            if (setting?.value === true) {
                return res.status(403).json({ error: 'Редактирование тегов запрещено администратором' });
            }
        }

        const { data, error } = await supabase
            .from('tags')
            .update({ name, color })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error updating tag:', error);
        res.status(400).json({ error: error.message });
    }
});

// Delete tag
router.delete('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;

        if (req.manager.role !== 'admin') {
            const { data: setting } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'disable_user_tag_creation')
                .single();

            if (setting?.value === true) {
                return res.status(403).json({ error: 'Удаление тегов запрещено администратором' });
            }
        }

        const { error } = await supabase
            .from('tags')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting tag:', error);
        res.status(400).json({ error: error.message });
    }
});

// --- Order Tags Operations ---

// Add tag to order
router.post('/order/:orderId/assign', auth, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { tag_id } = req.body;

        const { data, error } = await supabase
            .from('order_tags')
            .insert({ order_id: orderId, tag_id })
            .select();

        if (error) {
            if (error.code === '23505') { // Unique violation
                return res.json({ success: true, message: 'Tag already assigned' });
            }
            throw error;
        }

        res.json(data);
    } catch (error) {
        console.error('Error assigning tag:', error);
        res.status(400).json({ error: error.message });
    }
});

// Remove tag from order
router.delete('/order/:orderId/remove/:tagId', auth, async (req, res) => {
    try {
        const { orderId, tagId } = req.params;

        const { error } = await supabase
            .from('order_tags')
            .delete()
            .eq('order_id', orderId)
            .eq('tag_id', tagId);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error removing tag:', error);
        res.status(400).json({ error: error.message });
    }
});

// Get tags for specific order
router.get('/order/:orderId', auth, async (req, res) => {
    try {
        const { orderId } = req.params;

        const { data, error } = await supabase
            .from('order_tags')
            .select('tag:tags(*)')
            .eq('order_id', orderId);

        if (error) throw error;

        // Transform to flat array of tags
        const tags = data.map(item => item.tag).filter(Boolean);
        res.json(tags);
    } catch (error) {
        console.error('Error fetching order tags:', error);
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
