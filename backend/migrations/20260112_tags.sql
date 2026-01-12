-- Create tags table
CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create order_tags junction table
CREATE TABLE IF NOT EXISTS order_tags (
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (order_id, tag_id)
);

-- Create settings table for global configs
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_order_tags_tag_id ON order_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_order_tags_order_id ON order_tags(order_id);

-- Default setting for tag creation permission
INSERT INTO app_settings (key, value, description)
VALUES ('disable_user_tag_creation', 'false'::jsonb, 'If true, only admins can create new tags')
ON CONFLICT (key) DO NOTHING;
