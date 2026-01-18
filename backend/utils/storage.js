const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const BUCKET_NAME = 'attachments';
const FOLDER_NAME = 'avatars';

/**
 * Downloads a file from a URL and uploads it to Supabase Storage
 * @param {string} url - The URL of the image to download
 * @param {string} filename - The target filename (optional, will be generated if not provided)
 * @returns {Promise<string|null>} - The public URL of the uploaded file or null if failed
 */
async function uploadAvatarFromUrl(url, customFilename = null) {
    if (!url) return null;

    try {
        console.log(`[Storage] Downloading avatar from ${url}...`);

        // Download image
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        const contentType = response.headers['content-type'] || 'image/jpeg';

        // Determine extension
        let ext = 'jpg';
        if (contentType.includes('png')) ext = 'png';
        else if (contentType.includes('gif')) ext = 'gif';
        else if (contentType.includes('webp')) ext = 'webp';

        // Generate filename if not provided
        const filename = customFilename
            ? `${customFilename}.${ext}`
            : `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

        const filePath = `${FOLDER_NAME}/${filename}`;

        console.log(`[Storage] Uploading to ${BUCKET_NAME}/${filePath}...`);

        // Upload to Supabase
        const { data, error } = await supabase
            .storage
            .from(BUCKET_NAME)
            .upload(filePath, buffer, {
                contentType: contentType,
                upsert: true
            });

        if (error) {
            console.error('[Storage] Upload error:', error);
            return null;
        }

        // Get Public URL
        const { data: publicUrlData } = supabase
            .storage
            .from(BUCKET_NAME)
            .getPublicUrl(filePath);

        console.log(`[Storage] Upload successful: ${publicUrlData.publicUrl}`);
        return publicUrlData.publicUrl;

    } catch (error) {
        console.error('[Storage] Error processing avatar:', error.message);
        return null;
    }
}

module.exports = {
    uploadAvatarFromUrl
};
