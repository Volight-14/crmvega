import axios from 'axios';
import { Manager, Lead, Message, ApiResponse } from '../types';

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

export default api;
