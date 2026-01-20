import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Typography,
  Card,
  Space,
  Button,
  Input,
  Select,
  Tag,
  Avatar,
  // Badge,
  Modal,
  Form,
  message,
  // Empty,
  // Tooltip,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  UserOutlined,
  // DollarOutlined,
  // CalendarOutlined,
  // EuroOutlined,
  EditOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Order, ORDER_STATUSES, Contact, OrderStatus, Tag as TagData } from '../types';
import { ordersAPI, contactsAPI, tagsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import io from 'socket.io-client';

const { Title, Text } = Typography;
const { Option } = Select;

type Socket = ReturnType<typeof io>;

// Цвета для верхней полоски колонки
const COLUMN_COLORS: Record<string, string> = {
  unsorted: '#8c8c8c',
  accepted_anna: '#13c2c2',
  accepted_kostya: '#13c2c2',
  accepted_stas: '#13c2c2',
  accepted_lucy: '#13c2c2',
  in_progress: '#1890ff',
  survey: '#722ed1',
  transferred_nikita: '#fa8c16',
  transferred_val: '#fa8c16',
  transferred_ben: '#fa8c16',
  transferred_fin: '#fa8c16',
  partially_completed: '#a0d911',
  postponed: '#fadb14',
  client_rejected: '#f5222d',
  scammer: '#eb2f96',
  moderation: '#2f54eb',
  completed: '#52c41a',
};

interface OrderCardProps {
  order: Order;
  onClick: () => void;
  onStatusChange?: (newStatus: OrderStatus) => void;
  onEditContact?: (contact: Contact) => void;
}

const OrderCard: React.FC<OrderCardProps> = ({ order, onClick, onStatusChange, onEditContact }) => {
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
    opacity: isDragging ? 0.5 : 1,
  };

  const sortedStatusOptions = Object.entries(ORDER_STATUSES)
    .sort(([, a], [, b]) => (a.order || 0) - (b.order || 0))
    .map(([key, value]) => ({
      value: key as OrderStatus,
      label: value.label,
      icon: value.icon,
      color: value.color,
    }));

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Europe/Madrid'
    }).replace('.', '') + ', ' + date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Madrid'
    });
  };

  // Helper to clean values (remove 'null' strings)
  const clean = (val: string | number | undefined | null) => {
    if (!val) return '';
    const str = String(val).trim();
    if (str.toLowerCase() === 'null') return '';
    return str;
  };

  // Construct main info string
  const mainInfoParts = [
    clean(order.DeliveryTime),
    clean(order.NextDay),
    clean(order.CityEsp02),
    clean(order.SumInput),
    clean(order.CurrPair1),
    (clean(order.SumOutput) || clean(order.CurrPair2)) ? 'на' : '',
    clean(order.SumOutput),
    clean(order.CurrPair2)
  ];

  // Join parts and handle empty strings nicely
  const mainInfoString = mainInfoParts.filter(part => part && part !== '').join(' ');

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onClick()}
    >
      <Card
        size="small"
        style={{
          marginBottom: 8,
          cursor: 'pointer',
          borderRadius: 8,
          border: '1px solid #f0f0f0',
          boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.05)',
        }}
        bodyStyle={{ padding: '10px 12px' }}
        hoverable
      >
        {/* Header: Name + Date */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 2,
        }}>
          <div style={{
            fontWeight: 600,
            fontSize: 14,
            color: '#262626',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '70%',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            {order.contact?.name || order.OrderName || order.title || 'Без имени'}
            {order.contact && 'id' in order.contact && (
              <EditOutlined
                style={{ fontSize: 12, color: '#bfbfbf', cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditContact?.(order.contact as Contact);
                }}
              />
            )}
          </div>
          <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>
            {formatDate(order.created_at)}
          </Text>
        </div>

        {/* Subtitle: City */}
        {clean(order.CityEsp02) && (
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>
            {clean(order.CityEsp02)}
          </div>
        )}

        {/* Main Info String */}
        <div style={{
          fontSize: 14,
          color: '#1890ff',
          marginBottom: 8,
          lineHeight: '1.4',
          wordWrap: 'break-word'
        }}>
          {mainInfoString}
        </div>

        {/* Tags */}
        {order.tags && order.tags.length > 0 && (
          <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {order.tags.map(tag => (
              <Tag
                key={tag.id}
                color={tag.color}
                style={{ margin: 0, fontSize: 10, lineHeight: '18px' }}
              >
                {tag.name}
              </Tag>
            ))}
          </div>
        )}

        {/* Footer: Last Message and Status */}
        <div style={{
          marginTop: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 8,
        }}>
          {/* Last Message */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {order.last_message && (
              <div style={{
                background: '#f0f5ff',
                borderRadius: '8px 8px 8px 0',
                padding: '6px 10px',
                display: 'inline-block',
                maxWidth: '100%'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Avatar size={16} src={order.contact?.name ? undefined : undefined} style={{ backgroundColor: '#87d068', flexShrink: 0 }} icon={<UserOutlined style={{ fontSize: 10 }} />} />
                  <Text style={{ fontSize: 12, color: '#262626' }} ellipsis>
                    {order.last_message.content}
                  </Text>
                </div>
              </div>
            )}
          </div>

          {/* Status dropdown trigger as Tag */}
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ flexShrink: 0 }}
          >
            <Select
              size="small"
              value={order.status}
              onChange={(newStatus) => onStatusChange?.(newStatus)}
              style={{ width: 'auto', minWidth: 100 }}
              dropdownMatchSelectWidth={false}
              bordered={false}
              showArrow={false}
              // Render the selected value as a visually distinct Tag-like element
              labelRender={(props) => {
                const statusConfig = ORDER_STATUSES[props.value as OrderStatus];
                return (
                  <div style={{
                    backgroundColor: statusConfig?.color === 'default' ? '#f0f0f0' : `${statusConfig?.color}15`, // Light bg
                    color: statusConfig?.color || '#595959',
                    border: `1px solid ${statusConfig?.color || '#d9d9d9'}`,
                    borderRadius: 4,
                    padding: '0 8px',
                    height: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}>
                    {statusConfig?.label || props.label}
                  </div>
                );
              }}
            >
              {sortedStatusOptions.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  <Space size={4}>
                    <span style={{ color: opt.color }}>●</span>
                    <span style={{ fontSize: 12 }}>{opt.label}</span>
                  </Space>
                </Option>
              ))}
            </Select>
          </div>
        </div>

      </Card>
    </div>
  );
};

