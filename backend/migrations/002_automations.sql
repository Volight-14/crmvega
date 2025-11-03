-- Создание таблицы автоматизаций
CREATE TABLE automations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  trigger_type VARCHAR(50) NOT NULL, -- 'deal_created', 'deal_status_changed', 'contact_created', 'message_received', etc.
  trigger_conditions JSONB, -- Условия триггера (например, {"field": "status", "operator": "equals", "value": "new"})
  action_type VARCHAR(50) NOT NULL, -- 'send_notification', 'assign_manager', 'add_tag', 'create_note', 'send_email', etc.
  action_config JSONB NOT NULL, -- Конфигурация действия (например, {"manager_id": 1} или {"tag_id": 5})
  is_active BOOLEAN DEFAULT true,
  manager_id INTEGER REFERENCES managers(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_automations_trigger_type ON automations(trigger_type);
CREATE INDEX idx_automations_is_active ON automations(is_active);

-- RLS
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;

-- Политики
CREATE POLICY "Managers can view all automations" ON automations FOR SELECT USING (true);
CREATE POLICY "Managers can insert automations" ON automations FOR INSERT WITH CHECK (true);
CREATE POLICY "Managers can update automations" ON automations FOR UPDATE USING (true);
CREATE POLICY "Managers can delete automations" ON automations FOR DELETE USING (true);

-- Триггер для обновления updated_at
CREATE TRIGGER update_automations_updated_at BEFORE UPDATE ON automations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

