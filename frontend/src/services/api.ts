import axios from 'axios';
import {
  Manager, Lead, Message, Contact, Deal, Note, Automation, ApiResponse,
  AISettings, AISettingsRaw, OperatorStyle, KnowledgeArticle, AnswerScript,
  WebsiteContent, AISuggestion, SuccessfulResponse, AIAnalytics, AIModel,
  AIInstruction, InstructionLevel, InstructionLevelInfo, InternalMessage
} from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://crmvega.vercel.app/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Добавляем токен авторизации к каждому запросу
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Автоматический logout при 401 (невалидный/просроченный токен)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Токен невалидный или просрочен — разлогиниваем
      const currentPath = window.location.pathname;
      // Не редиректим если уже на странице логина или сброса пароля
      if (!currentPath.includes('/login') && !currentPath.includes('/reset-password')) {
        localStorage.removeItem('token');
        localStorage.removeItem('manager');
        window.location.href = '/login?expired=1';
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: async (email: string, password: string): Promise<{ token: string; manager: Manager }> => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  register: async (email: string, password: string, name: string): Promise<{ token: string; manager: Manager }> => {
    const response = await api.post('/auth/register', { email, password, name });
    return response.data;
  },

  forgotPassword: async (email: string): Promise<{ success: boolean; message: string }> => {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },

  resetPassword: async (token: string, password: string): Promise<{ success: boolean; message: string }> => {
    const response = await api.post('/auth/reset-password', { token, password });
    return response.data;
  },

  verifyResetToken: async (token: string): Promise<{ valid: boolean; email?: string; error?: string }> => {
    const response = await api.get(`/auth/verify-reset-token/${token}`);
    return response.data;
  },
};

// Chats API (было Leads)
export const leadsAPI = {
  getAll: async (params?: { status?: string; limit?: number; offset?: number }): Promise<{ leads: Lead[]; total: number }> => {
    const response = await api.get('/chats', { params });
    return response.data;
  },

  getById: async (id: number): Promise<Lead> => {
    const response = await api.get(`/chats/${id}`);
    return response.data;
  },

  create: async (lead: Omit<Lead, 'id' | 'Created Date' | 'Modified Date'>): Promise<Lead> => {
    const response = await api.post('/chats', lead);
    return response.data;
  },

  updateStatus: async (id: number, status: string, managerId?: number): Promise<Lead> => {
    const response = await api.patch(`/chats/${id}/status`, { status, manager_id: managerId });
    return response.data;
  },
};

// Messages API
export const messagesAPI = {
  getByLeadId: async (leadId: string | number, params?: { limit?: number; offset?: number }): Promise<Message[]> => {
    const response = await api.get(`/messages/lead/${leadId}`, { params });
    return response.data;
  },

  send: async (message: { lead_id: string | number; content: string; author_type?: 'manager' | 'user' }): Promise<Message> => {
    const response = await api.post('/messages', { ...message, sender_type: message.author_type });
    return response.data;
  },
};

// Contacts API
export const contactsAPI = {
  getAll: async (params?: { search?: string; status?: string; limit?: number; offset?: number }): Promise<{ contacts: Contact[] }> => {
    const response = await api.get('/contacts', { params });
    return response.data;
  },

  getById: async (id: number): Promise<Contact> => {
    const response = await api.get(`/contacts/${id}`);
    return response.data;
  },

  create: async (contact: Omit<Contact, 'id' | 'created_at' | 'updated_at'>): Promise<Contact> => {
    const response = await api.post('/contacts', contact);
    return response.data;
  },

  update: async (id: number, contact: Partial<Contact>): Promise<Contact> => {
    const response = await api.patch(`/contacts/${id}`, contact);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/contacts/${id}`);
  },
};

// Deals API
export const dealsAPI = {
  getAll: async (params?: { contact_id?: number; status?: string; limit?: number; offset?: number }): Promise<{ deals: Deal[] }> => {
    const response = await api.get('/deals', { params });
    return response.data;
  },

  getById: async (id: number): Promise<Deal> => {
    const response = await api.get(`/deals/${id}`);
    return response.data;
  },

  create: async (deal: Omit<Deal, 'id' | 'created_at' | 'updated_at'>): Promise<Deal> => {
    const response = await api.post('/deals', deal);
    return response.data;
  },

  update: async (id: number, deal: Partial<Deal>): Promise<Deal> => {
    const response = await api.patch(`/deals/${id}`, deal);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/deals/${id}`);
  },
};

