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
