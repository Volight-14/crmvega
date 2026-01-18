import React, { useState, useEffect, useRef } from 'react';
import {
  Typography,
  Card,
  Tabs,
  Space,
  Avatar,
  Button,
  Row,
  Col,
  Descriptions,
  Tag,
  List,
  Input,
  Form,
  Modal,
  Select,
  Table,
  Badge,
  message,
  Empty,
} from 'antd';
import {
  UserOutlined,
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
  FileTextOutlined,
  HistoryOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { Contact, Order, Note, Message, NOTE_PRIORITIES, ORDER_STATUSES } from '../types';
import { contactsAPI, ordersAPI, notesAPI, contactMessagesAPI, orderMessagesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { UnifiedMessageBubble } from '../components/UnifiedMessageBubble';
import { ChatInput } from '../components/ChatInput';
import { formatDate } from '../utils/chatUtils';
import io from 'socket.io-client';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

type Socket = ReturnType<typeof io>;

const ContactDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { manager } = useAuth();
  const [contact, setContact] = useState<Contact | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  const [activeTab, setActiveTab] = useState('data');
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isNoteModalVisible, setIsNoteModalVisible] = useState(false);
  const [sending, setSending] = useState(false);
  const [form] = Form.useForm();
  const [noteForm] = Form.useForm();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (id) {
      fetchContact();
      fetchOrders();
      fetchNotes();
      fetchAllMessages();
      setupSocket();
    }

    return () => {
      socketRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const setupSocket = () => {
    if (!id || !manager) return;

    const socketUrl = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';
    socketRef.current = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current.on('connect', () => {
      socketRef.current?.emit('join_contact', id);
    });

    socketRef.current.on('new_message', (newMessage: Message) => {
      setMessages(prev => {
        if (prev.some(msg => msg.id === newMessage.id)) return prev;
        return [...prev, newMessage];
      });
    });

    socketRef.current.on('contact_message', (data: { contact_id: number; message: Message }) => {
      if (data.contact_id === parseInt(id || '0')) {
        setMessages(prev => {
          if (prev.some(msg => msg.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
      }
    });

    const handleReconnect = () => {
      console.log('Socket reconnected, refreshing messages...');
      fetchAllMessages();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('Tab became visible, refreshing messages...');
        fetchAllMessages();
        if (socketRef.current && !socketRef.current.connected) {
          socketRef.current.connect();
        }
      }
    };

    socketRef.current.on('connect', handleReconnect);
    socketRef.current.io.on("reconnect", handleReconnect);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      socketRef.current?.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchContact = async () => {
    if (!id) return;
    try {
      const data = await contactsAPI.getById(parseInt(id));
      setContact(data);
      form.setFieldsValue(data);
    } catch (error) {
      console.error('Error fetching contact:', error);
      message.error('Ошибка загрузки контакта');
    }
  };

  const fetchOrders = async () => {
    if (!id) return;
    try {
      const { orders: fetchedOrders } = await ordersAPI.getAll({ contact_id: parseInt(id) });
      setOrders(fetchedOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const fetchNotes = async () => {
    if (!id) return;
    try {
      const data = await notesAPI.getByContactId(parseInt(id));
      setNotes(data);
    } catch (error) {
      console.error('Error fetching notes:', error);
    }
  };

  const fetchAllMessages = async () => {
    if (!id) return;
    try {
      setSending(true);
      // 1. Fetch direct contact messages
      const contactMsgs = await contactMessagesAPI.getByContactId(parseInt(id));

      // 2. Fetch messages from all orders
      // We need orders to be loaded first. If not, we fetch them here or rely on passed orders.
      // Ideally, we fetch orders first.
      const { orders: contactOrders } = await ordersAPI.getAll({ contact_id: parseInt(id) });

      const orderMessagePromises = contactOrders.map(async (order) => {
        try {
          const clientMsgs = await orderMessagesAPI.getClientMessages(order.id);
          // Add context to messages
          return clientMsgs.messages.map(m => ({
            ...m,
            order_title: order.title,
            order_id: order.id
          }));
        } catch (e) {
          return [];
        }
      });

      const orderMessagesArrays = await Promise.all(orderMessagePromises);
      const allOrderMessages = orderMessagesArrays.flat();

      // Combine and Remove Duplicates
      // Duplicates might exist if contact API returns messages that are also linked to orders
      // or if same message ID appears multiple times.
      const allRawMessages = [...contactMsgs, ...allOrderMessages];
      const uniqueMessagesMap = new Map();

      allRawMessages.forEach(msg => {
        // Use a composite key or ID to detect duplicates.
        // If IDs are consistent across endpoints:
        if (msg.id) {
          uniqueMessagesMap.set(msg.id, msg);
        } else {
          // Fallback for missing IDs (unlikely but possible during dev)
          const key = `${msg.created_at}-${msg.content}`;
          uniqueMessagesMap.set(key, msg);
        }
      });

      const uniqueMessages = Array.from(uniqueMessagesMap.values());

      // Sort by date
      const sortedMessages = uniqueMessages.sort((a, b) => {
        const dateA = new Date(a['Created Date'] || a.created_at || 0).getTime();
        const dateB = new Date(b['Created Date'] || b.created_at || 0).getTime();
        return dateA - dateB;
      });

      setMessages(sortedMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setSending(false);
    }
  };

  const handleUpdateContact = async (values: any) => {
    if (!id) return;
    try {
      await contactsAPI.update(parseInt(id), values);
      message.success('Контакт обновлен');
      setIsEditModalVisible(false);
      fetchContact();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка обновления контакта');
    }
  };

  const handleCreateNote = async (values: any) => {
    if (!id || !manager) return;
    try {
      await notesAPI.create({
        contact_id: parseInt(id),
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

  const handleDeleteNote = async (noteId: number) => {
    try {
      await notesAPI.delete(noteId);
      message.success('Заметка удалена');
      fetchNotes();
    } catch (error: any) {
      message.error('Ошибка удаления заметки');
    }
  };

  const handleSendText = async (text: string) => {
    if (!id || !manager) return;

    setSending(true);
    try {
      // Отправляем сообщение напрямую контакту (API автоматически создаст/найдет заявку)
      const newMsg = await contactMessagesAPI.sendToContact(
        parseInt(id),
        text,
        'manager'
      );

      // Добавляем сообщение в список для мгновенного отображения (с проверкой на дубликаты)
      setMessages(prev => {
        if (prev.some(m => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    } catch (error: any) {
      console.error('Error sending message:', error);
      message.error(error.response?.data?.error || 'Ошибка отправки сообщения');
    } finally {
      setSending(false);
    }
  };

  const handleSendVoice = async (voice: Blob, duration: number) => {
    if (!id || !manager) return;
    setSending(true);
    try {
      const newMsg = await contactMessagesAPI.sendVoice(parseInt(id), voice, duration);
      setMessages(prev => {
        if (prev.some(m => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    } catch (error: any) {
      console.error('Error sending voice:', error);
      message.error('Ошибка отправки голосового');
    } finally {
      setSending(false);
    }
  };

  if (!contact) {
    return <div>Загрузка...</div>;
  }

  const orderColumns = [
    {
      title: 'Заявка',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: Order) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{title}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            ID: {record.id}
          </Text>
        </div>
      ),
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      render: (status: Order['status']) => {
        const statusInfo = ORDER_STATUSES[status];
        return <Tag color={statusInfo.color}>{statusInfo.icon} {statusInfo.label}</Tag>;
      },
    },
    {
      title: 'Сумма',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number, record: Order) => (
        <Text strong>{amount?.toLocaleString('ru-RU') || 0} {record.currency || 'RUB'}</Text>
      ),
    },
    {
      title: 'Дата создания',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleDateString('ru-RU'),
    },
    {
      title: 'Действия',
      key: 'actions',
      render: (_: any, record: Order) => (
        <Button type="link" onClick={() => navigate(`/order/${record.main_id || record.id}`)}>
          Открыть
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/contacts')}>
              Назад
            </Button>
            <Avatar size={64} icon={<UserOutlined />} src={contact.avatar_url} />
            <div>
              <Title level={2} style={{ margin: 0 }}>
                {contact.name}
              </Title>

            </div>
          </Space>
        </Col>
        <Col>
          <Button icon={<EditOutlined />} onClick={() => setIsEditModalVisible(true)}>
            Редактировать
          </Button>
        </Col>
      </Row>

      <Card>
        <Descriptions column={2} bordered>
          <Descriptions.Item label="Дата последнего обмена">
            {contact.Date_LastOrder ? new Date(contact.Date_LastOrder).toLocaleDateString('ru-RU') : (
              orders.length > 0 ? new Date(orders[0].created_at).toLocaleDateString('ru-RU') : '-'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Балл лояльности">
            {contact.Loyality ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Сумма обменов">
            {(contact.TotalSumExchanges || contact.orders_total_amount || 0).toLocaleString('ru-RU')}
          </Descriptions.Item>
          <Descriptions.Item label="Кто пригласил">
            {contact.WhoInvite || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Всего заявок" span={2}>
            <Badge count={contact.orders_count || orders.length || 0} showZero>
              <span style={{ marginRight: 8 }}>Заявок:</span>
            </Badge>
          </Descriptions.Item>
          {contact.comment && (
            <Descriptions.Item label="Комментарий" span={2}>{contact.comment}</Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card style={{ marginTop: 24 }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'data',
              label: (
                <span>
                  <UserOutlined /> Контактные данные
                </span>
              ),
              children: (
                <Form form={form} layout="vertical" onFinish={handleUpdateContact}>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="name" label="Имя">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="phone" label="Телефон">
                        <Input />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="email" label="Email">
                        <Input type="email" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="company" label="Компания">
                        <Input />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item name="address" label="Адрес">
                    <TextArea rows={2} />
                  </Form.Item>
                  <Form.Item name="comment" label="Комментарий">
                    <TextArea rows={3} />
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit">
                      Сохранить изменения
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'messages',
              label: (
                <span>
                  <FileTextOutlined /> Сообщения
                </span>
              ),
              children: (
                <>
                  <div style={{ height: '500px', overflowY: 'auto', padding: '16px', background: '#fff', borderRadius: '8px', border: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
                    {messages.length === 0 ? (
                      <Empty description="Нет сообщений" style={{ marginTop: 'auto', marginBottom: 'auto' }} />
                    ) : (
                      (() => {
                        const groupedMessages: { date: string, msgs: Message[] }[] = [];
                        messages.forEach(msg => {
                          const dateKey = formatDate(msg['Created Date'] || msg.created_at);
                          const lastGroup = groupedMessages[groupedMessages.length - 1];
                          if (lastGroup && lastGroup.date === dateKey) {
                            lastGroup.msgs.push(msg);
                          } else {
                            groupedMessages.push({ date: dateKey, msgs: [msg] });
                          }
                        });

                        return groupedMessages.map(group => (
                          <div key={group.date}>
                            <div style={{ textAlign: 'center', margin: '16px 0', opacity: 0.5, fontSize: 12 }}>
                              <span style={{ background: '#f5f5f5', padding: '4px 12px', borderRadius: 12 }}>{group.date}</span>
                            </div>
                            {group.msgs.map((msg, index) => {
                              const prevMsg = index > 0 ? group.msgs[index - 1] : null;
                              const currentOrderId = (msg as any).order_id;
                              const prevOrderId = prevMsg ? (prevMsg as any).order_id : null;
                              const showOrderHeader = currentOrderId && currentOrderId !== prevOrderId;

                              return (
                                <div key={msg.id || `${msg.created_at}-${Math.random()}`}>
                                  {showOrderHeader && (
                                    <div style={{ textAlign: 'center', margin: '12px 0 4px 0', opacity: 0.6, fontSize: '11px' }}>
                                      <Tag>Заявка #{currentOrderId} - {(msg as any).order_title}</Tag>
                                    </div>
                                  )}
                                  <UnifiedMessageBubble
                                    msg={msg}
                                    isOwn={(msg.author_type || msg.sender_type) === 'manager'}
                                    variant="client"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ));
                      })()
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  <ChatInput
                    onSendText={handleSendText}
                    onSendVoice={handleSendVoice}
                    sending={sending}
                  />
                </>
              ),
            },
            {
              key: 'orders',
              label: (
                <span>
                  <FileTextOutlined /> Заявки
                </span>
              ),
              children: (
                <>
                  <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
                    <Title level={4} style={{ margin: 0 }}>Заявки контакта</Title>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/orders?contact_id=${id}`)}>
                      Новая заявка
                    </Button>
                  </Space>
                  <Table
                    columns={orderColumns}
                    dataSource={orders}
                    rowKey="id"
                    pagination={false}
                  />
                </>
              ),
            },
            {
              key: 'notes',
              label: (
                <span>
                  <FileTextOutlined /> Заметки
                </span>
              ),
              children: (
                <>
                  <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
                    <Title level={4} style={{ margin: 0 }}>Внутренние заметки</Title>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsNoteModalVisible(true)}>
                      Добавить заметку
                    </Button>
                  </Space>
                  <List
                    dataSource={notes}
                    renderItem={(note) => {
                      const priorityInfo = NOTE_PRIORITIES[note.priority];
                      return (
                        <List.Item>
                          <List.Item.Meta
                            title={
                              <Space>
                                <span>{priorityInfo.icon}</span>
                                <span>{priorityInfo.label}</span>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {note.manager?.name} • {new Date(note.created_at).toLocaleString('ru-RU')}
                                </Text>
                                {note.manager_id === manager?.id && (
                                  <Button
                                    type="link"
                                    danger
                                    size="small"
                                    icon={<DeleteOutlined />}
                                    onClick={() => handleDeleteNote(note.id)}
                                  >
                                    Удалить
                                  </Button>
                                )}
                              </Space>
                            }
                            description={note.content}
                          />
                        </List.Item>
                      );
                    }}
                  />
                </>
              ),
            },
            {
              key: 'history',
              label: (
                <span>
                  <HistoryOutlined /> История
                </span>
              ),
              children: (
                <>
                  <Title level={4} style={{ marginBottom: 16 }}>История клиента</Title>
                  <List
                    bordered
                    dataSource={[
                      {
                        label: 'Дата регистрации/создания',
                        date: contact.created_at,
                        icon: <UserOutlined />,
                        link: undefined
                      },
                      ...orders.filter(o => o.closed_date || o.WhenDone || o.status === 'completed').map(o => ({
                        label: `Заявка #${o.id} выполнена`,
                        date: o.closed_date || o.WhenDone || o.updated_at,
                        icon: <HistoryOutlined />,
                        link: `/order/${o.main_id || o.id}`
                      }))
                    ]}
                    renderItem={(item) => (
                      <List.Item>
                        <List.Item.Meta
                          avatar={<Avatar icon={item.icon} style={{ backgroundColor: '#1890ff' }} />}
                          title={
                            item.link ? (
                              <button
                                onClick={() => navigate(item.link || '')}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  color: '#1890ff',
                                  cursor: 'pointer',
                                  textDecoration: 'none',
                                  fontSize: 'inherit'
                                }}
                              >
                                {item.label}
                              </button>
                            ) : (
                              item.label
                            )
                          }
                          description={new Date(item.date).toLocaleString('ru-RU')}
                        />
                      </List.Item>
                    )}
                  />
                </>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="Редактировать контакт"
        open={isEditModalVisible}
        onCancel={() => setIsEditModalVisible(false)}
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleUpdateContact}>
          <Form.Item name="name" label="Имя" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="Телефон">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="Email">
                <Input type="email" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="company" label="Компания">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="position" label="Должность">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="address" label="Адрес">
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item name="comment" label="Комментарий">
            <TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Добавить заметку"
        open={isNoteModalVisible}
        onCancel={() => {
          setIsNoteModalVisible(false);
          noteForm.resetFields();
        }}
        onOk={() => noteForm.submit()}
      >
        <Form form={noteForm} layout="vertical" onFinish={handleCreateNote}>
          <Form.Item name="priority" label="Приоритет">
            <Select defaultValue="info">
              <Option value="urgent">🔴 Срочно</Option>
              <Option value="important">🟡 Важно</Option>
              <Option value="info">🟢 Информация</Option>
              <Option value="reminder">🔵 Напоминание</Option>
            </Select>
          </Form.Item>
          <Form.Item name="content" label="Текст заметки" rules={[{ required: true }]}>
            <TextArea rows={4} placeholder="Введите текст заметки..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ContactDetailPage;
