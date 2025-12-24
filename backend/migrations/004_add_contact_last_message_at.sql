ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS contacts_last_message_at_idx ON contacts(last_message_at);
