import React from 'react';
import { List } from 'antd';
import { Order } from '../types';
import MobileOrderListItem from './MobileOrderListItem';

interface MobileOrderListProps {
    orders: Order[];
    onOrderClick: (order: Order) => void;
    loading?: boolean;
}

const MobileOrderList: React.FC<MobileOrderListProps> = ({ orders, onOrderClick, loading }) => {
    return (
        <div style={{ paddingBottom: 80 }}> {/* Bottom padding for nav bar only */}
            <List
                loading={loading}
                dataSource={orders}
                renderItem={(item) => (
                    <MobileOrderListItem
                        key={item.id}
                        order={item}
                        onClick={() => onOrderClick(item)}
                    />
                )}
                locale={{ emptyText: 'Нет заявок' }}
            />
        </div>
    );
};

export default MobileOrderList;
