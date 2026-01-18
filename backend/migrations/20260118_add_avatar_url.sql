-- Migration to add avatar_url to contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS avatar_url TEXT;
