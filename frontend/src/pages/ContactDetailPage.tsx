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
  message,
  Empty,
  Grid
} from 'antd';
import {
  UserOutlined,
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { Contact, Order, Note, Message, NOTE_PRIORITIES, ORDER_STATUSES } from '../types';
import { contactsAPI, ordersAPI, notesAPI, contactMessagesAPI, orderMessagesAPI, messagesAPI } from '../services/api';
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

    // Listen for messages specifically for this contact
    socketRef.current.on('contact_message', (data: { contact_id: number; message: Message }) => {
      if (data.contact_id === parseInt(id || '0')) {
        setMessages(prev => {
          if (prev.some(msg => msg.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
      }
    });

    socketRef.current.on('message_updated', (msg: Message) => {
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m));
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

  const handleAddReaction = async (msg: Message, emoji: string) => {
    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id === msg.id) {
        const currentReactions = m.reactions || [];
        return {
          ...m,
          reactions: [...currentReactions, {
            emoji,
            author: 'Me', // Placeholder
            created_at: new Date().toISOString()
          }]
        };
      }
      return m;
    }));

    try {
      await messagesAPI.addReaction(msg.id, emoji);
    } catch (error) {
      console.error('Error adding reaction:', error);
      message.error('Не удалось добавить реакцию');
    }
  };

  const handleSendText = async (text: string) => {
    if (!id || !manager) return;

    setSending(true);
    try {
      // Находим активную заявку (как в OrderChat)
      const activeOrder = orders.find(o =>
        !['completed', 'scammer', 'client_rejected', 'lost'].includes(o.status)
      ) || orders[0]; // Берём последнюю если нет активной

      if (!activeOrder) {
        message.error('Нет заявок для отправки сообщения');
        return;
      }

      // Отправляем через рабочий API из OrderChat
      const newMsg = await orderMessagesAPI.sendClientMessage(activeOrder.id, text);
      // Оптимистичное обновление как в OrderChat
      setMessages(prev => [...prev, newMsg]);
      scrollToBottom();
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
      const activeOrder = orders.find(o =>
        !['completed', 'scammer', 'client_rejected', 'lost'].includes(o.status)
      ) || orders[0];

      if (!activeOrder) {
        message.error('Нет заявок для отправки сообщения');
        return;
      }

      const newMsg = await orderMessagesAPI.sendClientVoice(activeOrder.id, voice, duration);
      setMessages(prev => [...prev, newMsg]);
      scrollToBottom();
    } catch (error: any) {
      console.error('Error sending voice:', error);
      message.error('Ошибка отправки голосового');
    } finally {
      setSending(false);
    }
  };

  const handleSendFile = async (file: File, caption?: string) => {
    if (!id || !manager) return;
    setSending(true);
    try {
      const activeOrder = orders.find(o =>
        !['completed', 'scammer', 'client_rejected', 'lost'].includes(o.status)
      ) || orders[0];

      if (!activeOrder) {
        message.error('Нет заявок для отправки сообщения');
        return;
      }

      const newMsg = await orderMessagesAPI.sendClientFile(activeOrder.id, file, caption);
      setMessages(prev => [...prev, newMsg]);
      scrollToBottom();
    } catch (error: any) {
      console.error('Error sending file:', error);
      message.error(error.response?.data?.error || 'Ошибка отправки файла');
    } finally {
      setSending(false);
    }
  };

  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  if (!contact) {
    return <div>Загрузка...</div>;
  }




  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
      {/* Header */}
      <div style={{
        background: '#fff',
        padding: isMobile ? '12px 16px' : '24px',
        borderBottom: '1px solid #f0f0f0'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Space align="start">
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/contacts')} shape="circle" />
            <Space size={16} style={{ marginLeft: 8 }}>
              <Avatar size={isMobile ? 48 : 64} icon={<UserOutlined />} src={contact.avatar_url} />
              <div>
                <Title level={isMobile ? 4 : 2} style={{ margin: 0 }}>{contact.name}</Title>
                <Text type="secondary">{contact.position || 'Клиент'}</Text>
              </div>
            </Space>
          </Space>
          {!isMobile && (
            <Button icon={<EditOutlined />} onClick={() => setIsEditModalVisible(true)}>
              Редактировать
            </Button>
          )}
          {isMobile && (
            <Button type="text" icon={<EditOutlined />} onClick={() => setIsEditModalVisible(true)} />
          )}
        </div>

        {/* Quick Stats Summary */}
        <div style={{
          marginTop: 16,
          display: 'flex',
          gap: 16,
          overflowX: 'auto',
          paddingBottom: 4
        }}>
          <div style={{ background: '#f9f9f9', padding: '8px 12px', borderRadius: 8, minWidth: 100 }}>
            <div style={{ fontSize: 11, color: '#888' }}>Баланс обменов</div>
            <div style={{ fontWeight: 600 }}>{(contact.TotalSumExchanges || contact.orders_total_amount || 0).toLocaleString('ru-RU')}</div>
          </div>
          <div style={{ background: '#f9f9f9', padding: '8px 12px', borderRadius: 8, minWidth: 100 }}>
            <div style={{ fontSize: 11, color: '#888' }}>Заявок</div>
            <div style={{ fontWeight: 600 }}>{contact.orders_count || orders.length || 0}</div>
          </div>
          <div style={{ background: '#f9f9f9', padding: '8px 12px', borderRadius: 8, minWidth: 100 }}>
            <div style={{ fontSize: 11, color: '#888' }}>Лояльность</div>
            <div style={{ fontWeight: 600 }}>{contact.Loyality ?? 0}</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 0 : 24 }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          style={{ background: isMobile ? '#fff' : 'transparent' }}
          tabBarStyle={{
            padding: isMobile ? '0 16px' : 0,
            background: isMobile ? '#fff' : 'transparent',
            marginBottom: isMobile ? 0 : 16
          }}
          items={[
            {
              key: 'data',
              label: 'Инфо',
              children: (
                <div style={{ padding: isMobile ? 16 : 0, background: isMobile ? '#fff' : 'transparent' }}>
                  <Card bordered={false} style={{ borderRadius: isMobile ? 0 : 8, boxShadow: isMobile ? 'none' : undefined }}>
                    <Descriptions column={1} layout={isMobile ? 'vertical' : 'horizontal'}>
                      <Descriptions.Item label="Email">{contact.email || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Телефон">{contact.phone || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Дата создания">{new Date(contact.created_at).toLocaleDateString()}</Descriptions.Item>
                      <Descriptions.Item label="Комментарий">{contact.comment || '-'}</Descriptions.Item>
                    </Descriptions>
                  </Card>
                </div>
              ),
            },
            {
              key: 'messages',
              label: 'Чат',
              children: (
                <div style={{
                  height: isMobile ? 'calc(100vh - 280px)' : '600px', // Fixed height for chat area
                  display: 'flex', flexDirection: 'column',
                  background: '#fff',
                  margin: isMobile ? 0 : 0
                }}>
                  <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                    {messages.length === 0 ? (
                      <Empty description="Нет сообщений" style={{ marginTop: 40 }} />
                    ) : (
                      // Keeping message logic same, just structure
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
                            {group.msgs.map((msg, index) => (
                              <UnifiedMessageBubble
                                key={msg.id || index}
                                msg={msg}
                                isOwn={(msg.author_type || msg.sender_type) === 'manager'}
                                variant="client"
                                onAddReaction={handleAddReaction}
                              />
                            ))}
                          </div>
                        ));
                      })()
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  <ChatInput
                    onSendText={handleSendText}
                    onSendVoice={handleSendVoice}
                    onSendFile={handleSendFile}
                    sending={sending}
                  />
                </div>
              )
            },
            {
              key: 'orders',
              label: `Заявки (${orders.length})`,
              children: (
                <div style={{ padding: isMobile ? 16 : 0, paddingBottom: 80 }}>
                  <Button block type="dashed" icon={<PlusOutlined />} onClick={() => navigate(`/orders?contact_id=${id}`)} style={{ marginBottom: 16 }}>
                    Новая заявка
                  </Button>
                  <List
                    dataSource={orders}
                    renderItem={order => (
                      <Card size="small" style={{ marginBottom: 8, borderRadius: 8 }} onClick={() => navigate(`/order/${order.main_id || order.id}`)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <div style={{ fontWeight: 600 }}>#{order.id} {order.title}</div>
                          <Tag>{ORDER_STATUSES[order.status]?.label}</Tag>
                        </div>
                        <div style={{ marginTop: 8, color: '#666' }}>
                          {order.amount?.toLocaleString()} {order.currency}
                        </div>
                      </Card>
                    )}
                  />
                </div>
              )
            },
            {
              key: 'notes',
              label: 'Заметки',
              children: (
                <div style={{ padding: isMobile ? 16 : 0 }}>
                  <Button block type="dashed" icon={<PlusOutlined />} onClick={() => setIsNoteModalVisible(true)} style={{ marginBottom: 16 }}>
                    Добавить заметку
                  </Button>
                  <List
                    dataSource={notes}
                    renderItem={note => {
                      const priorityInfo = NOTE_PRIORITIES[note.priority];
                      return (
                        <Card size="small" style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Space>
                              <span>{priorityInfo.icon}</span>
                              <span style={{ fontWeight: 500 }}>{priorityInfo.label}</span>
                            </Space>
                            {note.manager_id === manager?.id && (
                              <Button type="text" danger icon={<DeleteOutlined />} size="small" onClick={() => handleDeleteNote(note.id)} />
                            )}
                          </div>
                          <div style={{ marginTop: 8 }}>{note.content}</div>
                          <div style={{ marginTop: 4, fontSize: 11, color: '#aaa' }}>
                            {note.manager?.name} • {new Date(note.created_at).toLocaleString('ru-RU')}
                          </div>
                        </Card>
                      );
                    }}
                  />
                </div>
              )
            }
          ]}
        />
      </div>

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
              <Form.Item name="email" label="Email">
                <Input type="email" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="position" label="Должность">
                <Input />
              </Form.Item>
            </Col>
          </Row>
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
