import axios from 'axios';
import { Manager, Lead, Message, Contact, Deal, Note, Automation, ApiResponse } from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

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
};

// Leads API
export const leadsAPI = {
  getAll: async (params?: { status?: string; limit?: number; offset?: number }): Promise<{ leads: Lead[]; total: number }> => {
    const response = await api.get('/leads', { params });
    return response.data;
  },

  getById: async (id: number): Promise<Lead> => {
    const response = await api.get(`/leads/${id}`);
    return response.data;
  },

  create: async (lead: Omit<Lead, 'id' | 'created_at' | 'updated_at'>): Promise<Lead> => {
    const response = await api.post('/leads', lead);
    return response.data;
  },

  updateStatus: async (id: number, status: Lead['status'], managerId?: number): Promise<Lead> => {
    const response = await api.patch(`/leads/${id}/status`, { status, manager_id: managerId });
    return response.data;
  },
};

// Messages API
export const messagesAPI = {
  getByLeadId: async (leadId: number, params?: { limit?: number; offset?: number }): Promise<Message[]> => {
    const response = await api.get(`/messages/lead/${leadId}`, { params });
    return response.data;
  },

  send: async (message: { lead_id: number; content: string; sender_type?: 'manager' | 'user' }): Promise<Message> => {
    const response = await api.post('/messages', message);
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

  create: async (note: Omit<Note, 'id' | 'created_at' | 'updated_at' | 'manager' | 'manager_id'> & { manager_id?: number }): Promise<Note> => {
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

  sendToContact: async (contactId: number, content: string, sender_type?: 'manager' | 'user'): Promise<Message> => {
    const response = await api.post(`/messages/contact/${contactId}`, { content, sender_type });
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

export default api;
