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
  Badge,
  Modal,
  Form,
  message,
  Empty,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  UserOutlined,
  DollarOutlined,
  CalendarOutlined,
  EuroOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Deal, DEAL_STATUSES, Contact, DealStatus } from '../types';
import { dealsAPI, contactsAPI } from '../services/api';
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
  accepted_lusi: '#13c2c2',
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

interface DealCardProps {
  deal: Deal;
  onClick: () => void;
}

const DealCard: React.FC<DealCardProps> = ({ deal, onClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

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
        {/* Имя контакта и дата */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start',
          marginBottom: 6,
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8,
            flex: 1,
            minWidth: 0,
          }}>
            <Avatar 
              size={28} 
              style={{ 
                backgroundColor: '#667eea',
                flexShrink: 0,
              }}
            >
              {(deal.contact?.name || 'К')[0].toUpperCase()}
            </Avatar>
            <div style={{ minWidth: 0 }}>
              <div style={{ 
                fontWeight: 600, 
                fontSize: 13,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {deal.contact?.name || 'Без контакта'}
              </div>
            </div>
          </div>
          <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>
            {new Date(deal.created_at).toLocaleDateString('ru-RU', { 
              day: 'numeric', 
              month: 'short' 
            }).replace('.', '')}
          </Text>
        </div>

        {/* Название сделки */}
        <div style={{ 
          fontSize: 12, 
          color: '#1890ff',
          marginBottom: 6,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {deal.title}
        </div>

        {/* Сумма */}
        {deal.amount > 0 && (
          <div style={{ 
            fontSize: 13, 
            fontWeight: 600,
            color: '#262626',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            {deal.currency === 'EUR' ? '€' : deal.currency === 'USD' ? '$' : '₽'}
            {deal.amount.toLocaleString('ru-RU')}
          </div>
        )}

        {/* Теги */}
        {deal.tags && deal.tags.length > 0 && (
          <div style={{ marginTop: 6 }}>
            {deal.tags.slice(0, 2).map((tag) => (
              <Tag 
                key={tag.id} 
                color={tag.color} 
                style={{ 
                  fontSize: 10, 
                  padding: '0 6px',
                  marginRight: 4,
                  borderRadius: 4,
                }}
              >
                {tag.name}
              </Tag>
            ))}
          </div>
        )}

        {/* Индикатор задач */}
        <div style={{ 
          marginTop: 6, 
          fontSize: 11, 
          color: '#f5222d',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          <span style={{ color: '#f5222d' }}>●</span>
          Нет задач
        </div>
      </Card>
    </div>
  );
};

interface KanbanColumnProps {
  status: DealStatus;
  deals: Deal[];
  onDealClick: (deal: Deal) => void;
  onAddDeal: () => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ status, deals, onDealClick, onAddDeal }) => {
  const statusInfo = DEAL_STATUSES[status];
  const dealIds = deals.map(d => d.id);
  const columnColor = COLUMN_COLORS[status] || '#8c8c8c';
  
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  // Считаем общую сумму по колонке (конвертируем в евро для примера)
  const totalAmount = useMemo(() => {
    return deals.reduce((sum, deal) => {
      let amount = deal.amount || 0;
      // Простая конвертация для отображения
      if (deal.currency === 'RUB') amount = amount / 100; // примерный курс
      if (deal.currency === 'USD') amount = amount * 0.92;
      return sum + amount;
    }, 0);
  }, [deals]);

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
          <span>{deals.length} сделок</span>
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
        <SortableContext items={dealIds} strategy={verticalListSortingStrategy}>
          {deals.length === 0 ? (
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
                onClick={onAddDeal}
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
              {deals.map((deal) => (
                <DealCard key={deal.id} deal={deal} onClick={() => onDealClick(deal)} />
              ))}
              {/* Кнопка добавления внизу */}
              <Button 
                type="text" 
                icon={<PlusOutlined />}
                onClick={onAddDeal}
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

const DealsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { manager } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [createStatus, setCreateStatus] = useState<DealStatus>('unsorted');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [form] = Form.useForm();
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
    fetchDeals();
    fetchContacts();
    setupSocket();

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const fetchContacts = async () => {
    try {
      const { contacts: fetchedContacts } = await contactsAPI.getAll({ limit: 1000 });
      setContacts(fetchedContacts);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    }
  };

  const setupSocket = () => {
    const socketUrl = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';
    socketRef.current = io(socketUrl, {
      transports: ['websocket', 'polling'],
    });

    socketRef.current.on('new_deal', (newDeal: Deal) => {
      setDeals(prev => {
        if (prev.some(d => d.id === newDeal.id)) return prev;
        return [...prev, newDeal];
      });
    });

    socketRef.current.on('deal_updated', (updatedDeal: Deal) => {
      setDeals(prev => prev.map(d => d.id === updatedDeal.id ? { ...updatedDeal, contact: d.contact } : d));
    });
  };

  const fetchDeals = async () => {
    setLoading(true);
    try {
      const { deals: fetchedDeals } = await dealsAPI.getAll({ limit: 500 });
      setDeals(fetchedDeals);
    } catch (error) {
      console.error('Error fetching deals:', error);
      message.error('Ошибка загрузки сделок');
    } finally {
      setLoading(false);
    }
  };

  // Фильтрация по поиску
  const filteredDeals = useMemo(() => {
    if (!searchText) return deals;
    const search = searchText.toLowerCase();
    return deals.filter(deal =>
      deal.title.toLowerCase().includes(search) ||
      deal.contact?.name?.toLowerCase().includes(search) ||
      deal.description?.toLowerCase().includes(search)
    );
  }, [deals, searchText]);

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeDeal = deals.find(d => d.id === active.id);
    if (!activeDeal) return;

    const validStatuses = Object.keys(DEAL_STATUSES);
    if (!validStatuses.includes(over.id)) return;

    const newStatus = over.id as DealStatus;
    if (activeDeal.status === newStatus) return;

    // Оптимистичное обновление
    setDeals(prev => prev.map(d => 
      d.id === active.id ? { ...d, status: newStatus } : d
    ));

    try {
      await dealsAPI.update(active.id, { status: newStatus });
      message.success('Статус обновлен');
    } catch (error) {
      setDeals(prev => prev.map(d => 
        d.id === active.id ? activeDeal : d
      ));
      message.error('Ошибка обновления');
    }
  };

  const handleCreateDeal = async (values: any) => {
    try {
      await dealsAPI.create({ ...values, status: createStatus });
      message.success('Сделка создана');
      setIsCreateModalVisible(false);
      form.resetFields();
      fetchDeals();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка создания сделки');
    }
  };

  const openCreateModal = (status: DealStatus) => {
    setCreateStatus(status);
    form.setFieldsValue({ status });
    setIsCreateModalVisible(true);
  };

  // Группируем сделки по статусам
  const dealsByStatus = useMemo(() => {
    const grouped: Record<string, Deal[]> = {};
    Object.keys(DEAL_STATUSES).forEach(status => {
      grouped[status] = [];
    });
    filteredDeals.forEach(deal => {
      const status = deal.status || 'unsorted';
      if (grouped[status]) {
        grouped[status].push(deal);
      } else {
        grouped['unsorted'].push(deal);
      }
    });
    return grouped;
  }, [filteredDeals]);

  // Считаем общую сумму всех сделок
  const totalDealsAmount = useMemo(() => {
    return filteredDeals.reduce((sum, deal) => {
      let amount = deal.amount || 0;
      if (deal.currency === 'RUB') amount = amount / 100;
      if (deal.currency === 'USD') amount = amount * 0.92;
      return sum + amount;
    }, 0);
  }, [filteredDeals]);

  const draggedDeal = deals.find(d => d.id === activeId);

  // Сортируем статусы по order
  const sortedStatuses = useMemo(() => {
    return Object.entries(DEAL_STATUSES)
      .sort((a, b) => (a[1].order || 0) - (b[1].order || 0))
      .map(([key]) => key as DealStatus);
  }, []);

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      background: '#f0f2f5',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: '#fff',
        padding: '16px 24px',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Title level={4} style={{ margin: 0 }}>СДЕЛКИ</Title>
          <Input
            placeholder="Поиск и фильтр"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 250, borderRadius: 8 }}
            allowClear
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Text style={{ color: '#8c8c8c' }}>
            {filteredDeals.length} сделок: €{Math.round(totalDealsAmount).toLocaleString('ru-RU')}
          </Text>
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
            + НОВАЯ СДЕЛКА
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
                deals={dealsByStatus[status] || []}
                onDealClick={(deal) => navigate(`/deal/${deal.id}`)}
                onAddDeal={() => openCreateModal(status)}
              />
            ))}
          </div>
        </div>
        <DragOverlay>
          {draggedDeal ? (
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
                {draggedDeal.contact?.name || 'Без контакта'}
              </div>
              <div style={{ fontSize: 12, color: '#1890ff' }}>
                {draggedDeal.title}
              </div>
              {draggedDeal.amount > 0 && (
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                  {draggedDeal.currency === 'EUR' ? '€' : draggedDeal.currency === 'USD' ? '$' : '₽'}
                  {draggedDeal.amount.toLocaleString('ru-RU')}
                </div>
              )}
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Create Modal */}
      <Modal
        title="Новая сделка"
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
          onFinish={handleCreateDeal}
          initialValues={{ currency: 'EUR', status: createStatus }}
        >
          <Form.Item name="title" label="Название сделки" rules={[{ required: true }]}>
            <Input placeholder="Название сделки" />
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
                  {DEAL_STATUSES[status].icon} {DEAL_STATUSES[status].label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={3} placeholder="Описание сделки" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default DealsPage;
