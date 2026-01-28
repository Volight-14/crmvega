import React, { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Order, ORDER_STATUSES, Contact, OrderStatus } from '../types';
import { EditOutlined, UserOutlined } from '@ant-design/icons';
import { Select, Space } from 'antd';
import styles from './KanbanOrderCard.module.css';

const { Option } = Select;

interface KanbanOrderCardProps {
    order: Order;
    onClick: () => void;
    onStatusChange?: (newStatus: OrderStatus) => void;
    onEditContact?: (contact: Contact) => void;
}

// Helper functions moved outside component
const formatDate = (dateString: string) => {
    // Quick format without Moment.js overhead
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleString('ru-RU', { month: 'short' }).replace('.', '');
    const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return `${day} ${month}, ${time}`;
};

const clean = (val: any) => {
    if (!val || val === 'null' || val === 'undefined') return '';
    return String(val).trim();
};

// Sort statuses once
const SORTED_STATUS_OPTIONS = Object.entries(ORDER_STATUSES)
    .sort(([, a], [, b]) => (a.order || 0) - (b.order || 0))
    .map(([key, value]) => ({
        value: key as OrderStatus,
        label: value.label,
        color: value.color,
    }));

// Memoized component for performance
const KanbanOrderCard: React.FC<KanbanOrderCardProps> = memo(({ order, onClick, onStatusChange, onEditContact }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: order.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 999 : 'auto',
    };

    const mainInfoString = [
        clean(order.DeliveryTime),
        clean(order.NextDay),
        clean(order.CityEsp02),
        clean(order.SumInput),
        clean(order.CurrPair1),
        (clean(order.SumOutput) || clean(order.CurrPair2)) ? 'на' : '',
        clean(order.SumOutput),
        clean(order.CurrPair2)
    ].filter(Boolean).join(' ');

    const handleStatusClick = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.titleRow}>
                    <div className={styles.title} title={order.contact?.name || ''}>
                        {order.contact?.name || order.OrderName || 'Без имени'}
                    </div>
                    {order.contact && (
                        <EditOutlined
                            className={styles.editIcon}
                            onClick={(e) => {
                                e.stopPropagation();
                                onEditContact?.(order.contact as Contact);
                            }}
                        />
                    )}
                    {order.unread_count && order.unread_count > 0 ? (
                        <div style={{
                            backgroundColor: '#ff4d4f',
                            color: '#fff',
                            borderRadius: '10px',
                            minWidth: 18,
                            height: 18,
                            padding: '0 5px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            marginLeft: 4
                        }}>
                            {order.unread_count}
                        </div>
                    ) : null}
                </div>
                <div className={styles.date}>{formatDate(order.created_at)}</div>
            </div>

            {/* City Subtitle */ }
    {
        clean(order.CityEsp02) && (
            <div className={styles.city}>{clean(order.CityEsp02)}</div>
        )
    }

    {/* Main Info */ }
    <div className={styles.mainInfo}>
        {mainInfoString}
    </div>

    {/* Tags */ }
    {
        order.tags && order.tags.length > 0 && (
            <div className={styles.tags}>
                {order.tags.map(tag => (
                    <div
                        key={tag.id}
                        className={styles.tag}
                        style={{
                            backgroundColor: (tag.color || '#d9d9d9') + '20', // 12% opacity
                            color: tag.color || '#595959',
                            border: `1px solid ${(tag.color || '#d9d9d9')}`
                        }}
                    >
                        {tag.name}
                    </div>
                ))}
            </div>
        )
    }

    {/* Footer */ }
    <div className={styles.footer}>
        {/* Last Message */}
        <div className={styles.lastMessage}>
            <div className={styles.avatar}>
                <UserOutlined style={{ fontSize: 10 }} />
            </div>
            <div className={styles.messageText}>
                {order.last_message?.content || ''}
            </div>
        </div>

        {/* Status Dropdown - kept lightweight using Ant Design Select but styled minimally */}
        <div onClick={handleStatusClick} onMouseDown={handleStatusClick}>
            <Select
                size="small"
                value={order.status}
                onChange={(val) => onStatusChange?.(val)}
                dropdownMatchSelectWidth={false}
                bordered={false}
                showArrow={false}
                style={{ width: 'auto', minWidth: 20 }}
                labelRender={(props) => {
                    const conf = ORDER_STATUSES[props.value as OrderStatus];
                    const bg = conf?.color === 'default' ? '#f0f0f0' : (conf?.color + '15');
                    const fg = conf?.color || '#595959';
                    const border = conf?.color || '#d9d9d9';

                    return (
                        <div
                            className={styles.statusTrigger}
                            style={{
                                backgroundColor: bg,
                                color: fg,
                                border: `1px solid ${border}`
                            }}
                        >
                            {conf?.label || props.label}
                        </div>
                    );
                }}
            >
                {SORTED_STATUS_OPTIONS.map(opt => (
                    <Option key={opt.value} value={opt.value}>
                        <Space>
                            <span style={{ color: opt.color }}>●</span>
                            {opt.label}
                        </Space>
                    </Option>
                ))}
            </Select>
        </div>
    </div>
        </div >
    );
});

export default KanbanOrderCard;
