export type ManagerRole = 'admin' | 'manager' | 'operator';

export interface Manager {
  id: number;
  email: string;
  name: string;
  role?: ManagerRole;
  created_at: string;
}

export interface Message {
  id: number;
  lead_id: string; // Keep lead_id as it maps to main_id or legacy
  main_id?: string;
  author_type: 'manager' | 'user' | 'customer' | 'Клиент' | 'Оператор' | 'Бот' | 'Админ' | 'Менеджер' | 'Служба заботы';
  content: string;
  message_type?: 'text' | 'image' | 'file' | 'voice' | 'video' | 'video_note' | 'sticker';
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
  // Для файлов и голосовых
  file_url?: string;
  file_name?: string;
  voice_duration?: number;
  // Для обратной совместимости
  sender_type?: 'manager' | 'user';
  sender_id?: number;
  telegram_message_id?: number;
  reactions?: any[];
  status?: 'delivered' | 'read' | 'error' | 'blocked' | 'deleted_chat';
  error_message?: string;
  is_read?: boolean;
}

export interface InternalMessage {
  id: number;
  order_id: number; // Renamed from deal_id
  sender_id: number;
  content: string;
  reply_to_id?: number;
  attachment_url?: string;
  attachment_type?: 'file' | 'image' | 'voice';
  attachment_name?: string;
  is_read: boolean;
  created_at: string;
  updated_at: string;
  sender?: Manager;
  message_type?: 'text' | 'image' | 'file' | 'voice' | 'video' | 'video_note' | 'sticker';
  file_url?: string;
  reply_to?: {
    id: number;
    content: string;
    sender?: { name: string };
  };
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

// Статусы заявок (бывшие сделки)
export const ORDER_STATUSES = {
  // Начальные этапы
  unsorted: { label: 'Неразобранное', color: 'default', icon: '📥', order: 0 },

  // Принято операторами
  accepted_anna: { label: 'Принято Анна', color: 'cyan', icon: '👩', order: 1 },
  accepted_kostya: { label: 'Принято Костя', color: 'cyan', icon: '👨', order: 2 },
  accepted_stas: { label: 'Принято Стас', color: 'cyan', icon: '👨', order: 3 },
  accepted_lucy: { label: 'Принято Люси', color: 'cyan', icon: '👩', order: 4 },


  // Рабочие этапы
  in_progress: { label: 'Работа с клиентом', color: 'blue', icon: '💼', order: 5 },
  survey: { label: 'Опрос', color: 'purple', icon: '📋', order: 6 },

  // Передано исполнителям
  transferred_nikita: { label: 'Передано Никите', color: 'orange', icon: '🚀', order: 7 },
  transferred_val: { label: 'Передано Вал Александру', color: 'orange', icon: '🚀', order: 8 },
  transferred_ben: { label: 'Передано Бен Александру', color: 'orange', icon: '🚀', order: 9 },
  transferred_fin: { label: 'Передано Фин Александру', color: 'orange', icon: '🚀', order: 10 },

  // Финальные этапы
  partially_completed: { label: 'Частично исполнена', color: 'lime', icon: '⏳', order: 11 },
  postponed: { label: 'Перенос на завтра', color: 'gold', icon: '📅', order: 12 },

  // Закрытые
  client_rejected: { label: 'Отказ клиента', color: 'red', icon: '❌', order: 13 },
  duplicate: { label: 'Дубль или контакт', color: 'gray', icon: '👯', order: 17 },
  scammer: { label: 'Мошенник', color: 'magenta', icon: '🚫', order: 14 },
  moderation: { label: 'На модерации', color: 'geekblue', icon: '🔍', order: 15 },

  // Успешно закрыта
  completed: { label: 'Успешно реализована', color: 'green', icon: '✅', order: 16 },
} as const;

export type OrderStatus = keyof typeof ORDER_STATUSES;

export interface Contact {
  id: number;
  name: string;
  phone?: string;
  telegram_user_id?: string | number;
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
  orders_count?: number; // Renamed from deals_count
  orders_total_amount?: number; // Renamed
  last_contact_at?: string;
  Date_LastOrder?: string;
  Loyality?: number;
  TotalSumExchanges?: number;
  WhoInvite?: string;
  avatar_url?: string;
}

export interface InboxContact extends Contact {
  last_message?: Message;
  last_active?: string;
  unread_count?: number;
  latest_order_id?: number;
  latest_order_main_id?: string;
  last_order_status?: string;
  responsible_person?: string;
}

export interface Order { // Renamed from Deal
  id: number;
  contact_id?: number;
  lead_id?: number; // Legacy
  main_id?: string; // Main ID
  external_id?: string; // Legacy Bubble ID
  title: string; // Alias for OrderName (legacy frontend support)
  OrderName?: string; // New field
  amount: number;
  currency: string;
  status: OrderStatus;
  source?: string;
  description?: string; // Alias for Comment (legacy)
  Comment?: string; // New field
  due_date?: string;
  closed_date?: string;
  close_reason?: string;
  manager_id?: number;
  created_at: string;
  updated_at: string;
  contact?: Contact | { name?: string; email?: string; phone?: string } | null;
  manager?: Manager;
  tags?: Tag[];

