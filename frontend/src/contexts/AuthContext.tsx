import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Manager, AuthContextType } from '../types';
import { authAPI } from '../services/api';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [manager, setManager] = useState<Manager | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedManager = localStorage.getItem('manager');

    if (token && savedManager) {
      setManager(JSON.parse(savedManager));
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const { token, manager: managerData } = await authAPI.login(email, password);
      localStorage.setItem('token', token);
      localStorage.setItem('manager', JSON.stringify(managerData));
      setManager(managerData);
    } catch (error) {
      throw error;
    }
  };

  const register = async (email: string, password: string, name: string) => {
    try {
      const { token, manager: managerData } = await authAPI.register(email, password, name);
      localStorage.setItem('token', token);
      localStorage.setItem('manager', JSON.stringify(managerData));
      setManager(managerData);
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('manager');
    setManager(null);
  };

  const value: AuthContextType = {
    manager,
    login,
    register,
    logout,
    isLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
