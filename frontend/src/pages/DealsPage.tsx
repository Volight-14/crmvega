import React, { useState, useEffect, useRef } from 'react';
import {
  Typography,
  Card,
  Space,
  Button,
  Input,
  Select,
  Row,
  Col,
  Tag,
  Avatar,
  Badge,
  Modal,
  Form,
  message,
  Empty,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  UserOutlined,
  DollarOutlined,
  CalendarOutlined,
  EditOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Deal, DEAL_STATUSES, Contact } from '../types';
import { dealsAPI, contactsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import io from 'socket.io-client';

const { Title, Text } = Typography;
const { Option } = Select;

type Socket = ReturnType<typeof io>;

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

  const statusInfo = DEAL_STATUSES[deal.status];

  return (
    <Card
      ref={setNodeRef}
      style={{
        ...style,
        marginBottom: 8,
        cursor: 'grab',
      }}
      {...attributes}
      {...listeners}
      size="small"
      hoverable
      onClick={onClick}
    >
      <div>
        <div style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 14 }}>
          {deal.title}
        </div>
        {deal.contact && (
          <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>
            <UserOutlined /> {deal.contact.name || `Контакт #${deal.contact_id}`}
          </div>
        )}
        {deal.amount > 0 && (
          <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 'bold', color: '#1890ff' }}>
            <DollarOutlined /> {deal.amount.toLocaleString('ru-RU')} {deal.currency || 'RUB'}
          </div>
        )}
        {deal.due_date && (
          <div style={{ marginBottom: 8, fontSize: 12, color: '#999' }}>
            <CalendarOutlined /> {new Date(deal.due_date).toLocaleDateString('ru-RU')}
          </div>
        )}
        {deal.tags && deal.tags.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {deal.tags.slice(0, 2).map((tag) => (
              <Tag key={tag.id} color={tag.color} style={{ fontSize: 10, marginTop: 4 }}>
                {tag.name}
              </Tag>
            ))}
            {deal.tags.length > 2 && (
              <Tag style={{ fontSize: 10, marginTop: 4 }}>+{deal.tags.length - 2}</Tag>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

interface KanbanColumnProps {
  status: keyof typeof DEAL_STATUSES;
  deals: Deal[];
  onDealClick: (deal: Deal) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ status, deals, onDealClick }) => {
  const statusInfo = DEAL_STATUSES[status];
  const dealIds = deals.map(d => d.id);

  return (
    <Card
      title={
        <Space>
          <span>{statusInfo.icon}</span>
          <span>{statusInfo.label}</span>
          <Badge count={deals.length} showZero />
        </Space>
      }
      style={{
        height: 'calc(100vh - 250px)',
        display: 'flex',
        flexDirection: 'column',
      }}
      bodyStyle={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px',
      }}
    >
      <SortableContext items={dealIds} strategy={verticalListSortingStrategy}>
        {deals.length === 0 ? (
          <Empty description="Нет сделок" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} onClick={() => onDealClick(deal)} />
          ))
        )}
      </SortableContext>
    </Card>
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
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const socketRef = useRef<Socket | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
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
  }, [statusFilter]);

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
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socketRef.current.on('connect', () => {
      console.log('✅ Connected to socket for deals');
    });

    socketRef.current.on('connect_error', () => {
      // Тихий режим для ошибок подключения - не показываем в консоли
      // Сокет автоматически попытается переподключиться благодаря reconnection
    });

    socketRef.current.on('new_deal', (newDeal: Deal) => {
      setDeals(prev => {
        if (prev.some(d => d.id === newDeal.id)) return prev;
        return [...prev, newDeal];
      });
    });

    socketRef.current.on('deal_updated', (updatedDeal: Deal) => {
      setDeals(prev => prev.map(d => d.id === updatedDeal.id ? updatedDeal : d));
    });
  };

  const fetchDeals = async () => {
    setLoading(true);
    try {
      const { deals: fetchedDeals } = await dealsAPI.getAll({
        status: statusFilter || undefined,
        limit: 500,
      });
      
      // Фильтруем по поисковому запросу
      let filteredDeals = fetchedDeals;
      if (searchText) {
        filteredDeals = fetchedDeals.filter(deal =>
          deal.title.toLowerCase().includes(searchText.toLowerCase()) ||
          deal.contact?.name?.toLowerCase().includes(searchText.toLowerCase()) ||
          deal.description?.toLowerCase().includes(searchText.toLowerCase())
        );
      }

      setDeals(filteredDeals);
    } catch (error) {
      console.error('Error fetching deals:', error);
      message.error('Ошибка загрузки сделок');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDeals();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeDeal = deals.find(d => d.id === active.id);
    if (!activeDeal) return;

    const newStatus = over.id as Deal['status'];
    
    if (activeDeal.status === newStatus) return;

    // Оптимистичное обновление
    setDeals(prev => prev.map(d => 
      d.id === active.id ? { ...d, status: newStatus } : d
    ));

    try {
      await dealsAPI.update(active.id, { status: newStatus });
      message.success('Статус сделки обновлен');
    } catch (error) {
      // Откатываем изменение при ошибке
      setDeals(prev => prev.map(d => 
        d.id === active.id ? activeDeal : d
      ));
      message.error('Ошибка обновления статуса');
    }
  };

  const handleCreateDeal = async (values: any) => {
    try {
      await dealsAPI.create(values);
      message.success('Сделка создана');
      setIsCreateModalVisible(false);
      form.resetFields();
      fetchDeals();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка создания сделки');
    }
  };

  // Группируем сделки по статусам
  const dealsByStatus = React.useMemo(() => {
    const grouped: Record<string, Deal[]> = {};
    Object.keys(DEAL_STATUSES).forEach(status => {
      grouped[status] = [];
    });
    deals.forEach(deal => {
      if (grouped[deal.status]) {
        grouped[deal.status].push(deal);
      }
    });
    return grouped;
  }, [deals]);

  const draggedDeal = deals.find(d => d.id === activeId);

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2}>Сделки</Title>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsCreateModalVisible(true)}
          >
            Новая сделка
          </Button>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Space size="middle" style={{ width: '100%' }}>
          <Input
            placeholder="Поиск по названию, клиенту..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
            allowClear
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="Фильтр по статусу"
            style={{ width: 200 }}
            allowClear
          >
            {Object.entries(DEAL_STATUSES).map(([key, info]) => (
              <Option key={key} value={key}>
                {info.icon} {info.label}
              </Option>
            ))}
          </Select>
        </Space>
      </Card>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <Row gutter={16} style={{ height: 'calc(100vh - 250px)' }}>
          {Object.entries(DEAL_STATUSES).map(([status, info]) => (
            <Col span={4} key={status} style={{ height: '100%' }}>
              <KanbanColumn
                status={status as Deal['status']}
                deals={dealsByStatus[status] || []}
                onDealClick={(deal) => navigate(`/deal/${deal.id}`)}
              />
            </Col>
          ))}
        </Row>
        <DragOverlay>
          {draggedDeal ? (
            <Card
              size="small"
              style={{
                width: 200,
                opacity: 0.8,
              }}
            >
              <div style={{ fontWeight: 'bold' }}>{draggedDeal.title}</div>
              {draggedDeal.contact && (
                <div style={{ fontSize: 12, color: '#666' }}>
                  {draggedDeal.contact.name}
                </div>
              )}
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Modal
        title="Новая сделка"
        open={isCreateModalVisible}
        onCancel={() => {
          setIsCreateModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateDeal}>
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
              defaultValue={searchParams.get('contact_id') ? parseInt(searchParams.get('contact_id')!) : undefined}
            >
              {contacts.map((contact) => (
                <Option key={contact.id} value={contact.id}>
                  {contact.name} {contact.phone ? `(${contact.phone})` : ''}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="amount" label="Сумма">
                <Input type="number" placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="currency" label="Валюта">
                <Select defaultValue="RUB">
                  <Option value="RUB">₽ RUB</Option>
                  <Option value="USD">$ USD</Option>
                  <Option value="EUR">€ EUR</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="status" label="Статус">
            <Select defaultValue="new">
              {Object.entries(DEAL_STATUSES).map(([key, info]) => (
                <Option key={key} value={key}>
                  {info.icon} {info.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="due_date" label="Крайний срок">
            <Input type="date" />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={4} placeholder="Описание сделки" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default DealsPage;
