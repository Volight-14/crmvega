import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import MainLayout from './components/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import LeadDetail from './pages/LeadDetail';
import DealsPage from './pages/DealsPage';
import ContactsPage from './pages/ContactsPage';
import ContactDetailPage from './pages/ContactDetailPage';
import DealDetailPage from './pages/DealDetailPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AutomationPage from './pages/AutomationPage';
import SettingsPage from './pages/SettingsPage';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { manager, isLoading } = useAuth();

  if (isLoading) {
    return <div>Загрузка...</div>;
  }

  return manager ? <MainLayout>{children}</MainLayout> : <Navigate to="/login" />;
};

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/lead/:id"
        element={
          <PrivateRoute>
            <LeadDetail />
          </PrivateRoute>
        }
      />
      <Route
        path="/deals"
        element={
          <PrivateRoute>
            <DealsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/contacts"
        element={
          <PrivateRoute>
            <ContactsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/contact/:id"
        element={
          <PrivateRoute>
            <ContactDetailPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/deal/:id"
        element={
          <PrivateRoute>
            <DealDetailPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <PrivateRoute>
            <AnalyticsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/automation"
        element={
          <PrivateRoute>
            <AutomationPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <PrivateRoute>
            <SettingsPage />
          </PrivateRoute>
        }
      />
      <Route path="/" element={<Navigate to="/deals" />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <ConfigProvider locale={ruRU}>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </ConfigProvider>
  );
};

export default App;