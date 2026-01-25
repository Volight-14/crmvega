import React from 'react';
import { Card, Tag, Space, Typography, Avatar } from 'antd';
import {
    UserOutlined,
    CalendarOutlined,
    RightOutlined
} from '@ant-design/icons';
import { Order, ORDER_STATUSES } from '../types';
import styled from 'styled-components';

const { Text } = Typography;

const StyledCard = styled(Card)`
  margin-bottom: 12px;
  border-radius: 12px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.03);
  border: none;
  
  .ant-card-body {
    padding: 12px 16px;
  }
`;

const StatusTag = styled.div<{ color: string }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  background-color: ${props => props.color + '15'};
  color: ${props => props.color};
  border: 1px solid ${props => props.color + '30'};
`;

interface MobileOrderListItemProps {
    order: Order;
    onClick: () => void;
}

const MobileOrderListItem: React.FC<MobileOrderListItemProps> = ({ order, onClick }) => {
    const statusInfo = ORDER_STATUSES[order.status] || { label: order.status, color: '#8c8c8c' };

    // Format amount
    const formatAmount = (amount?: number, currency?: string) => {
        if (!amount) return null;
        const symbol = currency === 'RUB' ? '₽' : currency === 'USD' ? '$' : '€';
        return `${symbol} ${amount.toLocaleString('ru-RU')}`;
    };

    const amountDisplay = formatAmount(order.amount, order.currency);

    // Format date
    const dateDisplay = new Date(order.created_at).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short'
    });

    return (
        <StyledCard onClick={onClick}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                    <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 4 }}>
                        {order.title || `Заявка #${order.id}`}
                    </Text>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <UserOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
                        <Text type="secondary" style={{ fontSize: 13 }}>
                            {order.contact?.name || 'Без контакта'}
                        </Text>
                    </div>
                </div>
                {amountDisplay && (
                    <Text strong style={{ fontSize: 15, color: '#1890ff' }}>
                        {amountDisplay}
                    </Text>
                )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <StatusTag color={statusInfo.color || '#8c8c8c'}>
                    {statusInfo.label}
                </StatusTag>

                <Space size="small">
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {dateDisplay}
                    </Text>
                    <RightOutlined style={{ fontSize: 12, color: '#bfbfbf' }} />
                </Space>
            </div>
        </StyledCard>
    );
};

export default MobileOrderListItem;
