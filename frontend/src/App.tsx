import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, Spin } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import MainLayout from './components/MainLayout';
import Login from './pages/Login';

// Lazy load all page components for better code splitting
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const ContactsPage = lazy(() => import('./pages/ContactsPage'));
const ContactDetailPage = lazy(() => import('./pages/ContactDetailPage'));
const OrderDetailPage = lazy(() => import('./pages/OrderDetailPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const AutomationPage = lazy(() => import('./pages/AutomationPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AIAgentPage = lazy(() => import('./pages/AIAgentPage'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const InboxPage = lazy(() => import('./pages/InboxPage'));

// Loading fallback component
const PageLoader = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#f0f2f5'
  }}>
    <div style={{ textAlign: 'center' }}>
      <Spin size="large" />
      <div style={{ marginTop: 16, color: '#8c8c8c' }}>Загрузка...</div>
    </div>
  </div>
);

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { manager, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  return manager ? <MainLayout>{children}</MainLayout> : <Navigate to="/login" />;
};

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Suspense fallback={<PageLoader />}><Login /></Suspense>} />
      <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />

      <Route
        path="/inbox"
        element={
          <PrivateRoute>
            <Suspense fallback={<PageLoader />}>
              <InboxPage />
            </Suspense>
          </PrivateRoute>
        }
      />

      <Route
        path="/orders"
        element={
          <PrivateRoute>
            <Suspense fallback={<PageLoader />}>
              <OrdersPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/contacts"
        element={
          <PrivateRoute>
            <Suspense fallback={<PageLoader />}>
              <ContactsPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/contact/:id"
        element={
          <PrivateRoute>
            <Suspense fallback={<PageLoader />}>
              <ContactDetailPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/order/:id"
        element={
          <PrivateRoute>
            <Suspense fallback={<PageLoader />}>
              <OrderDetailPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <PrivateRoute>
            <Suspense fallback={<PageLoader />}>
              <AnalyticsPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/automation"
        element={
          <PrivateRoute>
            <Suspense fallback={<PageLoader />}>
              <AutomationPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <PrivateRoute>
            <Suspense fallback={<PageLoader />}>
              <SettingsPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/ai-agent"
        element={
          <PrivateRoute>
            <Suspense fallback={<PageLoader />}>
              <AIAgentPage />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route path="/" element={<Navigate to="/orders" />} />
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