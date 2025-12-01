export type ManagerRole = 'admin' | 'manager' | 'operator';

export interface Manager {
  id: number;
  email: string;
  name: string;
  role?: ManagerRole;
  created_at: string;
}

export interface Chat {
  id: number;
  status?: string;
  'Created Date'?: string;
  AMOid_new?: number;
  lead_id?: string;
  client?: string;
  chat_id?: string;
  amojo_id_client?: string;
  talk_id?: string;
  'Modified Date'?: string;
  'Created By'?: string;
  messages?: Message[];
  // Для обратной совместимости
  name?: string;
  phone?: string;
  email?: string;
  source?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  manager_id?: number;
  telegram_user_id?: number;
  manager?: Manager;
}

// Алиас для обратной совместимости
export type Lead = Chat;

export interface Message {
  id: number;
  lead_id: string;
  author_type: 'manager' | 'user';
  content: string;
  message_type?: 'text' | 'image' | 'file';
  message_id_tg?: number | string;
  timestamp?: number;
  'Modified Date'?: string;
  'Created By'?: string;
  author_amojo_id?: string;
  message_id_amo?: string;
  user?: string;
  reply_to_mess_id_tg?: number | string;
  caption?: string;
  conversation_id?: string;
  order_status?: string;
  'Created Date'?: string;
  created_at?: string;
  sender?: Manager;
  // Для обратной совместимости
  sender_type?: 'manager' | 'user';
  sender_id?: number;
  telegram_message_id?: number;
}

