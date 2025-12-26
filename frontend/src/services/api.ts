import axios from 'axios';
import {
  Manager, Message, Contact, InboxContact, Order, Note, Automation, ApiResponse,
  AISettings, AISettingsRaw, OperatorStyle, KnowledgeArticle, AnswerScript,
  WebsiteContent, AISuggestion, SuccessfulResponse, AIAnalytics, AIModel,
  AIInstruction, InstructionLevel, InstructionLevelInfo, InternalMessage
} from '../types';

// Backend is deployed on Render (not Vercel!)
// Production URL is set via REACT_APP_API_URL in Vercel environment variables
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
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

// Messages API
export const messagesAPI = {
  getByLeadId: async (leadId: string | number, params?: { limit?: number; offset?: number }): Promise<Message[]> => {
    const response = await api.get(`/messages/lead/${leadId}`, { params });
    return response.data;
  },
  // REMOVED: send() method - backend endpoint deleted
  // Use contactMessagesAPI.sendToContact() or orderMessagesAPI.sendClientMessage() instead
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

  getSummary: async (params?: { limit?: number; offset?: number; search?: string }): Promise<InboxContact[]> => {
    const response = await api.get('/contacts/summary', { params });
    return response.data;
  },
};

// Orders API (Renamed from Deals API)
export const ordersAPI = {
  getAll: async (params?: { contact_id?: number; status?: string; limit?: number; offset?: number; minimal?: boolean }): Promise<{ orders: Order[] }> => {
    // If backend expects 'deals' response structure or 'orders', ensure backend returns { orders: [] }
    const response = await api.get('/orders', { params });
    return response.data;
  },

  getById: async (id: number): Promise<Order> => {
    const response = await api.get(`/orders/${id}`);
    return response.data;
  },

  create: async (order: Omit<Order, 'id' | 'created_at' | 'updated_at'>): Promise<Order> => {
    const response = await api.post('/orders', order);
    return response.data;
  },

  update: async (id: number, order: Partial<Order>): Promise<Order> => {
    const response = await api.patch(`/orders/${id}`, order);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/orders/${id}`);
  },
};

// Notes API
export const notesAPI = {
  getByContactId: async (contactId: number): Promise<Note[]> => {
    const response = await api.get(`/notes/contact/${contactId}`);
    return response.data;
  },

  getByOrderId: async (orderId: number): Promise<Note[]> => { // Renamed from getByDealId
    const response = await api.get(`/notes/order/${orderId}`);
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

// Order Messages API - для чата внутри заявки (Renamed from Deal Messages API)
export const orderMessagesAPI = {
  // Получить сообщения клиента (из Telegram/Bubble)
  getClientMessages: async (orderId: number, params?: { limit?: number; offset?: number }): Promise<{
    messages: Message[];
    total: number;
    chatLeadId?: string;
    externalId?: string;
    mainId?: string;
  }> => {
    const response = await api.get(`/order-messages/${orderId}/client`, { params });
    return response.data;
  },

  // Отправить текстовое сообщение клиенту
  sendClientMessage: async (orderId: number, content: string, replyToMessageId?: number): Promise<Message> => {
    const response = await api.post(`/order-messages/${orderId}/client`, {
      content,
      reply_to_message_id: replyToMessageId,
    });
    return response.data;
  },

  // Отправить файл клиенту
  sendClientFile: async (orderId: number, file: File, caption?: string, replyToMessageId?: number): Promise<Message> => {
    const formData = new FormData();
    formData.append('file', file);
    if (caption) formData.append('caption', caption);
    if (replyToMessageId) formData.append('reply_to_message_id', replyToMessageId.toString());

    const response = await api.post(`/order-messages/${orderId}/client/file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Отправить голосовое сообщение клиенту
  sendClientVoice: async (orderId: number, voice: Blob, duration?: number, replyToMessageId?: number): Promise<Message> => {
    const formData = new FormData();
    formData.append('voice', voice, 'voice.ogg');
    if (duration) formData.append('duration', duration.toString());
    if (replyToMessageId) formData.append('reply_to_message_id', replyToMessageId.toString());

    const response = await api.post(`/order-messages/${orderId}/client/voice`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Получить внутренние сообщения
  getInternalMessages: async (orderId: number, params?: { limit?: number; offset?: number }): Promise<{
    messages: InternalMessage[];
    total: number;
  }> => {
    const response = await api.get(`/order-messages/${orderId}/internal`, { params });
    return response.data;
  },

  // Отправить внутреннее сообщение
  sendInternalMessage: async (orderId: number, content: string, replyToId?: number): Promise<InternalMessage> => {
    const response = await api.post(`/order-messages/${orderId}/internal`, {
      content,
      reply_to_id: replyToId,
    });
    return response.data;
  },

  // Отправить внутренний файл
  sendInternalFile: async (orderId: number, file: File, replyToId?: number): Promise<InternalMessage> => {
    const formData = new FormData();
    formData.append('file', file);
    if (replyToId) formData.append('reply_to_id', replyToId.toString());

    const response = await api.post(`/order-messages/${orderId}/internal/file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Отметить как прочитанные
  markAsRead: async (orderId: number, messageIds?: number[]): Promise<void> => {
    await api.post(`/order-messages/${orderId}/internal/read`, { message_ids: messageIds });
  },

  // Получить количество непрочитанных
  getUnreadCount: async (orderId: number): Promise<{ count: number }> => {
    const response = await api.get(`/order-messages/${orderId}/internal/unread`);
    return response.data;
  },
};

// Analytics API
export const analyticsAPI = {
  getOrdersAnalytics: async (params?: { startDate?: string; endDate?: string }) => {
    const response = await api.get('/analytics/orders', { params });
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

// AI Agent API (unchanged)
export const aiAPI = {
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

  getModels: async (): Promise<{ models: AIModel[] }> => {
    const response = await api.get('/ai/models');
    return response.data;
  },

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

  testSuggestion: async (data: { client_message: string; lead_id?: string; operator_id?: number }): Promise<any> => {
    const response = await api.post('/ai/test-suggestion', data);
    return response.data;
  },

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

  getInstruction: async (id: number): Promise<AIInstruction> => {
    const response = await api.get(`/ai/instructions/${id}`);
    return response.data;
  },

  createInstruction: async (instruction: Partial<AIInstruction>): Promise<AIInstruction> => {
    const response = await api.post('/ai/instructions', instruction);
    return response.data;
  },

  updateInstruction: async (id: number, instruction: Partial<AIInstruction>): Promise<AIInstruction> => {
    const response = await api.patch(`/ai/instructions/${id}`, instruction);
    return response.data;
  },

  deleteInstruction: async (id: number): Promise<void> => {
    await api.delete(`/ai/instructions/${id}`);
  },

  getInstructionsForPrompt: async (): Promise<{
    prompt_text: string;
    counts: { laws: number; priority: number; normal: number }
  }> => {
    const response = await api.get('/ai/instructions/for-prompt');
    return response.data;
  },

  getInstructionCategories: async (): Promise<{ categories: string[] }> => {
    const response = await api.get('/ai/instructions-categories');
    return response.data;
  },

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

  getPromptImprovements: async (params?: { status?: string; limit?: number }): Promise<{ improvements: any[] }> => {
    const response = await api.get('/ai/prompt-improvements', { params });
    return response.data;
  },

  updatePromptImprovement: async (id: number, data: { status: string }): Promise<any> => {
    const response = await api.patch(`/ai/prompt-improvements/${id}`, data);
    return response.data;
  },

  runDailyAnalysis: async (date?: string): Promise<any> => {
    const response = await api.post('/ai/run-daily-analysis', { date });
    return response.data;
  },

  getEditExamples: async (params?: { limit?: number; edit_type?: string }): Promise<{ examples: any[] }> => {
    const response = await api.get('/ai/edit-examples', { params });
    return response.data;
  },
};

export default api;
