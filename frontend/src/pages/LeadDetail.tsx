import React, { useState, useEffect, useRef } from 'react';
import { Card, Typography, Space, Tag, Button, Input, Avatar, Divider, List, message } from 'antd';
import { ArrowLeftOutlined, SendOutlined, UserOutlined, PhoneOutlined, MailOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import io, { Socket } from 'socket.io-client';
import { Lead, Message, LEAD_STATUSES } from '../types';
import { leadsAPI, messagesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const { Title, Text } = Typography;
const { TextArea } = Input;

const LeadDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { manager } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (id) {
      fetchLead();
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
    const socketUrl = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';
    socketRef.current = io(socketUrl);

    socketRef.current.on('connect', () => {
      console.log('Connected to socket server');
      socketRef.current?.emit('join_user', manager?.id);
    });

    socketRef.current.on('new_message', (message: Message) => {
      setMessages(prev => [...prev, message]);
    });

    socketRef.current.on('message_error', (error: any) => {
      message.error(error.error);
    });
  };

  const fetchLead = async () => {
    if (!id) return;
    try {
      const leadData = await leadsAPI.getById(parseInt(id));
      setLead(leadData);
    } catch (error) {
      console.error('Error fetching lead:', error);
    }
  };

  const fetchMessages = async () => {
    if (!id) return;
    try {
      const messagesData = await messagesAPI.getByLeadId(parseInt(id));
      setMessages(messagesData);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !id || !manager) return;

    setSending(true);
    try {
      await messagesAPI.send({
        lead_id: parseInt(id),
        content: newMessage.trim()
      });

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!lead) {
    return <div>Загрузка...</div>;
  }

  const statusInfo = LEAD_STATUSES[lead.status];

  return (
    <div style={{ padding: '24px', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Card style={{ marginBottom: '16px' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')}>
              Назад
            </Button>
            <div>
              <Title level={3} style={{ margin: 0 }}>{lead.name}</Title>
              <Space>
                <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
                {lead.source && <Text type="secondary">Источник: {lead.source}</Text>}
              </Space>
            </div>
          </Space>
        </Space>
      </Card>

      <div style={{ display: 'flex', flex: 1, gap: '16px' }}>
        {/* Lead Info */}
        <Card style={{ width: '300px', flexShrink: 0 }}>
          <Title level={4}>Информация о клиенте</Title>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <UserOutlined style={{ marginRight: '8px' }} />
              <Text strong>Имя:</Text> {lead.name}
            </div>
            {lead.phone && (
              <div>
                <PhoneOutlined style={{ marginRight: '8px' }} />
                <Text strong>Телефон:</Text> {lead.phone}
              </div>
            )}
            {lead.email && (
              <div>
                <MailOutlined style={{ marginRight: '8px' }} />
                <Text strong>Email:</Text> {lead.email}
              </div>
            )}
            {lead.description && (
              <div>
                <Text strong>Описание:</Text>
                <br />
                <Text>{lead.description}</Text>
              </div>
            )}
            <Divider />
            <div>
              <Text strong>Создано:</Text> {new Date(lead.created_at).toLocaleString('ru-RU')}
            </div>
            <div>
              <Text strong>Менеджер:</Text> {lead.manager?.name || 'Не назначен'}
            </div>
          </Space>
        </Card>

        {/* Messages */}
        <Card style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Title level={4}>Чат</Title>

          {/* Messages List */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            background: '#fafafa',
            borderRadius: '8px',
            marginBottom: '16px'
          }}>
            <List
              dataSource={messages}
              renderItem={(msg) => (
                <List.Item style={{
                  justifyContent: msg.sender_type === 'manager' ? 'flex-end' : 'flex-start',
                  padding: '8px 0'
                }}>
                  <div style={{
                    maxWidth: '70%',
                    display: 'flex',
                    flexDirection: msg.sender_type === 'manager' ? 'row-reverse' : 'row',
                    alignItems: 'flex-start',
                    gap: '8px'
                  }}>
                    <Avatar
                      size="small"
                      icon={<UserOutlined />}
                      style={{
                        backgroundColor: msg.sender_type === 'manager' ? '#1890ff' : '#87d068'
                      }}
                    />
                    <div style={{
                      background: msg.sender_type === 'manager' ? '#1890ff' : '#f0f0f0',
                      color: msg.sender_type === 'manager' ? 'white' : 'black',
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
                        {new Date(msg.created_at).toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                  </div>
                </List.Item>
              )}
            />
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <TextArea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Введите сообщение..."
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
      </div>
    </div>
  );
};

export default LeadDetail;