export interface AuthContextType {
  manager: Manager | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export const LEAD_STATUSES = {
  new: { label: 'Новая', color: 'blue' },
  contacted: { label: 'Контакт установлен', color: 'orange' },
  in_progress: { label: 'В работе', color: 'yellow' },
  qualified: { label: 'Квалифицирована', color: 'purple' },
  lost: { label: 'Потеряна', color: 'red' },
  won: { label: 'Выиграна', color: 'green' },
} as const;

// Новые типы для расширенной CRM
export interface Contact {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  position?: string;
  address?: string;
  birthday?: string;
  rating?: number;
  status: 'active' | 'inactive' | 'needs_attention';
  comment?: string;
  manager_id?: number;
  created_at: string;
  updated_at: string;
  manager?: Manager;
  tags?: Tag[];
  deals_count?: number;
  deals_total_amount?: number;
  last_contact_at?: string;
}

export interface Deal {
  id: number;
  contact_id?: number;
  lead_id?: number; // для совместимости
  title: string;
  amount: number;
  currency: string;
  status: 'new' | 'negotiation' | 'waiting' | 'ready_to_close' | 'rejected' | 'closed';
  source?: string;
  description?: string;
  due_date?: string;
  closed_date?: string;
  close_reason?: string;
  manager_id?: number;
  created_at: string;
  updated_at: string;
  contact?: Contact | { name?: string; email?: string; phone?: string } | null;
  manager?: Manager;
  tags?: Tag[];
}

export interface Note {
  id: number;
  contact_id?: number;
  deal_id?: number;
  manager_id: number;
  content: string;
  priority: 'urgent' | 'important' | 'info' | 'reminder';
  created_at: string;
  updated_at: string;
  manager?: Manager;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
  category?: string;
  created_at: string;
}

export const DEAL_STATUSES = {
  new: { label: 'Новая', color: 'blue', icon: '📝' },
  negotiation: { label: 'Переговоры', color: 'orange', icon: '💬' },
  waiting: { label: 'Ожидание', color: 'gold', icon: '⏳' },
  ready_to_close: { label: 'Готова к закрытию', color: 'lime', icon: '✅' },
  rejected: { label: 'Отказ', color: 'red', icon: '❌' },
  closed: { label: 'Закрыта', color: 'default', icon: '🏁' },
} as const;

export const NOTE_PRIORITIES = {
  urgent: { label: 'Срочно', color: 'red', icon: '🔴' },
  important: { label: 'Важно', color: 'orange', icon: '🟡' },
  info: { label: 'Информация', color: 'green', icon: '🟢' },
  reminder: { label: 'Напоминание', color: 'blue', icon: '🔵' },
} as const;

export interface Automation {
  id: number;
  name: string;
  description?: string;
  trigger_type: 'deal_created' | 'deal_status_changed' | 'contact_created' | 'message_received' | 'deal_amount_threshold';
  trigger_conditions?: {
    field?: string;
    operator?: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
    value?: any;
  };
  action_type: 'assign_manager' | 'add_tag' | 'create_note' | 'update_status' | 'send_notification' | 'send_email';
  action_config: Record<string, any>;
  is_active: boolean;
  manager_id?: number;
  created_at: string;
  updated_at: string;
  manager?: Manager;
}

export const TRIGGER_TYPES = {
  deal_created: { label: 'Сделка создана', icon: '📝' },
  deal_status_changed: { label: 'Статус сделки изменен', icon: '🔄' },
  contact_created: { label: 'Контакт создан', icon: '👤' },
  message_received: { label: 'Получено сообщение', icon: '💬' },
  deal_amount_threshold: { label: 'Сумма сделки превышена', icon: '💰' },
} as const;

export const ACTION_TYPES = {
  assign_manager: { label: 'Назначить менеджера', icon: '👨‍💼' },
  add_tag: { label: 'Добавить тег', icon: '🏷️' },
  create_note: { label: 'Создать заметку', icon: '📄' },
  update_status: { label: 'Изменить статус', icon: '🔄' },
  send_notification: { label: 'Отправить уведомление', icon: '🔔' },
  send_email: { label: 'Отправить email', icon: '📧' },
} as const;

// ============================================
// AI AGENT TYPES
// ============================================

export interface AISettings {
  model: string;
  temperature: number;
  max_tokens: number;
  system_prompt: string;
  auto_suggestions_enabled: boolean;
  min_delay_seconds: number;
}

export interface AISettingsRaw {
  id: number;
  key: string;
  value: any;
  description?: string;
  updated_at: string;
  updated_by?: number;
}

export interface OperatorStyle {
  id: number;
  operator_id: string;
  operator_name: string;
  telegram_user_id?: number;
  role?: string;
  style_data: {
    summary?: string;
    tone?: string;
    patterns?: string;
    phrases?: string;
    [key: string]: any;
  };
  created_at: string;
  updated_at: string;
}

export interface KnowledgeArticle {
  id: number;
  title?: string;
  category?: string;
  subcategory?: string;
  content?: string;
  priority?: string;
  status?: string;
  tags?: string;
  target_audience?: string;
  created_at: string;
  updated_at: string;
}

export interface AnswerScript {
  id: number;
  question_number?: number;
  question?: string;
  answer?: string;
  note?: string;
  created_at: string;
}

export interface WebsiteContent {
  id: number;
  title?: string;
  content?: string;
  section?: string;
  created_at: string;
}

export interface AISuggestion {
  id: number;
  lead_id: string;
  message_id?: number;
  operator_id: string;
  client_message: string;
  suggested_response: string;
  context_summary?: string;
  knowledge_used?: any;
  qc_issues?: any;
  feedback?: string;
  sent_to_telegram: boolean;
  sent_at?: string;
  operator_used: boolean;
  created_at: string;
}

export interface SuccessfulResponse {
  id: number;
  lead_id?: string;
  client_message: string;
  operator_response: string;
  operator_id?: number;
  operator_name?: string;
  source?: string;
  original_suggestion_id?: number;
  feedback_type?: string;
  created_at: string;
}

export interface AIAnalytics {
  total: number;
  sent: number;
  feedbackStats: {
    good: number;
    bad: number;
    edited: number;
    no_feedback: number;
  };
  dailyStats: Array<{ date: string; count: number }>;
  successfulResponsesCount: number;
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  recommended?: boolean;
}

// ============================================
// AI INSTRUCTIONS TYPES
// ============================================

export type InstructionLevel = 1 | 2 | 3;

export interface InstructionLevelInfo {
  name: 'law' | 'priority' | 'normal';
  label: string;
  description: string;
}

export interface AIInstruction {
  id: number;
  level: InstructionLevel;
  title: string;
  content: string;
  category?: string;
  is_active: boolean;
  sort_order: number;
  created_by?: number;
  created_at: string;
  updated_at: string;
  // Дополнительные поля от API
  level_info?: InstructionLevelInfo;
  can_edit?: boolean;
  can_delete?: boolean;
}

export const INSTRUCTION_LEVELS: Record<InstructionLevel, InstructionLevelInfo> = {
  1: { name: 'law', label: 'Закон', description: 'Неизменяемые правила, нарушать запрещено' },
  2: { name: 'priority', label: 'Приоритетная', description: 'Важные инструкции от администрации' },
  3: { name: 'normal', label: 'Обычная', description: 'Дополнительные инструкции для тонкой настройки' }
};

export const INSTRUCTION_LEVEL_COLORS: Record<InstructionLevel, string> = {
  1: 'red',
  2: 'orange', 
  3: 'blue'
};

export const INSTRUCTION_LEVEL_ICONS: Record<InstructionLevel, string> = {
  1: '⚖️',
  2: '⭐',
  3: '📝'
};
