export interface Manager {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

export interface Lead {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  source?: string;
  description?: string;
  status: 'new' | 'contacted' | 'in_progress' | 'qualified' | 'lost' | 'won';
  manager_id?: number;
  telegram_user_id?: number;
  created_at: string;
  updated_at: string;
  messages?: Message[];
  manager?: Manager;
}

export interface Message {
  id: number;
  lead_id: number;
  sender_id: number;
  sender_type: 'manager' | 'user';
  content: string;
  message_type: 'text' | 'image' | 'file';
  telegram_message_id?: number;
  created_at: string;
  sender?: Manager;
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
