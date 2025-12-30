import React, { useState, useEffect, useRef } from 'react';
import {
  Typography,
  Card,
  Space,
  Button,
  Tag,
  Avatar,
  Divider,
  List,
  Input,
  Form,
  Modal,
  Select,
  Descriptions,
  message,
  Empty,
  Row,
  Col,
  Tabs,
  Grid,
} from 'antd';
import {
  ArrowLeftOutlined,
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
  DollarOutlined,
  CalendarOutlined,
  EditOutlined,
  PlusOutlined,
  MessageOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { Order, Note, ORDER_STATUSES, NOTE_PRIORITIES } from '../types';
import { ordersAPI, notesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import io from 'socket.io-client';
import OrderChat from '../components/OrderChat'; // Updated import

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

type Socket = ReturnType<typeof io>;

const OrderDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { manager } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isNoteModalVisible, setIsNoteModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [noteForm] = Form.useForm();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [activeInfoTab, setActiveInfoTab] = useState<'info' | 'notes' | 'chat'>('info');
  const socketRef = useRef<Socket | null>(null);

  // Reset tab to info if switching to desktop while in chat tab
  useEffect(() => {
    if (!isMobile && activeInfoTab === 'chat') {
      setActiveInfoTab('info');
    }
  }, [isMobile, activeInfoTab]);

  useEffect(() => {
    if (id) {
      fetchOrder();
      fetchNotes();
      setupSocket();
    }

    return () => {
      socketRef.current?.disconnect();
    };
  }, [id]);

  const setupSocket = () => {
    if (!id || !manager) return;

    const socketUrl = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';
    socketRef.current = io(socketUrl, {
      transports: ['websocket', 'polling'],
    });

    socketRef.current.on('connect', () => {
      socketRef.current?.emit('join_order', id);
    });

    socketRef.current.on('order_updated', (updatedOrder: Order) => {
      if (updatedOrder.id === parseInt(id || '0')) {
        setOrder(updatedOrder);
      }
    });
  };

  const fetchOrder = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const orderData = await ordersAPI.getById(parseInt(id));
      setOrder(orderData);
      form.setFieldsValue(orderData);
    } catch (error) {
      console.error('Error fetching order:', error);
      message.error('Ошибка загрузки заявки');
    } finally {
      setLoading(false);
    }
  };

  const fetchNotes = async () => {
    if (!id) return;
    try {
      const notesData = await notesAPI.getByOrderId(parseInt(id));
      setNotes(notesData);
    } catch (error) {
      console.error('Error fetching notes:', error);
    }
  };

  const handleUpdateOrder = async (values: any) => {
    if (!id) return;
    try {
      await ordersAPI.update(parseInt(id), values);
      message.success('Заявка обновлена');
      setIsEditModalVisible(false);
      fetchOrder();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка обновления заявки');
    }
  };

  const handleCreateNote = async (values: any) => {
    if (!id || !manager) return;
    try {
      await notesAPI.create({
        order_id: parseInt(id),
        manager_id: manager.id,
        content: values.content,
        priority: values.priority || 'info',
      });
      message.success('Заметка создана');
      setIsNoteModalVisible(false);
      noteForm.resetFields();
      fetchNotes();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка создания заметки');
    }
  };

  const handleStatusChange = async (newStatus: any) => {
    if (!order) return;
    const oldStatus = order.status;
    const updatedOrder = { ...order, status: newStatus };
    setOrder(updatedOrder); // Optimistic update

    try {
      await ordersAPI.update(order.id, { status: newStatus });
      message.success('Статус обновлен');
    } catch (error: any) {
      setOrder({ ...order, status: oldStatus }); // Rollback
      message.error(error.response?.data?.error || 'Ошибка обновления статуса');
    }
  };

  const sortedStatusOptions = Object.entries(ORDER_STATUSES)
    .sort(([, a], [, b]) => (a.order || 0) - (b.order || 0))
    .map(([key, value]) => ({
      value: key,
      label: value.label,
      icon: value.icon,
      color: value.color,
    }));

  if (!order) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}>
        <div style={{
          background: 'white',
          padding: 40,
          borderRadius: 16,
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        }}>
          <Title level={4} style={{ margin: 0 }}>Загрузка заявки...</Title>
        </div>
      </div>
    );
  }

  const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.unsorted;

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#f0f2f5',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: isMobile ? '12px 16px' : '16px 24px',
        color: 'white',
        boxShadow: '0 2px 8px rgba(102, 126, 234, 0.4)',
      }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 12 }}>
          <Space size="middle" direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: '100%', alignItems: isMobile ? 'flex-start' : 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <Button
                ghost
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/orders')}
                style={{ border: '1px solid rgba(255,255,255,0.5)' }}
              >
                Назад
              </Button>
              {isMobile && (
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => setIsEditModalVisible(true)}
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none',
                    borderRadius: 8,
                  }}
                >
                  Редактировать
                </Button>
              )}
            </div>

            <div style={{ width: '100%' }}>
              <Title level={3} style={{ margin: 0, color: 'white', fontSize: isMobile ? 20 : 24 }}>
                {order.title}
              </Title>
              <Space style={{ marginTop: 4, flexWrap: 'wrap' }}>
                <Select
                  value={order.status}
                  onChange={handleStatusChange}
                  style={{ width: isMobile ? '100%' : 180, minWidth: 160 }}
                  className="status-select-header"
                  popupMatchSelectWidth={false}
                >
                  {sortedStatusOptions.map((opt) => (
                    <Option key={opt.value} value={opt.value}>
                      <Space>
                        <span>{opt.icon}</span>
                        <span>{opt.label}</span>
                      </Space>
                    </Option>
                  ))}
                </Select>
                {order.amount > 0 && (
                  <span style={{
                    background: 'rgba(255,255,255,0.2)',
                    padding: '4px 12px',
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}>
                    <DollarOutlined /> {order.amount.toLocaleString('ru-RU')} {order.currency || 'RUB'}
                  </span>
                )}
              </Space>
            </div>
          </Space>

          {!isMobile && (
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => setIsEditModalVisible(true)}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: 8,
              }}
            >
              Редактировать
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        flex: 1,
        padding: isMobile ? 8 : 16,
        gap: 16,
        overflow: 'hidden',
        minHeight: 0,
      }}>
        {/* Left Sidebar - Order Info */}
        <div style={{
          width: isMobile ? '100%' : 320,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: isMobile ? 'visible' : 'hidden',
          height: isMobile ? 'auto' : '100%',
        }}>
          {isMobile ? (
            <Tabs
              activeKey={activeInfoTab}
              onChange={(key) => setActiveInfoTab(key as 'info' | 'notes' | 'chat')}
              type="card"
              items={[
                {
                  key: 'info',
                  label: <span><InfoCircleOutlined /> Инфо</span>,
                  children: (
                    <Card style={{ borderRadius: '0 0 12px 12px' }} bodyStyle={{ padding: 12 }}>
                      {/* Mobile Info Content Content */}
                      {/* This effectively duplicates the rendering logic but optimized for mobile tab structure */}
                      <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
                        <Descriptions.Item label="Статус">
                          <Select
                            value={order.status}
                            onChange={handleStatusChange}
                            size="small"
                            style={{ width: '100%' }}
                            popupMatchSelectWidth={false}
                            bordered={false}
                          >
                            {sortedStatusOptions.map((opt) => (
                              <Option key={opt.value} value={opt.value}>
                                <Space>
                                  <span>{opt.icon}</span>
                                  <span>{opt.label}</span>
                                </Space>
                              </Option>
                            ))}
                          </Select>
                        </Descriptions.Item>
                        <Descriptions.Item label="Сумма">
                          <Text strong>{order.amount.toLocaleString('ru-RU') || 0} {order.currency || 'RUB'}</Text>
                        </Descriptions.Item>
                        {order.due_date && (
                          <Descriptions.Item label="Крайний срок">
                            <CalendarOutlined /> {new Date(order.due_date).toLocaleDateString('ru-RU')}
                          </Descriptions.Item>
                        )}
                        {order.source && (
                          <Descriptions.Item label="Источник">
                            {order.source}
                          </Descriptions.Item>
                        )}
                        {order.manager && (
                          <Descriptions.Item label="Менеджер">
                            {order.manager.name}
                          </Descriptions.Item>
                        )}
                        <Descriptions.Item label="Создано">
                          {new Date(order.created_at).toLocaleString('ru-RU')}
                        </Descriptions.Item>
                      </Descriptions>
                      {order.description && (
                        <>
                          <Divider style={{ margin: '12px 0' }} />
                          <div>
                            <Text strong style={{ fontSize: 13 }}>Описание:</Text>
                            <div style={{ marginTop: 8, color: '#595959' }}>
                              <Text>{order.description}</Text>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Contact Card */}
                      {order.contact && (
                        <>
                          <Divider style={{ margin: '16px 0' }} />
                          <div style={{
                            background: 'linear-gradient(135deg, #f6f8fc 0%, #eef2f7 100%)',
                            borderRadius: 12,
                            padding: 16,
                          }}>
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: 12,
                            }}>
                              <Text strong style={{ fontSize: 14 }}>Контакт</Text>
                              <Button
                                type="link"
                                size="small"
                                onClick={() => navigate(`/contact/${order.contact_id}`)}
                              >
                                Открыть
                              </Button>
                            </div>
                            <Space direction="vertical" style={{ width: '100%' }} size={8}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Avatar
                                  style={{ backgroundColor: '#667eea' }}
                                  icon={<UserOutlined />}
                                  size={32}
                                />
                                <Text strong>{order.contact.name}</Text>
                              </div>
                              {order.contact.phone && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#595959' }}>
                                  <PhoneOutlined />
                                  <Text copyable>{order.contact.phone}</Text>
                                </div>
                              )}
                              {order.contact.email && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#595959' }}>
                                  <MailOutlined />
                                  <Text copyable>{order.contact.email}</Text>
                                </div>
                              )}
                            </Space>
                          </div>
                        </>
                      )}
                    </Card>
                  ),
                },
                {
                  key: 'notes',
                  label: <span><MessageOutlined /> Заметки</span>,
                  children: (
                    <Card style={{ borderRadius: '0 0 12px 12px' }} bodyStyle={{ padding: 12 }}>
                      <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={() => setIsNoteModalVisible(true)}
                        block
                        style={{ marginBottom: 16, borderRadius: 8 }}
                      >
                        Добавить заметку
                      </Button>
                      {notes.length === 0 ? (
                        <Empty description="Нет заметок" />
                      ) : (
                        <List
                          dataSource={notes}
                          renderItem={(note) => (
                            <div style={{
                              background: '#fafafa',
                              borderRadius: 8,
                              padding: 12,
                              marginBottom: 8,
                              borderLeft: `3px solid ${NOTE_PRIORITIES[note.priority]?.color === 'red' ? '#ff4d4f' :
                                NOTE_PRIORITIES[note.priority]?.color === 'orange' ? '#fa8c16' :
                                  NOTE_PRIORITIES[note.priority]?.color === 'blue' ? '#1890ff' : '#52c41a'}`,
                            }}>
                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 8,
                              }}>
                                <Tag color={NOTE_PRIORITIES[note.priority]?.color} style={{ margin: 0 }}>
                                  {NOTE_PRIORITIES[note.priority]?.icon} {NOTE_PRIORITIES[note.priority]?.label}
                                </Tag>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  {new Date(note.created_at).toLocaleString('ru-RU')}
                                </Text>
                              </div>
                              <Text style={{ fontSize: 13 }}>{note.content}</Text>
                              {note.manager && (
                                <div style={{ marginTop: 8 }}>
                                  <Text type="secondary" style={{ fontSize: 11 }}>
                                    — {note.manager.name}
                                  </Text>
                                </div>
                              )}
                            </div>
                          )}
                        />
                      )}
                    </Card>
                  )
                },
                {
                  key: 'chat',
                  label: <span><MessageOutlined /> Чат</span>,
                  children: (
                    <div style={{ height: 'calc(100vh - 250px)', background: '#fff' }}>
                      {/* We render OrderChat here for mobile */}
                      {order.contact_id || order.main_id || order.external_id ? (
                        <OrderChat
                          orderId={order.id}
                          contactName={order.contact?.name}
                        />
                      ) : (
                        <Empty description="Нет чата" />
                      )}
                    </div>
                  )
                }
              ]}
            />
          ) : (
            <Card
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 12,
                overflow: 'hidden',
              }}
              bodyStyle={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                padding: 0,
                overflow: 'hidden',
              }}
            >
              <Tabs
                activeKey={activeInfoTab}
                onChange={(key) => setActiveInfoTab(key as 'info' | 'notes')}
                style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                tabBarStyle={{ padding: '0 16px', margin: 0 }}
                items={[
                  {
                    key: 'info',
                    label: (
                      <span>
                        <InfoCircleOutlined /> Информация
                      </span>
                    ),
                    children: (
                      <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
                        {/* Order Info */}
                        <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
                          <Descriptions.Item label="Статус">
                            <Select
                              value={order.status}
                              onChange={handleStatusChange}
                              size="small"
                              style={{ width: '100%' }}
                              popupMatchSelectWidth={false}
                              bordered={false}
                            >
                              {sortedStatusOptions.map((opt) => (
                                <Option key={opt.value} value={opt.value}>
                                  <Space>
                                    <span>{opt.icon}</span>
                                    <span>{opt.label}</span>
                                  </Space>
                                </Option>
                              ))}
                            </Select>
                          </Descriptions.Item>
                          <Descriptions.Item label="Сумма">
                            <Text strong>{order.amount.toLocaleString('ru-RU') || 0} {order.currency || 'RUB'}</Text>
                          </Descriptions.Item>
                          {order.due_date && (
                            <Descriptions.Item label="Крайний срок">
                              <CalendarOutlined /> {new Date(order.due_date).toLocaleDateString('ru-RU')}
                            </Descriptions.Item>
                          )}
                          {order.source && (
                            <Descriptions.Item label="Источник">
                              {order.source}
                            </Descriptions.Item>
                          )}
                          {order.manager && (
                            <Descriptions.Item label="Менеджер">
                              {order.manager.name}
                            </Descriptions.Item>
                          )}
                          <Descriptions.Item label="Создано">
                            {new Date(order.created_at).toLocaleString('ru-RU')}
                          </Descriptions.Item>
                          {order.closed_date && (
                            <Descriptions.Item label="Закрыто">
                              {new Date(order.closed_date).toLocaleDateString('ru-RU')}
                            </Descriptions.Item>
                          )}
                        </Descriptions>

                        {order.description && (
                          <>
                            <Divider style={{ margin: '12px 0' }} />
                            <div>
                              <Text strong style={{ fontSize: 13 }}>Описание:</Text>
                              <div style={{ marginTop: 8, color: '#595959' }}>
                                <Text>{order.description}</Text>
                              </div>
                            </div>
                          </>
                        )}

                        {/* Contact Card */}
                        {order.contact && (
                          <>
                            <Divider style={{ margin: '16px 0' }} />
                            <div style={{
                              background: 'linear-gradient(135deg, #f6f8fc 0%, #eef2f7 100%)',
                              borderRadius: 12,
                              padding: 16,
                            }}>
                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 12,
                              }}>
                                <Text strong style={{ fontSize: 14 }}>Контакт</Text>
                                <Button
                                  type="link"
                                  size="small"
                                  onClick={() => navigate(`/contact/${order.contact_id}`)}
                                >
                                  Открыть
                                </Button>
                              </div>
                              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <Avatar
                                    style={{ backgroundColor: '#667eea' }}
                                    icon={<UserOutlined />}
                                    size={32}
                                  />
                                  <Text strong>{order.contact.name}</Text>
                                </div>
                                {order.contact.phone && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#595959' }}>
                                    <PhoneOutlined />
                                    <Text copyable>{order.contact.phone}</Text>
                                  </div>
                                )}
                                {order.contact.email && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#595959' }}>
                                    <MailOutlined />
                                    <Text copyable>{order.contact.email}</Text>
                                  </div>
                                )}
                              </Space>
                            </div>
                          </>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'notes',
                    label: (
                      <span>
                        <MessageOutlined /> Заметки ({notes.length})
                      </span>
                    ),
                    children: (
                      <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
                        <Button
                          type="dashed"
                          icon={<PlusOutlined />}
                          onClick={() => setIsNoteModalVisible(true)}
                          block
                          style={{ marginBottom: 16, borderRadius: 8 }}
                        >
                          Добавить заметку
                        </Button>
                        {notes.length === 0 ? (
                          <Empty
                            description="Нет заметок"
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                          />
                        ) : (
                          <List
                            dataSource={notes}
                            renderItem={(note) => (
                              <div style={{
                                background: '#fafafa',
                                borderRadius: 8,
                                padding: 12,
                                marginBottom: 8,
                                borderLeft: `3px solid ${NOTE_PRIORITIES[note.priority]?.color === 'red' ? '#ff4d4f' :
                                  NOTE_PRIORITIES[note.priority]?.color === 'orange' ? '#fa8c16' :
                                    NOTE_PRIORITIES[note.priority]?.color === 'blue' ? '#1890ff' : '#52c41a'}`,
                              }}>
                                <div style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginBottom: 8,
                                }}>
                                  <Tag color={NOTE_PRIORITIES[note.priority]?.color} style={{ margin: 0 }}>
                                    {NOTE_PRIORITIES[note.priority]?.icon} {NOTE_PRIORITIES[note.priority]?.label}
                                  </Tag>
                                  <Text type="secondary" style={{ fontSize: 11 }}>
                                    {new Date(note.created_at).toLocaleString('ru-RU')}
                                  </Text>
                                </div>
                                <Text style={{ fontSize: 13 }}>{note.content}</Text>
                                {note.manager && (
                                  <div style={{ marginTop: 8 }}>
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                      — {note.manager.name}
                                    </Text>
                                  </div>
                                )}
                              </div>
                            )}
                          />
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            </Card>
          )}
        </div>

        {/* Right Side - Chat (Desktop Only) */}
        {!isMobile && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            overflow: 'hidden',
          }}>
            {order.contact_id || order.main_id || order.external_id ? (
              <OrderChat
                orderId={order.id}
                contactName={order.contact?.name}
              />
            ) : (
              <Card style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
              }}>
                <Empty
                  description="У заявки нет связанного контакта или ID"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Edit Order Modal */}
      <Modal
        title="Редактировать заявку"
        open={isEditModalVisible}
        onCancel={() => {
          setIsEditModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={600}
        styles={{
          header: { borderRadius: '12px 12px 0 0' },
          body: { paddingTop: 24 },
        }}
      >
        <Form form={form} layout="vertical" onFinish={handleUpdateOrder}>
          <Form.Item name="title" label="Название заявки" rules={[{ required: true }]}>
            <Input placeholder="Название заявки" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="amount" label="Сумма">
                <Input type="number" placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="currency" label="Валюта">
                <Select>
                  <Option value="RUB">₽ RUB</Option>
                  <Option value="USD">$ USD</Option>
                  <Option value="EUR">€ EUR</Option>
                  <Option value="USDT">₮ USDT</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="status" label="Статус">
            <Select>
              {Object.entries(ORDER_STATUSES).map(([key, info]) => (
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
            <Input.TextArea rows={4} placeholder="Описание заявки" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Create Note Modal */}
      <Modal
        title="Добавить заметку"
        open={isNoteModalVisible}
        onCancel={() => {
          setIsNoteModalVisible(false);
          noteForm.resetFields();
        }}
        onOk={() => noteForm.submit()}
        styles={{
          header: { borderRadius: '12px 12px 0 0' },
        }}
      >
        <Form form={noteForm} layout="vertical" onFinish={handleCreateNote}>
          <Form.Item name="content" label="Содержание" rules={[{ required: true }]}>
            <TextArea rows={4} placeholder="Текст заметки" />
          </Form.Item>
          <Form.Item name="priority" label="Приоритет" initialValue="info">
            <Select>
              {Object.entries(NOTE_PRIORITIES).map(([key, info]) => (
                <Option key={key} value={key}>
                  {info.icon} {info.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default OrderDetailPage;
