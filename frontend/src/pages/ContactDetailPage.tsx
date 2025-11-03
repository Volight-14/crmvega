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
  Divider,
  message,
  Empty,
} from 'antd';
import {
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
  SendOutlined,
  FileTextOutlined,
  TagOutlined,
  HistoryOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { Contact, Deal, Note, Message, NOTE_PRIORITIES, DEAL_STATUSES } from '../types';
import { contactsAPI, dealsAPI, notesAPI, contactMessagesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
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
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('data');
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isNoteModalVisible, setIsNoteModalVisible] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [form] = Form.useForm();
  const [noteForm] = Form.useForm();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (id) {
      fetchContact();
      fetchDeals();
      fetchNotes();
      fetchMessages();
      setupSocket();
    }

    return () => {
      socketRef.current?.disconnect();
    };
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const setupSocket = () => {
    if (!id || !manager) return;

    const socketUrl = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';
    socketRef.current = io(socketUrl, {
      transports: ['websocket', 'polling'],
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

    return () => {
      socketRef.current?.disconnect();
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

  const fetchDeals = async () => {
    if (!id) return;
    try {
      const { deals: fetchedDeals } = await dealsAPI.getAll({ contact_id: parseInt(id) });
      setDeals(fetchedDeals);
    } catch (error) {
      console.error('Error fetching deals:', error);
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

  const fetchMessages = async () => {
    if (!id) return;
    try {
      const data = await contactMessagesAPI.getByContactId(parseInt(id));
      setMessages(data);
    } catch (error) {
      console.error('Error fetching messages:', error);
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
    if (!id) return;
    try {
      await notesAPI.create({
        contact_id: parseInt(id),
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

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !id || !manager) return;

    setSending(true);
    try {
      // Отправляем сообщение напрямую контакту (API автоматически создаст/найдет сделку)
      const newMsg = await contactMessagesAPI.sendToContact(
        parseInt(id),
        newMessage.trim(),
        'manager'
      );
      
      // Добавляем сообщение в список для мгновенного отображения
      setMessages(prev => [...prev, newMsg]);
      setNewMessage('');
    } catch (error: any) {
      console.error('Error sending message:', error);
      message.error(error.response?.data?.error || 'Ошибка отправки сообщения');
    } finally {
      setSending(false);
    }
  };

  if (!contact) {
    return <div>Загрузка...</div>;
  }

  const dealColumns = [
    {
      title: 'Сделка',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: Deal) => (
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
      render: (status: Deal['status']) => {
        const statusInfo = DEAL_STATUSES[status];
        return <Tag color={statusInfo.color}>{statusInfo.icon} {statusInfo.label}</Tag>;
      },
    },
    {
      title: 'Сумма',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number, record: Deal) => (
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
      render: (_: any, record: Deal) => (
        <Button type="link" onClick={() => navigate(`/deal/${record.id}`)}>
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
            <Avatar size={64} icon={<UserOutlined />} />
            <div>
              <Title level={2} style={{ margin: 0 }}>
                {contact.name}
              </Title>
              <Space>
                {contact.phone && (
                  <Text>
                    <PhoneOutlined /> {contact.phone}
                  </Text>
                )}
                {contact.email && (
                  <Text>
                    <MailOutlined /> {contact.email}
                  </Text>
                )}
              </Space>
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
          <Descriptions.Item label="Компания">{contact.company || '-'}</Descriptions.Item>
          <Descriptions.Item label="Должность">{contact.position || '-'}</Descriptions.Item>
          <Descriptions.Item label="Статус">
            <Tag color={contact.status === 'active' ? 'green' : contact.status === 'needs_attention' ? 'orange' : 'default'}>
              {contact.status === 'active' ? 'Активный' : contact.status === 'needs_attention' ? 'Требует внимания' : 'Неактивный'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Рейтинг">
            {contact.rating ? `${contact.rating}/5` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Всего сделок" span={2}>
            <Badge count={contact.deals_count || 0} showZero>
              <span style={{ marginRight: 8 }}>Сделок:</span>
            </Badge>
            <Text strong style={{ marginLeft: 16 }}>
              Сумма: {contact.deals_total_amount?.toLocaleString('ru-RU') || 0} ₽
            </Text>
          </Descriptions.Item>
          {contact.address && (
            <Descriptions.Item label="Адрес" span={2}>{contact.address}</Descriptions.Item>
          )}
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
            <div style={{ height: '500px', overflowY: 'auto', padding: '16px', background: '#fafafa', borderRadius: '8px', marginBottom: '16px' }}>
              {messages.length === 0 ? (
                <Empty description="Нет сообщений" />
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      marginBottom: '16px',
                      display: 'flex',
                      justifyContent: msg.sender_type === 'manager' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '70%',
                        padding: '12px',
                        borderRadius: '8px',
                        background: msg.sender_type === 'manager' ? '#1890ff' : '#f0f0f0',
                        color: msg.sender_type === 'manager' ? 'white' : 'black',
                      }}
                    >
                      <div>{msg.content}</div>
                      <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '4px' }}>
                        {new Date(msg.created_at).toLocaleString('ru-RU')}
                        {msg.sender?.name && ` • ${msg.sender.name}`}
                        {(msg as any).deal_title && (
                          <Tag size="small" style={{ marginLeft: 8 }}>
                            Сделка: {(msg as any).deal_title}
                          </Tag>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="Напишите сообщение..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onPressEnter={handleSendMessage}
              />
              <Button type="primary" icon={<SendOutlined />} onClick={handleSendMessage} loading={sending}>
                Отправить
              </Button>
            </Space.Compact>
              ),
            },
            {
              key: 'deals',
              label: (
                <span>
                  <FileTextOutlined /> Сделки
                </span>
              ),
              children: (
            <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
              <Title level={4} style={{ margin: 0 }}>Сделки контакта</Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/deals?contact_id=${id}`)}>
                Новая сделка
              </Button>
            </Space>
            <Table
              columns={dealColumns}
              dataSource={deals}
              rowKey="id"
              pagination={false}
            />
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
              ),
            },
            {
              key: 'tags',
              label: (
                <span>
                  <TagOutlined /> Теги
                </span>
              ),
              children: (
            <Title level={4}>Теги контакта</Title>
            <Space wrap>
              {contact.tags?.map((tag) => (
                <Tag key={tag.id} color={tag.color} style={{ fontSize: 14, padding: '4px 12px' }}>
                  {tag.name}
                </Tag>
              ))}
              {(!contact.tags || contact.tags.length === 0) && (
                <Text type="secondary">Тегов нет</Text>
              )}
            </Space>
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
            <Title level={4}>История действий</Title>
            <Empty description="История действий пока не реализована" />
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