// Notes API
export const notesAPI = {
  getByContactId: async (contactId: number): Promise<Note[]> => {
    const response = await api.get(`/notes/contact/${contactId}`);
    return response.data;
  },

  getByDealId: async (dealId: number): Promise<Note[]> => {
    const response = await api.get(`/notes/deal/${dealId}`);
    return response.data;
  },

  create: async (note: Omit<Note, 'id' | 'created_at' | 'updated_at' | 'manager'>): Promise<Note> => {
    const response = await api.post('/notes', note);
    return response.data;
  },

  update: async (id: number, note: Partial<Note>): Promise<Note> => {
    const response = await api.patch(`/notes/${id}`, note);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/notes/${id}`);
  },
};

// Messages API - расширение для контактов
export const contactMessagesAPI = {
  getByContactId: async (contactId: number, params?: { limit?: number; offset?: number }): Promise<Message[]> => {
    const response = await api.get(`/messages/contact/${contactId}`, { params });
    return response.data;
  },

  sendToContact: async (contactId: number, content: string, author_type?: 'manager' | 'user'): Promise<Message> => {
    const response = await api.post(`/messages/contact/${contactId}`, { content, sender_type: author_type });
    return response.data;
  },
};

// Deal Messages API - для чата внутри сделки
export const dealMessagesAPI = {
  // Получить сообщения клиента (из Telegram)
  getClientMessages: async (dealId: number, params?: { limit?: number; offset?: number }): Promise<{
    messages: Message[];
    total: number;
    chatLeadId?: string;
    externalId?: string;
  }> => {
    const response = await api.get(`/deal-messages/${dealId}/client`, { params });
    return response.data;
  },

  // Отправить текстовое сообщение клиенту
  sendClientMessage: async (dealId: number, content: string, replyToMessageId?: number): Promise<Message> => {
    const response = await api.post(`/deal-messages/${dealId}/client`, {
      content,
      reply_to_message_id: replyToMessageId,
    });
    return response.data;
  },

  // Отправить файл клиенту
  sendClientFile: async (dealId: number, file: File, caption?: string, replyToMessageId?: number): Promise<Message> => {
    const formData = new FormData();
    formData.append('file', file);
    if (caption) formData.append('caption', caption);
    if (replyToMessageId) formData.append('reply_to_message_id', replyToMessageId.toString());

    const response = await api.post(`/deal-messages/${dealId}/client/file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Отправить голосовое сообщение клиенту
  sendClientVoice: async (dealId: number, voice: Blob, duration?: number, replyToMessageId?: number): Promise<Message> => {
    const formData = new FormData();
    formData.append('voice', voice, 'voice.ogg');
    if (duration) formData.append('duration', duration.toString());
    if (replyToMessageId) formData.append('reply_to_message_id', replyToMessageId.toString());

    const response = await api.post(`/deal-messages/${dealId}/client/voice`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Получить внутренние сообщения
  getInternalMessages: async (dealId: number, params?: { limit?: number; offset?: number }): Promise<{
    messages: InternalMessage[];
    total: number;
  }> => {
    const response = await api.get(`/deal-messages/${dealId}/internal`, { params });
    return response.data;
  },

  // Отправить внутреннее сообщение
  sendInternalMessage: async (dealId: number, content: string, replyToId?: number): Promise<InternalMessage> => {
    const response = await api.post(`/deal-messages/${dealId}/internal`, {
      content,
      reply_to_id: replyToId,
    });
    return response.data;
  },

  // Отправить внутренний файл
  sendInternalFile: async (dealId: number, file: File, replyToId?: number): Promise<InternalMessage> => {
    const formData = new FormData();
    formData.append('file', file);
    if (replyToId) formData.append('reply_to_id', replyToId.toString());

    const response = await api.post(`/deal-messages/${dealId}/internal/file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Отметить как прочитанные
  markAsRead: async (dealId: number, messageIds?: number[]): Promise<void> => {
    await api.post(`/deal-messages/${dealId}/internal/read`, { message_ids: messageIds });
  },

  // Получить количество непрочитанных
  getUnreadCount: async (dealId: number): Promise<{ count: number }> => {
    const response = await api.get(`/deal-messages/${dealId}/internal/unread`);
    return response.data;
  },
};

// Analytics API
export const analyticsAPI = {
  getDealsAnalytics: async (params?: { startDate?: string; endDate?: string }) => {
    const response = await api.get('/analytics/deals', { params });
    return response.data;
  },

  getContactsAnalytics: async () => {
    const response = await api.get('/analytics/contacts');
    return response.data;
  },
};

// Automations API
export const automationsAPI = {
  getAll: async (params?: { is_active?: boolean }): Promise<{ automations: Automation[] }> => {
    const response = await api.get('/automations', { params });
    return response.data;
  },

  getById: async (id: number): Promise<Automation> => {
    const response = await api.get(`/automations/${id}`);
    return response.data;
  },

  create: async (automation: Omit<Automation, 'id' | 'created_at' | 'updated_at' | 'manager'>): Promise<Automation> => {
    const response = await api.post('/automations', automation);
    return response.data;
  },

  update: async (id: number, automation: Partial<Automation>): Promise<Automation> => {
    const response = await api.patch(`/automations/${id}`, automation);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/automations/${id}`);
  },

  execute: async (id: number, entityType: string, entityId: number): Promise<void> => {
    await api.post(`/automations/${id}/execute`, { entityType, entityId });
  },
};

// AI Agent API
export const aiAPI = {
  // Настройки
  getSettings: async (): Promise<{ settings: AISettings; raw: AISettingsRaw[] }> => {
    const response = await api.get('/ai/settings');
    return response.data;
  },

  updateSetting: async (key: string, value: any): Promise<AISettingsRaw> => {
    const response = await api.patch(`/ai/settings/${key}`, { value });
    return response.data;
  },

  updateSettingsBatch: async (settings: Partial<AISettings>): Promise<void> => {
    await api.post('/ai/settings/batch', { settings });
  },

  // Модели
  getModels: async (): Promise<{ models: AIModel[] }> => {
    const response = await api.get('/ai/models');
    return response.data;
  },

  // Операторы
  getOperators: async (): Promise<{ operators: OperatorStyle[] }> => {
    const response = await api.get('/ai/operators');
    return response.data;
  },

  getOperator: async (id: number): Promise<OperatorStyle> => {
    const response = await api.get(`/ai/operators/${id}`);
    return response.data;
  },

  createOperator: async (operator: Partial<OperatorStyle>): Promise<OperatorStyle> => {
    const response = await api.post('/ai/operators', operator);
    return response.data;
  },

  updateOperator: async (id: number, operator: Partial<OperatorStyle>): Promise<OperatorStyle> => {
    const response = await api.patch(`/ai/operators/${id}`, operator);
    return response.data;
  },

  deleteOperator: async (id: number): Promise<void> => {
    await api.delete(`/ai/operators/${id}`);
  },

  // База знаний
  getKnowledge: async (params?: { category?: string; search?: string }): Promise<{ articles: KnowledgeArticle[] }> => {
    const response = await api.get('/ai/knowledge', { params });
    return response.data;
  },

  getKnowledgeArticle: async (id: number): Promise<KnowledgeArticle> => {
    const response = await api.get(`/ai/knowledge/${id}`);
    return response.data;
  },

  createKnowledgeArticle: async (article: Partial<KnowledgeArticle>): Promise<KnowledgeArticle> => {
    const response = await api.post('/ai/knowledge', article);
    return response.data;
  },

  updateKnowledgeArticle: async (id: number, article: Partial<KnowledgeArticle>): Promise<KnowledgeArticle> => {
    const response = await api.patch(`/ai/knowledge/${id}`, article);
    return response.data;
  },

  deleteKnowledgeArticle: async (id: number): Promise<void> => {
    await api.delete(`/ai/knowledge/${id}`);
  },

  getKnowledgeCategories: async (): Promise<{ categories: string[] }> => {
    const response = await api.get('/ai/knowledge-categories');
    return response.data;
  },

  // Скрипты ответов
  getScripts: async (params?: { search?: string }): Promise<{ scripts: AnswerScript[] }> => {
    const response = await api.get('/ai/scripts', { params });
    return response.data;
  },

  getScript: async (id: number): Promise<AnswerScript> => {
    const response = await api.get(`/ai/scripts/${id}`);
    return response.data;
  },

  createScript: async (script: Partial<AnswerScript>): Promise<AnswerScript> => {
    const response = await api.post('/ai/scripts', script);
    return response.data;
  },

  updateScript: async (id: number, script: Partial<AnswerScript>): Promise<AnswerScript> => {
    const response = await api.patch(`/ai/scripts/${id}`, script);
    return response.data;
  },

  deleteScript: async (id: number): Promise<void> => {
    await api.delete(`/ai/scripts/${id}`);
  },

  // Контент сайта
  getWebsiteContent: async (params?: { section?: string; search?: string }): Promise<{ content: WebsiteContent[] }> => {
    const response = await api.get('/ai/website-content', { params });
    return response.data;
  },

  getWebsiteContentItem: async (id: number): Promise<WebsiteContent> => {
    const response = await api.get(`/ai/website-content/${id}`);
    return response.data;
  },

  createWebsiteContent: async (content: Partial<WebsiteContent>): Promise<WebsiteContent> => {
    const response = await api.post('/ai/website-content', content);
    return response.data;
  },

  updateWebsiteContent: async (id: number, content: Partial<WebsiteContent>): Promise<WebsiteContent> => {
    const response = await api.patch(`/ai/website-content/${id}`, content);
    return response.data;
  },

  deleteWebsiteContent: async (id: number): Promise<void> => {
    await api.delete(`/ai/website-content/${id}`);
  },

  getWebsiteSections: async (): Promise<{ sections: string[] }> => {
    const response = await api.get('/ai/website-sections');
    return response.data;
  },

  // Аналитика
  getAnalytics: async (): Promise<AIAnalytics> => {
    const response = await api.get('/ai/analytics');
    return response.data;
  },

  getSuggestions: async (params?: { limit?: number; feedback?: string }): Promise<{ suggestions: AISuggestion[] }> => {
    const response = await api.get('/ai/suggestions', { params });
    return response.data;
  },

  getSuccessfulResponses: async (params?: { limit?: number }): Promise<{ responses: SuccessfulResponse[] }> => {
    const response = await api.get('/ai/successful-responses', { params });
    return response.data;
  },

  // Тестирование
  testSuggestion: async (data: { client_message: string; lead_id?: string; operator_id?: number }): Promise<any> => {
    const response = await api.post('/ai/test-suggestion', data);
    return response.data;
  },

  // ============================================
  // ИНСТРУКЦИИ AI
  // ============================================

  // Получить все инструкции
  getInstructions: async (params?: {
    level?: InstructionLevel;
    is_active?: boolean;
    category?: string
  }): Promise<{
    instructions: AIInstruction[];
    levels: Record<InstructionLevel, InstructionLevelInfo>;
    user_role: string;
  }> => {
    const response = await api.get('/ai/instructions', { params });
    return response.data;
  },

  // Получить инструкцию по ID
  getInstruction: async (id: number): Promise<AIInstruction> => {
    const response = await api.get(`/ai/instructions/${id}`);
    return response.data;
  },

  // Создать инструкцию
  createInstruction: async (instruction: Partial<AIInstruction>): Promise<AIInstruction> => {
    const response = await api.post('/ai/instructions', instruction);
    return response.data;
  },

  // Обновить инструкцию
  updateInstruction: async (id: number, instruction: Partial<AIInstruction>): Promise<AIInstruction> => {
    const response = await api.patch(`/ai/instructions/${id}`, instruction);
    return response.data;
  },

  // Удалить инструкцию
  deleteInstruction: async (id: number): Promise<void> => {
    await api.delete(`/ai/instructions/${id}`);
  },

  // Получить инструкции для промпта (форматированный текст)
  getInstructionsForPrompt: async (): Promise<{
    prompt_text: string;
    counts: { laws: number; priority: number; normal: number }
  }> => {
    const response = await api.get('/ai/instructions/for-prompt');
    return response.data;
  },

  // Получить категории инструкций
  getInstructionCategories: async (): Promise<{ categories: string[] }> => {
    const response = await api.get('/ai/instructions-categories');
    return response.data;
  },

  // ============================================
  // АНАЛИТИКА КОРРЕКТИРОВОК
  // ============================================

  // Получить аналитику корректировок промптов
  getPromptAnalytics: async (params?: { days?: number }): Promise<{
    current: {
      date: string;
      edit_rate: number;
      acceptance_rate: number;
      total_suggestions: number;
      used_suggestions: number;
      edited_suggestions: number;
      avg_similarity: number;
      edit_type_distribution: Record<string, number>;
    };
    target: {
      edit_rate: number;
      met: boolean;
      gap: number;
    };
    trend: Array<{ date: string; edit_rate: number; acceptance_rate: number; total: number }>;
    recommendations: string;
    daily_stats: any[];
  }> => {
    const response = await api.get('/ai/prompt-analytics', { params });
    return response.data;
  },

  // Получить рекомендации по улучшению
  getPromptImprovements: async (params?: { status?: string; limit?: number }): Promise<{ improvements: any[] }> => {
    const response = await api.get('/ai/prompt-improvements', { params });
    return response.data;
  },

  // Обновить статус рекомендации
  updatePromptImprovement: async (id: number, data: { status: string }): Promise<any> => {
    const response = await api.patch(`/ai/prompt-improvements/${id}`, data);
    return response.data;
  },

  // Запустить анализ вручную
  runDailyAnalysis: async (date?: string): Promise<any> => {
    const response = await api.post('/ai/run-daily-analysis', { date });
    return response.data;
  },

  // Получить примеры корректировок
  getEditExamples: async (params?: { limit?: number; edit_type?: string }): Promise<{ examples: any[] }> => {
    const response = await api.get('/ai/edit-examples', { params });
    return response.data;
  },
};

export default api;
