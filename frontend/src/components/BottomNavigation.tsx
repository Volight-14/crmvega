import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Badge } from 'antd';
import {
    DashboardOutlined,
    TeamOutlined,
    MessageOutlined,
    MenuOutlined,
    RobotOutlined
} from '@ant-design/icons';
import styled from 'styled-components';

const BottomNavContainer = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px; /* Reduced specific height for mobile feel */
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 1000;
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 -1px 10px rgba(0,0,0,0.03);
`;

const NavItem = styled.div<{ $active?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 100%;
  color: ${props => props.$active ? '#1890ff' : '#8c8c8c'};
  transition: all 0.2s ease;
  cursor: pointer;
  
  &:active {
    transform: scale(0.95);
    background-color: rgba(0,0,0,0.02);
  }

  .anticon {
    font-size: 22px;
    margin-bottom: 2px;
  }

  span {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.2px;
  }
`;

interface BottomNavigationProps {
    onMenuClick: () => void;
    unreadCount?: number;
}

const BottomNavigation: React.FC<BottomNavigationProps> = ({ onMenuClick, unreadCount = 0 }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const currentPath = location.pathname;

    const isActive = (path: string) => currentPath.startsWith(path);

    return (
        <BottomNavContainer>
            <NavItem
                $active={isActive('/orders')}
                onClick={() => navigate('/orders')}
            >
                <DashboardOutlined />
                <span>Заявки</span>
            </NavItem>

            <NavItem
                $active={isActive('/contacts')}
                onClick={() => navigate('/contacts')}
            >
                <TeamOutlined />
                <span>Контакты</span>
            </NavItem>

            <NavItem
                $active={isActive('/inbox')}
                onClick={() => navigate('/inbox')}
            >
                <Badge count={unreadCount} size="small" offset={[5, -5]}>
                    <MessageOutlined />
                </Badge>
                <span>Диалоги</span>
            </NavItem>

            <NavItem
                $active={isActive('/ai-agent')}
                onClick={() => navigate('/ai-agent')}
            >
                <RobotOutlined />
                <span>AI</span>
            </NavItem>

            <NavItem onClick={onMenuClick}>
                <MenuOutlined />
                <span>Меню</span>
            </NavItem>
        </BottomNavContainer>
    );
};

export default BottomNavigation;
