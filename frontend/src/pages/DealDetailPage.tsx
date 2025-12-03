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
import { Deal, Note, DEAL_STATUSES, NOTE_PRIORITIES } from '../types';
import { dealsAPI, notesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import io from 'socket.io-client';
import DealChat from '../components/DealChat';

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
  const [loading, setLoading] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isNoteModalVisible, setIsNoteModalVisible] = useState(false);
  const [activeInfoTab, setActiveInfoTab] = useState<'info' | 'notes'>('info');
  const socketRef = useRef<Socket | null>(null);
  const [form] = Form.useForm();
  const [noteForm] = Form.useForm();

  useEffect(() => {
    if (id) {
      fetchDeal();
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
      socketRef.current?.emit('join_deal', id);
    });

    socketRef.current.on('deal_updated', (updatedDeal: Deal) => {
      if (updatedDeal.id === parseInt(id || '0')) {
        setDeal(updatedDeal);
      }
    });
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
          <Title level={4} style={{ margin: 0 }}>Загрузка сделки...</Title>
        </div>
      </div>
    );
  }

  const statusInfo = DEAL_STATUSES[deal.status] || DEAL_STATUSES.unsorted;

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
        padding: '16px 24px',
        color: 'white',
        boxShadow: '0 2px 8px rgba(102, 126, 234, 0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space size="middle">
            <Button 
              ghost 
              icon={<ArrowLeftOutlined />} 
              onClick={() => navigate('/deals')}
              style={{ border: '1px solid rgba(255,255,255,0.5)' }}
            >
              Назад
            </Button>
            <div>
              <Title level={3} style={{ margin: 0, color: 'white' }}>
                {deal.title}
              </Title>
              <Space style={{ marginTop: 4 }}>
                <Tag 
                  color={statusInfo.color}
                  style={{ 
                    borderRadius: 12, 
                    padding: '2px 12px',
                    fontSize: 13,
                  }}
                >
                  {statusInfo.icon} {statusInfo.label}
                </Tag>
                {deal.amount > 0 && (
                  <span style={{ 
                    background: 'rgba(255,255,255,0.2)', 
                    padding: '4px 12px', 
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 600,
                  }}>
                    <DollarOutlined /> {deal.amount.toLocaleString('ru-RU')} {deal.currency || 'RUB'}
                  </span>
                )}
              </Space>
            </div>
          </Space>
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
        </div>
      </div>

      {/* Main Content */}
      <div style={{ 
        display: 'flex', 
        flex: 1, 
        padding: 16, 
        gap: 16, 
        overflow: 'hidden',
        minHeight: 0,
      }}>
        {/* Left Sidebar - Deal Info */}
        <div style={{ 
          width: 320, 
          flexShrink: 0, 
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
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
                      {/* Deal Info */}
                      <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
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
                          <Divider style={{ margin: '12px 0' }} />
                          <div>
                            <Text strong style={{ fontSize: 13 }}>Описание:</Text>
                            <div style={{ marginTop: 8, color: '#595959' }}>
                              <Text>{deal.description}</Text>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Contact Card */}
                      {deal.contact && (
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
                                onClick={() => navigate(`/contact/${deal.contact_id}`)}
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
                                <Text strong>{deal.contact.name}</Text>
                              </div>
                              {deal.contact.phone && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#595959' }}>
                                  <PhoneOutlined />
                                  <Text copyable>{deal.contact.phone}</Text>
                                </div>
                              )}
                              {deal.contact.email && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#595959' }}>
                                  <MailOutlined />
                                  <Text copyable>{deal.contact.email}</Text>
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
        </div>

        {/* Right Side - Chat */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
        }}>
          {deal.contact_id || deal.lead_id ? (
            <DealChat 
              dealId={deal.id} 
              contactName={deal.contact?.name}
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
                description="У сделки нет связанного контакта" 
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </Card>
          )}
        </div>
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
        styles={{
          header: { borderRadius: '12px 12px 0 0' },
          body: { paddingTop: 24 },
        }}
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
                  <Option value="USDT">₮ USDT</Option>
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

export default DealDetailPage;
