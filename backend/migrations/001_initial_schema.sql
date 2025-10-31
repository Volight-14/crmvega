-- Создание таблицы менеджеров
CREATE TABLE managers (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создание таблицы заявок (leads)
CREATE TABLE leads (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  source VARCHAR(100), -- откуда пришла заявка (сайт, бот, звонок и т.д.)
  description TEXT,
  status VARCHAR(50) DEFAULT 'new', -- new, contacted, in_progress, qualified, lost, won
  manager_id INTEGER REFERENCES managers(id),
  telegram_user_id BIGINT, -- ID пользователя в Telegram
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создание таблицы сообщений
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  sender_id INTEGER, -- ID отправителя (может быть менеджер или пользователь)
  sender_type VARCHAR(20) NOT NULL, -- 'manager' или 'user'
  content TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text', -- text, image, file и т.д.
  telegram_message_id BIGINT, -- ID сообщения в Telegram
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы для производительности
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_manager_id ON leads(manager_id);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_messages_lead_id ON messages(lead_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- Row Level Security (RLS) политики
ALTER TABLE managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Политики для менеджеров (каждый видит только себя)
CREATE POLICY "Managers can view own data" ON managers
  FOR ALL USING (auth.uid()::text = id::text);

-- Политики для заявок
CREATE POLICY "Managers can view all leads" ON leads FOR SELECT USING (true);
CREATE POLICY "Managers can insert leads" ON leads FOR INSERT WITH CHECK (true);
CREATE POLICY "Managers can update leads" ON leads FOR UPDATE USING (true);

-- Политики для сообщений
CREATE POLICY "Managers can view all messages" ON messages FOR SELECT USING (true);
CREATE POLICY "Managers can insert messages" ON messages FOR INSERT WITH CHECK (true);

-- Функция для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггеры для автообновления updated_at
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_managers_updated_at BEFORE UPDATE ON managers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
