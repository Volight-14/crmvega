import React, { useState, useEffect, useRef } from 'react';
import { Table, Select, Tag, Button, Space, Avatar, Typography, Card, Badge } from 'antd';
import { MessageOutlined, UserOutlined, PhoneOutlined, MailOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { Lead, LEAD_STATUSES } from '../types';
import { leadsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const { Title } = Typography;
const { Option } = Select;

const Dashboard: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const navigate = useNavigate();
  const { manager } = useAuth();
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const { leads: fetchedLeads } = await leadsAPI.getAll({
        status: statusFilter || undefined,
        limit: 100
      });
      setLeads(fetchedLeads);
    } catch (error) {
      console.error('Error fetching leads:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [statusFilter]);

  useEffect(() => {
    if (!manager) return;

    // Настраиваем Socket.IO для real-time обновлений
    const socketUrl = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';
    console.log('Connecting to Socket.IO:', socketUrl);
    
    socketRef.current = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socketRef.current.on('connect', () => {
      console.log('✅ Connected to socket server');
      if (manager?.id) {
        socketRef.current?.emit('join_user', manager.id);
      }
    });

    socketRef.current.on('disconnect', (reason: string) => {
      console.log('❌ Disconnected from socket server:', reason);
    });

    socketRef.current.on('connect_error', (error: Error) => {
      console.error('❌ Socket.IO connection error:', error);
    });

    // Обработка новых заявок
    socketRef.current.on('new_lead', (newLead: Lead) => {
      console.log('📥 New lead received:', newLead);
      setLeads(prev => {
        // Проверяем, нет ли уже этой заявки
        if (prev.some(lead => lead.id === newLead.id)) {
          return prev;
        }
        // Применяем фильтр
        if (statusFilter && newLead.status !== statusFilter) {
          return prev;
        }
        return [newLead, ...prev];
      });
    });

    // Обработка обновления заявок
    socketRef.current.on('lead_updated', (updatedLead: Lead) => {
      console.log('📥 Lead updated:', updatedLead);
      setLeads(prev => prev.map(lead => 
        lead.id === updatedLead.id ? updatedLead : lead
      ));
    });

    return () => {
      console.log('Disconnecting Socket.IO');
      socketRef.current?.disconnect();
    };
  }, [manager, statusFilter]);

  const handleStatusChange = async (leadId: number, newStatus: Lead['status']) => {
    try {
      await leadsAPI.updateStatus(leadId, newStatus);
      fetchLeads(); // Перезагрузить список
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const columns = [
    {
      title: 'Клиент',
      dataIndex: 'name',
      key: 'name',
      render: (name: string | undefined, record: Lead) => (
        <Space>
          <Avatar icon={<UserOutlined />} />
          <div>
            <div style={{ fontWeight: 'bold' }}>{name || record.client || record.chat_id || `Чат #${record.id}`}</div>
            {record.phone && (
              <div style={{ fontSize: '12px', color: '#666' }}>
                <PhoneOutlined /> {record.phone}
              </div>
            )}
            {record.email && (
              <div style={{ fontSize: '12px', color: '#666' }}>
                <MailOutlined /> {record.email}
              </div>
            )}
            {record.chat_id && (
              <div style={{ fontSize: '12px', color: '#666' }}>
                Chat ID: {record.chat_id}
              </div>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: 'Источник',
      dataIndex: 'source',
      key: 'source',
      render: (source: string | undefined) => source || 'Не указан',
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: Lead) => {
        const statusInfo = status && LEAD_STATUSES[status as keyof typeof LEAD_STATUSES];
        return (
          <Select
            value={status || 'new'}
            style={{ width: 140 }}
            onChange={(value) => handleStatusChange(record.id, value as any)}
          >
            {Object.entries(LEAD_STATUSES).map(([key, info]) => (
              <Option key={key} value={key}>
                <Tag color={info.color}>{info.label}</Tag>
              </Option>
            ))}
          </Select>
        );
      },
    },
    {
      title: 'Менеджер',
      dataIndex: 'manager',
      key: 'manager',
      render: (manager: any) => manager?.name || 'Не назначен',
    },
    {
      title: 'Сообщения',
      dataIndex: 'messages',
      key: 'messages',
      render: (messages: any[]) => (
        <Badge count={messages?.[0]?.count || 0}>
          <MessageOutlined style={{ fontSize: '18px' }} />
        </Badge>
      ),
    },
    {
      title: 'Дата создания',
      dataIndex: 'Created Date',
      key: 'Created Date',
      render: (date: string, record: Lead) => new Date(date || record.created_at || '').toLocaleDateString('ru-RU'),
    },
    {
      title: 'Действия',
      key: 'actions',
      render: (_: any, record: Lead) => (
        <Button
          type="primary"
          onClick={() => navigate(`/lead/${record.id}`)}
        >
          Открыть
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>CRM Система</Title>

      <Card style={{ marginBottom: '16px' }}>
        <Space>
          <span>Фильтр по статусу:</span>
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 200 }}
            allowClear
          >
            <Option value="">Все статусы</Option>
            {Object.entries(LEAD_STATUSES).map(([key, info]) => (
              <Option key={key} value={key}>
                {info.label}
              </Option>
            ))}
          </Select>
          <Button onClick={fetchLeads} loading={loading}>
            Обновить
          </Button>
        </Space>
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={leads}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} из ${total} заявок`,
          }}
        />
      </Card>
    </div>
  );
};

export default Dashboard;
