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
} from 'antd';
import {
  ArrowLeftOutlined,
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
  DollarOutlined,
  CalendarOutlined,
  EditOutlined,
  SendOutlined,
  FileTextOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { Deal, Note, Message, DEAL_STATUSES, NOTE_PRIORITIES } from '../types';
import { dealsAPI, notesAPI, contactMessagesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import io from 'socket.io-client';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

type Socket = ReturnType<typeof io>;

const DealDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { manager } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isNoteModalVisible, setIsNoteModalVisible] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const [form] = Form.useForm();
  const [noteForm] = Form.useForm();

  useEffect(() => {
    if (id) {
      fetchDeal();
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
      if (deal?.contact_id) {
        socketRef.current?.emit('join_contact', deal.contact_id.toString());
      }
    });

    socketRef.current.on('new_message', (newMessage: Message) => {
      setMessages(prev => {
        if (prev.some(msg => msg.id === newMessage.id)) return prev;
        return [...prev, newMessage];
      });
    });

    socketRef.current.on('deal_updated', (updatedDeal: Deal) => {
      if (updatedDeal.id === parseInt(id || '0')) {
        setDeal(updatedDeal);
      }
    });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchDeal = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const dealData = await dealsAPI.getById(parseInt(id));
      setDeal(dealData);
      form.setFieldsValue(dealData);
    } catch (error) {
      console.error('Error fetching deal:', error);
      message.error('Ошибка загрузки сделки');
    } finally {
      setLoading(false);
    }
  };

  const fetchNotes = async () => {
    if (!id) return;
    try {
      const notesData = await notesAPI.getByDealId(parseInt(id));
      setNotes(notesData);
    } catch (error) {
      console.error('Error fetching notes:', error);
    }
  };

  const fetchMessages = async () => {
    if (!deal?.contact_id) return;
    try {
      const messagesData = await contactMessagesAPI.getByContactId(deal.contact_id);
      setMessages(messagesData);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  useEffect(() => {
    if (deal?.contact_id) {
      fetchMessages();
      setupSocket();
    }
  }, [deal?.contact_id]);

  const handleUpdateDeal = async (values: any) => {
    if (!id) return;
    try {
      await dealsAPI.update(parseInt(id), values);
      message.success('Сделка обновлена');
      setIsEditModalVisible(false);
      fetchDeal();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка обновления сделки');
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !deal?.contact_id || !manager) return;

    setSending(true);
    try {
      const newMsg = await contactMessagesAPI.sendToContact(
        deal.contact_id,
        newMessage.trim(),
        'manager'
      );
      setMessages(prev => [...prev, newMsg]);
      setNewMessage('');
    } catch (error: any) {
      console.error('Error sending message:', error);
      message.error(error.response?.data?.error || 'Ошибка отправки сообщения');
    } finally {
      setSending(false);
    }
  };

  const handleCreateNote = async (values: any) => {
    if (!id || !manager) return;
    try {
      await notesAPI.create({
        deal_id: parseInt(id),
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

  if (!deal) {
    return <div>Загрузка...</div>;
  }

  const statusInfo = DEAL_STATUSES[deal.status];

  return (
    <div style={{ padding: '24px', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Card style={{ marginBottom: '16px' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/deals')}>
              Назад
            </Button>
            <div>
              <Title level={3} style={{ margin: 0 }}>{deal.title}</Title>
              <Space>
                <Tag color={statusInfo.color}>{statusInfo.icon} {statusInfo.label}</Tag>
                {deal.amount > 0 && (
                  <Text strong style={{ fontSize: 16 }}>
                    <DollarOutlined /> {deal.amount.toLocaleString('ru-RU')} {deal.currency || 'RUB'}
                  </Text>
                )}
              </Space>
            </div>
          </Space>
          <Button icon={<EditOutlined />} onClick={() => setIsEditModalVisible(true)}>
            Редактировать
          </Button>
        </Space>
      </Card>

      <div style={{ display: 'flex', flex: 1, gap: '16px', overflow: 'hidden' }}>
        {/* Left Column - Deal Info */}
        <div style={{ width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Deal Details */}
          <Card title="Информация о сделке">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Статус">
                <Tag color={statusInfo.color}>{statusInfo.icon} {statusInfo.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Сумма">
                <Text strong>{deal.amount.toLocaleString('ru-RU') || 0} {deal.currency || 'RUB'}</Text>
              </Descriptions.Item>
              {deal.due_date && (
                <Descriptions.Item label="Крайний срок">
                  <CalendarOutlined /> {new Date(deal.due_date).toLocaleDateString('ru-RU')}
                </Descriptions.Item>
              )}
              {deal.source && (
                <Descriptions.Item label="Источник">
                  {deal.source}
                </Descriptions.Item>
              )}
              {deal.manager && (
                <Descriptions.Item label="Менеджер">
                  {deal.manager.name}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Создано">
                {new Date(deal.created_at).toLocaleString('ru-RU')}
              </Descriptions.Item>
              {deal.closed_date && (
                <Descriptions.Item label="Закрыто">
                  {new Date(deal.closed_date).toLocaleDateString('ru-RU')}
                </Descriptions.Item>
              )}
            </Descriptions>
            {deal.description && (
              <>
                <Divider />
                <div>
                  <Text strong>Описание:</Text>
                  <div style={{ marginTop: 8 }}>
                    <Text>{deal.description}</Text>
                  </div>
                </div>
              </>
            )}
          </Card>

          {/* Contact Info */}
          {deal.contact && (
            <Card 
              title="Контакт"
              extra={
                <Button 
                  type="link" 
                  onClick={() => navigate(`/contact/${deal.contact_id}`)}
                >
                  Открыть
                </Button>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <UserOutlined style={{ marginRight: '8px' }} />
                  <Text strong>{deal.contact.name}</Text>
                </div>
                {deal.contact.phone && (
                  <div>
                    <PhoneOutlined style={{ marginRight: '8px' }} />
                    <Text>{deal.contact.phone}</Text>
                  </div>
                )}
                {deal.contact.email && (
                  <div>
                    <MailOutlined style={{ marginRight: '8px' }} />
                    <Text>{deal.contact.email}</Text>
                  </div>
                )}
              </Space>
            </Card>
          )}

          {/* Notes */}
          <Card 
            title="Заметки"
            extra={
              <Button 
                type="link" 
                icon={<PlusOutlined />} 
                onClick={() => setIsNoteModalVisible(true)}
              >
                Добавить
              </Button>
            }
            style={{ flex: 1, overflow: 'auto' }}
          >
            {notes.length === 0 ? (
              <Empty description="Нет заметок" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List
                dataSource={notes}
                renderItem={(note) => (
                  <List.Item>
                    <div style={{ width: '100%' }}>
                      <div style={{ marginBottom: 4 }}>
                        <Tag color={NOTE_PRIORITIES[note.priority]?.color}>
                          {NOTE_PRIORITIES[note.priority]?.label}
                        </Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {new Date(note.created_at).toLocaleString('ru-RU')}
                        </Text>
                      </div>
                      <Text>{note.content}</Text>
                      {note.manager && (
                        <div style={{ marginTop: 4 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {note.manager.name}
                          </Text>
                        </div>
                      )}
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </div>

        {/* Right Column - Messages */}
        {deal.contact_id ? (
          <Card 
            style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
            title="Сообщения"
          >
            {/* Messages List */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              background: '#fafafa',
              borderRadius: '8px',
              marginBottom: '16px'
            }}>
              {messages.length === 0 ? (
                <Empty description="Нет сообщений" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <List
                  dataSource={messages}
                  renderItem={(msg) => (
                    <List.Item style={{
                      justifyContent: (msg.author_type || msg.sender_type) === 'manager' ? 'flex-end' : 'flex-start',
                      padding: '8px 0'
                    }}>
                      <div style={{
                        maxWidth: '70%',
                        display: 'flex',
                        flexDirection: (msg.author_type || msg.sender_type) === 'manager' ? 'row-reverse' : 'row',
                        alignItems: 'flex-start',
                        gap: '8px'
                      }}>
                        <Avatar
                          size="small"
                          icon={<UserOutlined />}
                          style={{
                            backgroundColor: (msg.author_type || msg.sender_type) === 'manager' ? '#1890ff' : '#87d068'
                          }}
                        />
                        <div style={{
                          background: (msg.author_type || msg.sender_type) === 'manager' ? '#1890ff' : '#f0f0f0',
                          color: (msg.author_type || msg.sender_type) === 'manager' ? 'white' : 'black',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          wordWrap: 'break-word'
                        }}>
                          {msg.content}
                          <div style={{
                            fontSize: '12px',
                            opacity: 0.7,
                            marginTop: '4px'
                          }}>
                            {new Date(msg['Created Date'] || msg.created_at || '').toLocaleTimeString('ru-RU', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                      </div>
                    </List.Item>
                  )}
                />
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <TextArea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Напишите сообщение..."
                autoSize={{ minRows: 2, maxRows: 4 }}
                style={{ flex: 1 }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleSendMessage}
                loading={sending}
                disabled={!newMessage.trim()}
              >
                Отправить
              </Button>
            </div>
          </Card>
        ) : (
          <Card style={{ flex: 1 }}>
            <Empty description="У сделки нет связанного контакта" />
          </Card>
        )}
      </div>

      {/* Edit Deal Modal */}
      <Modal
        title="Редактировать сделку"
        open={isEditModalVisible}
        onCancel={() => {
          setIsEditModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleUpdateDeal}>
          <Form.Item name="title" label="Название сделки" rules={[{ required: true }]}>
            <Input placeholder="Название сделки" />
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
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="status" label="Статус">
            <Select>
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

      {/* Create Note Modal */}
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

export default DealDetailPage;

