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
        <Drawer
          placement="left"
          onClose={() => setMobileDrawerVisible(false)}
          open={mobileDrawerVisible}
          styles={{ body: { padding: 0 } }}
          width={250}
        >
          {MenuContent}
        </Drawer>
      )}

      <Layout style={{
        marginLeft: !isMobile ? (collapsed ? 80 : 200) : 0,
        transition: 'margin-left 0.2s',
        minHeight: '100vh'
      }}>
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
            {React.createElement(isMobile ? MenuUnfoldOutlined : (collapsed ? MenuUnfoldOutlined : MenuFoldOutlined), {
              className: 'trigger',
              onClick: () => isMobile ? setMobileDrawerVisible(true) : setCollapsed(!collapsed),
              style: { fontSize: 18, cursor: 'pointer' },
            })}
          </Space>
          <Space size={isMobile ? "middle" : "large"}>
            <Badge count={unreadTotal}>
              <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} onClick={() => navigate('/inbox?filter=unread')} />
            </Badge>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar icon={<UserOutlined />} />
                {!isMobile && <span>{manager?.name || 'Пользователь'}</span>}
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{
          margin: isMobile ? '12px' : '24px 16px',
          padding: isMobile ? 12 : 24,
          background: '#fff',
          minHeight: 280,
          borderRadius: 8
        }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
