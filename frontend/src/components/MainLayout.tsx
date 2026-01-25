import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { Layout, Menu, Avatar, Dropdown, Badge, Space, Drawer, Grid, notification } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  BarChartOutlined,
  RobotOutlined,
  SettingOutlined,
  LogoutOutlined,
  BellOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { MenuProps } from 'antd';
import BottomNavigation from './BottomNavigation';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerVisible, setMobileDrawerVisible] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { manager, logout } = useAuth();

  // Responsive breakpoints
  const screens = useBreakpoint();
  const isMobile = !screens.md; // md is 768px

  // Auto-collapse on mobile, specific handling on mount
  useEffect(() => {
    if (isMobile) {
      setCollapsed(true);
    }
  }, [isMobile]);

  const menuItems: MenuProps['items'] = [
    {
      key: '/orders',
      icon: <DashboardOutlined />,
      label: 'Заявки',
    },
    {
      key: '/contacts',
      icon: <TeamOutlined />,
      label: 'Контакты',
    },
    {
      key: '/inbox',
      icon: <MessageOutlined />,
      label: 'Диалоги',
    },
    {
      key: '/analytics',
      icon: <BarChartOutlined />,
      label: 'Аналитика',
    },
    {
      key: '/automation',
      icon: <RobotOutlined />,
      label: 'Автоматизация',
    },
    {
      key: '/ai-agent',
      icon: <RobotOutlined style={{ color: '#52c41a' }} />,
      label: 'AI Агент',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: 'Настройки',
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
    if (isMobile) {
      setMobileDrawerVisible(false);
    }
  };

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Профиль',
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Выход',
      danger: true,
      onClick: () => {
        logout();
        navigate('/login');
      },
    },
  ];

  // Logic to highlight current menu item
  const selectedKey = `/${location.pathname.split('/')[1]}`;
  const selectedKeys = [selectedKey === '/' ? '/orders' : selectedKey];

  // Notifications Logic
  const socketRef = React.useRef<any>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);

  // Sound function using Web Audio API
  const playAlertSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine'; // Beep tone
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5); // Drop to A4

      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.error('Audio play error:', e);
    }
  };

  const fetchUnreadCount = React.useCallback(async () => {
    if (!manager) return;
    try {
      const { ordersAPI } = await import('../services/api');
      const { count } = await ordersAPI.getUnreadCount();
      setUnreadTotal(count);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  }, [manager]);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  useEffect(() => {
    // Restore count? maybe not needed persistent for session
    document.title = unreadTotal > 0 ? `(${unreadTotal}) CRM` : 'CRM';
  }, [unreadTotal]);

  useEffect(() => {
    const socketUrl = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';

    socketRef.current = io(socketUrl, {
      transports: ['websocket', 'polling'],
    });

    socketRef.current.on('connect', () => {
      console.log('✅ Global socket connected for notifications');
    });

    socketRef.current.on('new_message_global', (msg: any) => {
      console.log('📨 Global message received:', msg);

      // Logic for alerts
      if (!manager) return;

      // Optimistically play sound if it might match (we'll refresh count anyway)
      playAlertSound();

      // Refresh count from DB to be accurate
      fetchUnreadCount();

      notification.open({
        message: 'Новое сообщение',
        description: `От: ${msg.author_type || 'Клиента'}.`,
        duration: 3,
      });
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [manager, fetchUnreadCount]);

  const MenuContent = (
    <>
      <div style={{
        height: 64,
        margin: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: isMobile ? '#1890ff' : 'white', // Dark theme for sidebar, light/blue for drawer usually looks better or keep dark
        fontSize: (collapsed && !isMobile) ? 18 : 20,
        fontWeight: 'bold'
      }}>
        {(collapsed && !isMobile) ? 'CRM' : 'MINI CRM'}
      </div>
      <Menu
        theme={isMobile ? "light" : "dark"}
        mode="inline"
        selectedKeys={selectedKeys}
        items={menuItems}
        onClick={handleMenuClick}
        style={{ borderRight: 0 }}
      />
    </>
  );


  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile ? (
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          style={{
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 100
          }}
          theme="dark"
        >
          {MenuContent}
        </Sider>
      ) : (
        <>
          <Drawer
            placement="bottom"
            onClose={() => setMobileDrawerVisible(false)}
            open={mobileDrawerVisible}
            height="auto"
            styles={{ body: { padding: 0 } }}
            title="Меню"
          >
            <Menu
              mode="inline"
              selectedKeys={selectedKeys}
              items={[
                ...menuItems,
                { type: 'divider' },
                ...userMenuItems
              ]}
              onClick={handleMenuClick}
              style={{ borderRight: 0 }}
            />
          </Drawer>
          <BottomNavigation
            onMenuClick={() => setMobileDrawerVisible(true)}
            unreadCount={unreadTotal}
          />
        </>
      )}

      <Layout style={{
        marginLeft: !isMobile ? (collapsed ? 80 : 200) : 0,
        transition: 'margin-left 0.2s',
        minHeight: '100vh',
        marginBottom: isMobile ? 60 : 0 // Safe area for bottom nav
      }}>
        {!isMobile && (
          <Header style={{
            padding: '0 16px',
            background: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            position: 'sticky',
            top: 0,
            zIndex: 99,
            width: '100%'
          }}>
            <Space>
              {React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
                className: 'trigger',
                onClick: () => setCollapsed(!collapsed),
                style: { fontSize: 18, cursor: 'pointer' },
              })}
            </Space>
            <Space size="large">
              <Badge count={unreadTotal}>
                <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} onClick={() => navigate('/inbox?filter=unread')} />
              </Badge>
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
                <Space style={{ cursor: 'pointer' }}>
                  <Avatar icon={<UserOutlined />} />
                  <span>{manager?.name || 'Пользователь'}</span>
                </Space>
              </Dropdown>
            </Space>
          </Header>
        )}

        {/* Mobile Header - Compact */}
        {isMobile && (
          <div style={{
            padding: '12px 16px',
            background: '#fff',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            position: 'sticky',
            top: 0,
            zIndex: 900
          }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>CRM</div>
            <Space size="middle">
              {unreadTotal > 0 && (
                <Badge count={unreadTotal} size="small">
                  <BellOutlined onClick={() => navigate('/inbox?filter=unread')} />
                </Badge>
              )}
              <Avatar size="small" icon={<UserOutlined />} />
            </Space>
          </div>
        )}

        <Content style={{
          margin: isMobile ? '0' : '24px 16px',
          padding: isMobile ? 0 : 24,
          background: isMobile ? '#f5f5f5' : '#fff', // Mobile background full width of gray
          minHeight: 280,
          borderRadius: isMobile ? 0 : 8
        }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