interface KanbanColumnProps {
  status: OrderStatus;
  orders: Order[];
  onOrderClick: (order: Order) => void;
  onAddOrder: () => void;
  onStatusChange: (orderId: number, newStatus: OrderStatus) => void;
  onEditContact: (contact: Contact) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ status, orders, onOrderClick, onAddOrder, onStatusChange, onEditContact }) => {
  const statusInfo = ORDER_STATUSES[status];
  const orderIds = orders.map(d => d.id);
  const columnColor = COLUMN_COLORS[status] || '#8c8c8c';

  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  // Считаем общую сумму по колонке (конвертируем в евро для примера)
  const totalAmount = useMemo(() => {
    return orders.reduce((sum, order) => {
      let amount = order.amount || 0;
      // Простая конвертация для отображения
      if (order.currency === 'RUB') amount = amount / 100; // примерный курс
      if (order.currency === 'USD') amount = amount * 0.92;
      return sum + amount;
    }, 0);
  }, [orders]);

  return (
    <div
      style={{
        width: 280,
        minWidth: 280,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Заголовок колонки */}
      <div style={{
        background: '#fff',
        borderRadius: '8px 8px 0 0',
        borderTop: `3px solid ${columnColor}`,
        padding: '12px 16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}>
        <div style={{
          fontWeight: 600,
          fontSize: 13,
          marginBottom: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>{statusInfo?.label || status}</span>
        </div>
        <div style={{
          fontSize: 12,
          color: '#8c8c8c',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span>{orders.length} заявок</span>
          <span>•</span>
          <span>€{Math.round(totalAmount).toLocaleString('ru-RU')}</span>
        </div>
      </div>

      {/* Область с карточками */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          background: isOver ? '#f0f9ff' : '#fafafa',
          padding: '8px',
          overflowY: 'auto',
          borderRadius: '0 0 8px 8px',
          transition: 'background 0.2s',
        }}
      >
        <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
          {orders.length === 0 ? (
            <div
              style={{
                padding: '20px 0',
                textAlign: 'center',
                color: '#bfbfbf',
                fontSize: 13,
              }}
            >
              {/* Кнопка быстрого добавления */}
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={onAddOrder}
                style={{
                  width: '100%',
                  borderRadius: 8,
                  height: 40,
                }}
              >
                Быстрое добавление
              </Button>
            </div>
          ) : (
            <>
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onClick={() => onOrderClick(order)}
                  onStatusChange={(status) => onStatusChange(order.id, status)}
                  onEditContact={onEditContact}
                />
              ))}
              {/* Кнопка добавления внизу */}
              <Button
                type="text"
                icon={<PlusOutlined />}
                onClick={onAddOrder}
                style={{
                  width: '100%',
                  color: '#bfbfbf',
                  marginTop: 8,
                }}
              >
                Добавить
              </Button>
            </>
          )}
        </SortableContext>
      </div>
    </div>
  );
};

const OrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { manager } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [allTags, setAllTags] = useState<TagData[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [createStatus, setCreateStatus] = useState<OrderStatus>('unsorted');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [modal, contextHolder] = Modal.useModal();

  // Edit Contact state
  const [isEditContactModalVisible, setIsEditContactModalVisible] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editContactForm] = Form.useForm();

  const socketRef = useRef<Socket | null>(null);
  const kanbanRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const contactId = searchParams.get('contact_id');
    if (contactId && !form.getFieldValue('contact_id')) {
      form.setFieldsValue({ contact_id: parseInt(contactId) });
      setIsCreateModalVisible(true);
    }
  }, [searchParams, form]);

  useEffect(() => {
    fetchOrders();
    fetchContacts();
    fetchTags();
    setupSocket();

    return () => {
      socketRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const fetchContacts = async () => {
    try {
      const { contacts: fetchedContacts } = await contactsAPI.getAll({ limit: 1000 });
      setContacts(fetchedContacts);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    }
  };

  const fetchTags = async () => {
    try {
      const tags = await tagsAPI.getAll();
      setAllTags(tags);
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  const setupSocket = () => {
    const socketUrl = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';
    socketRef.current = io(socketUrl, {
      transports: ['websocket', 'polling'],
    });

    socketRef.current.on('new_order', (newOrder: Order) => {
      setOrders(prev => {
        if (prev.some(d => d.id === newOrder.id)) return prev;
        return [...prev, newOrder];
      });
    });

    socketRef.current.on('order_updated', (updatedOrder: Order) => {
      setOrders(prev => prev.map(d => d.id === updatedOrder.id ? { ...updatedOrder, contact: d.contact } : d));
    });
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      // Используем minimal=true для быстрой загрузки канбана
      // Загружаем только необходимые поля без тегов и полных данных контактов
      const tagId = searchParams.get('tag');
      const { orders: fetchedOrders } = await ordersAPI.getAll({
        limit: 500,
        minimal: true,
        // @ts-ignore
        tag_id: tagId ? parseInt(tagId) : undefined
      });
      setOrders(fetchedOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
      message.error('Ошибка загрузки заявок');
    } finally {
      setLoading(false);
    }
  };

  // Фильтрация по поиску
  const filteredOrders = useMemo(() => {
    if (!searchText) return orders;
    const search = searchText.toLowerCase();
    return orders.filter(order =>
      order.title.toLowerCase().includes(search) ||
      order.contact?.name?.toLowerCase().includes(search) ||
      order.description?.toLowerCase().includes(search)
    );
  }, [orders, searchText]);

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeOrder = orders.find(d => d.id === active.id);
    if (!activeOrder) return;

    const validStatuses = Object.keys(ORDER_STATUSES);

    // Определяем целевой статус: либо это ID колонки, либо ID карточки
    let newStatus: OrderStatus | null = null;

    // Convert to string for checking against status keys
    const overIdString = String(over.id);

    if (validStatuses.includes(overIdString)) {
      // Брошено на колонку
      newStatus = overIdString as OrderStatus;
    } else {
      // Брошено на другую карточку - найдем статус этой карточки
      // dnd-kit might return string or number, try to match loosely or convert
      const targetOrder = orders.find(d => String(d.id) === String(over.id));
      if (targetOrder) {
        newStatus = targetOrder.status;
      }
    }

    if (!newStatus || activeOrder.status === newStatus) return;

    const statusToUpdate = newStatus as OrderStatus;

    // Оптимистичное обновление
    setOrders(prev => prev.map(d =>
      d.id === activeOrder.id ? { ...d, status: statusToUpdate } : d
    ));

    try {
      await ordersAPI.update(activeOrder.id, { status: statusToUpdate });
      message.success('Статус обновлен');
    } catch (error) {
      setOrders(prev => prev.map(d =>
        d.id === activeOrder.id ? activeOrder : d
      ));
      message.error('Ошибка обновления');
    }
  };

  const handleStatusChange = async (orderId: number, newStatus: OrderStatus) => {
    const order = orders.find(d => d.id === orderId);
    if (!order || order.status === newStatus) return;

    // Optimistic update
    setOrders(prev => prev.map(d =>
      d.id === orderId ? { ...d, status: newStatus } : d
    ));

    try {
      await ordersAPI.update(orderId, { status: newStatus });
      message.success('Статус обновлен');
    } catch (error) {
      // Rollback
      setOrders(prev => prev.map(d =>
        d.id === orderId ? order : d
      ));
      message.error('Ошибка обновления статуса');
    }
  };

  const handleCreateOrder = async (values: any) => {
    try {
      await ordersAPI.create({ ...values, status: createStatus });
      message.success('Заявка создана');
      setIsCreateModalVisible(false);
      form.resetFields();
      fetchOrders();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка создания заявки');
    }
  };

  const handleClearUnsorted = () => {
    // Debug log
    console.log('handleClearUnsorted called via useModal');

    modal.confirm({
      title: 'Очистить "Неразобранное"?',
      icon: <ExclamationCircleOutlined />,
      content: 'Вы уверены, что хотите удалить ВСЕ заявки из статуса "Неразобранное"? Это действие нельзя отменить.',
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      zIndex: 10000,
      onOk: async () => {
        try {
          const result = await ordersAPI.clearUnsorted();
          message.success(`Удалено заявок: ${result.count}`);
          fetchOrders();
        } catch (error: any) {
          console.error('Error clearing unsorted:', error);
          message.error(error.response?.data?.error || 'Ошибка очистки');
        }
      },
    });
  };

  const openCreateModal = (status: OrderStatus) => {
    setCreateStatus(status);
    form.setFieldsValue({ status });
    setIsCreateModalVisible(true);
  };

  // Edit Contact Logic
  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact);
    editContactForm.setFieldsValue({ name: contact.name });
    setIsEditContactModalVisible(true);
  };

  const handleUpdateContactName = async (values: any) => {
    if (!editingContact) return;
    try {
      await contactsAPI.update(editingContact.id, { name: values.name });
      message.success('Имя контакта обновлено');
      setIsEditContactModalVisible(false);

      // Update local state to reflect change across all orders for this contact
      setOrders(prev => prev.map(order =>
        order.contact_id === editingContact.id
          ? { ...order, contact: { ...order.contact!, name: values.name } }
          : order
      ));

      // Also update contacts list just in case
      setContacts(prev => prev.map(c =>
        c.id === editingContact.id ? { ...c, name: values.name } : c
      ));

    } catch (error: any) {
      console.error('Error updating contact:', error);
      message.error(error.response?.data?.error || 'Ошибка обновления имени контакта');
    }
  };

  // Группируем заявки по статусам
  const ordersByStatus = useMemo(() => {
    const grouped: Record<string, Order[]> = {};
    Object.keys(ORDER_STATUSES).forEach(status => {
      grouped[status] = [];
    });
    filteredOrders.forEach(order => {
      const status = order.status || 'unsorted';
      if (grouped[status]) {
        grouped[status].push(order);
      } else {
        grouped['unsorted'].push(order);
      }
    });
    return grouped;
  }, [filteredOrders]);

  // Считаем общую сумму всех заявок
  const totalOrdersAmount = useMemo(() => {
    return filteredOrders.reduce((sum, order) => {
      let amount = order.amount || 0;
      if (order.currency === 'RUB') amount = amount / 100;
      if (order.currency === 'USD') amount = amount * 0.92;
      return sum + amount;
    }, 0);
  }, [filteredOrders]);

  const draggedOrder = orders.find(d => d.id === activeId);

  // Сортируем статусы по order
  const sortedStatuses = useMemo(() => {
    return Object.entries(ORDER_STATUSES)
      .sort((a, b) => (a[1].order || 0) - (b[1].order || 0))
      .map(([key]) => key as OrderStatus);
  }, []);

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#f0f2f5',
      overflow: 'hidden',
    }}>
      {contextHolder}
      {/* Header */}
      {/* Header */}
      <div style={{
        background: '#fff',
        padding: '16px 24px',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', flex: '1 1 auto' }}>
          <Title level={4} style={{ margin: 0 }}>ЗАЯВКИ</Title>
          <Input
            placeholder="Поиск и фильтр"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: '100%', maxWidth: 250, borderRadius: 8 }}
            allowClear
          />
        </div>

        {searchParams.get('tag') && (
          <div style={{ display: 'flex', alignItems: 'center', margin: '0 16px' }}>
            <Tag
              closable
              onClose={() => {
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('tag');
                navigate({ search: newParams.toString() });
              }}
              color="blue"
              style={{ fontSize: 14, padding: '4px 10px' }}
            >
              Фильтр: {allTags.find(t => t.id === parseInt(searchParams.get('tag')!))?.name || 'Тег #' + searchParams.get('tag')}
            </Tag>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'flex-end', flex: '1 1 auto' }}>
          <Text style={{ color: '#8c8c8c', whiteSpace: 'nowrap' }}>
            {filteredOrders.length} заявок: €{Math.round(totalOrdersAmount).toLocaleString('ru-RU')}
          </Text>

          {manager?.role === 'admin' && (
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleClearUnsorted}
              style={{ borderRadius: 8 }}
            >
              Очистить "Неразобранное"
            </Button>
          )}

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openCreateModal('unsorted')}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              borderRadius: 8,
            }}
          >
            + НОВАЯ ЗАЯВКА
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          ref={kanbanRef}
          style={{
            flex: 1,
            overflowX: 'auto',
            overflowY: 'hidden',
            padding: '16px',
          }}
        >
          <div style={{
            display: 'flex',
            gap: 12,
            height: '100%',
            minWidth: 'max-content',
          }}>
            {sortedStatuses.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                orders={ordersByStatus[status] || []}
                onOrderClick={(order) => navigate(`/order/${order.main_id || order.id}`)}
                onAddOrder={() => openCreateModal(status)}
                onStatusChange={handleStatusChange}
                onEditContact={handleEditContact}
              />
            ))}
          </div>
        </div>
        <DragOverlay>
          {draggedOrder ? (
            <Card
              size="small"
              style={{
                width: 260,
                opacity: 0.95,
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                borderRadius: 8,
              }}
              bodyStyle={{ padding: '10px 12px' }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {draggedOrder.contact?.name || 'Без контакта'}
              </div>
              <div style={{ fontSize: 12, color: '#1890ff' }}>
                {draggedOrder.title}
              </div>
              {draggedOrder.amount > 0 && (
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                  {draggedOrder.currency === 'EUR' ? '€' : draggedOrder.currency === 'USD' ? '$' : '₽'}
                  {draggedOrder.amount.toLocaleString('ru-RU')}
                </div>
              )}
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Create Modal */}
      <Modal
        title="Новая заявка"
        open={isCreateModalVisible}
        onCancel={() => {
          setIsCreateModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={500}
        styles={{
          header: { borderRadius: '12px 12px 0 0' },
        }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateOrder}
          initialValues={{ currency: 'EUR', status: createStatus }}
        >
          <Form.Item name="title" label="Название заявки" rules={[{ required: true }]}>
            <Input placeholder="Название заявки" />
          </Form.Item>
          <Form.Item name="contact_id" label="Контакт">
            <Select
              placeholder="Выберите контакт"
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
              }
            >
              {contacts.map((contact) => (
                <Option key={contact.id} value={contact.id}>
                  {contact.name} {contact.phone ? `(${contact.phone})` : ''}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="amount" label="Сумма" style={{ flex: 1 }}>
              <Input type="number" placeholder="0" />
            </Form.Item>
            <Form.Item name="currency" label="Валюта" style={{ width: 120 }}>
              <Select>
                <Option value="EUR">€ EUR</Option>
                <Option value="USD">$ USD</Option>
                <Option value="RUB">₽ RUB</Option>
                <Option value="USDT">₮ USDT</Option>
              </Select>
            </Form.Item>
          </div>
          <Form.Item name="status" label="Этап">
            <Select>
              {sortedStatuses.map((status) => (
                <Option key={status} value={status}>
                  {ORDER_STATUSES[status].icon} {ORDER_STATUSES[status].label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={3} placeholder="Описание заявки" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Contact Modal */}
      <Modal
        title="Редактировать имя клиента"
        open={isEditContactModalVisible}
        onCancel={() => setIsEditContactModalVisible(false)}
        onOk={() => editContactForm.submit()}
        width={400}
      >
        <Form
          form={editContactForm}
          layout="vertical"
          onFinish={handleUpdateContactName}
        >
          <Form.Item
            name="name"
            label="Имя клиента"
            rules={[{ required: true, message: 'Введите имя' }]}
          >
            <Input placeholder="Имя клиента" autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default OrdersPage;