  // Bubble Synced Fields
  OrderDate?: string;
  CurrPair1?: string;
  CurrPair2?: string;
  SumInput?: number;
  SumOutput?: number;
  BankRus01?: string;
  BankRus02?: string;
  BankEsp?: string;
  CityRus01?: string;
  CityRus02?: string;
  CityEsp01?: string;
  CityEsp02?: string;
  DeliveryTime?: string;
  OrderPaid?: boolean;
  PayNow?: string;
  Remote?: boolean;
  NextDay?: string;
  ATM?: string;
  ATM_Esp?: string;
  AttachedCheck?: string;
  Card_NumberOrSBP?: string;
  ClientCryptoWallet?: string;
  ClientIBAN?: string;
  End_address?: string;
  Location1?: string;
  Location2?: string;
  MessageIBAN?: string;
  NetworkUSDT01?: string;
  NetworkUSDT02?: string;
  New_address?: string;
  OrderStatus?: string;
  Ordertime?: string;
  PayeeName?: string;
  tg_amo?: string;

  CashbackEUR?: number;
  CashbackUSDT?: number;
  LoyPoints?: number;
  SumEquivalentEUR?: number;
  SumPartly?: number;

  WhenDone?: string;
  first_order?: boolean;
  Is_application_accepted?: boolean;
  On_site?: boolean;
  Request_address?: boolean;

  Manager_Bubble?: string;
  Operators_Bubble?: string;
  BubbleUser?: string;

  plused_temp?: string;
  plused_temp2?: string;
  UndoStep?: string;
  OnlineExchInfo?: string;
  last_message?: Message;
  unread_count?: number;
}

export interface Note {
  id: number;
  contact_id?: number;
  order_id?: number; // Renamed from deal_id
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
  count?: number;
}

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
  trigger_type: 'order_created' | 'order_status_changed' | 'contact_created' | 'message_received' | 'order_amount_threshold';
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
  order_created: { label: 'Заявка создана', icon: '📝' },
  order_status_changed: { label: 'Статус заявки изменен', icon: '🔄' },
  contact_created: { label: 'Контакт создан', icon: '👤' },
  message_received: { label: 'Получено сообщение', icon: '💬' },
  order_amount_threshold: { label: 'Сумма заявки превышена', icon: '💰' },
} as const;

export const ACTION_TYPES = {
  assign_manager: { label: 'Назначить менеджера', icon: '👨‍💼' },
  add_tag: { label: 'Добавить тег', icon: '🏷️' },
  create_note: { label: 'Создать заметку', icon: '📄' },
  update_status: { label: 'Изменить статус', icon: '🔄' },
  send_notification: { label: 'Отправить уведомление', icon: '🔔' },
  send_email: { label: 'Отправить email', icon: '📧' },
} as const;

// ... AI Types unchanged ...
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
