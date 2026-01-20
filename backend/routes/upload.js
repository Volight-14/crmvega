const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const multer = require('multer');

const router = express.Router();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Memory storage for file handling
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});

// Generic upload endpoint
router.post('/', auth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const fileExt = req.file.originalname.split('.').pop();
        const fileName = `templates/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        // Upload to 'attachments' bucket (reusing existing bucket)
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('attachments')
            .upload(fileName, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false
            });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
            .from('attachments')
            .getPublicUrl(fileName);

        res.json({
            url: urlData.publicUrl,
            filename: fileName, // returning path just in case
            originalName: req.file.originalname
        });

    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
