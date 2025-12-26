-- Add 'reactions' column to 'messages' table to store Telegram reactions
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '[]'::jsonb;
