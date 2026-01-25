import React, { useState, useEffect } from 'react';
import {
  Typography,
  Card,
  Tabs,
  Form,
  Input,
  Button,
  Space,
  Switch,
  Select,
  Divider,
  message,
  Row,
  Col,
  Descriptions,
  Tag,
  Table,
  Modal,
  Popconfirm,
  Result,
  Grid
} from 'antd';
import {
  UserOutlined,
  BellOutlined,
  SettingOutlined,
  TeamOutlined,
  ApiOutlined,
  KeyOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { managersAPI } from '../services/api';
import { Manager, ORDER_STATUSES } from '../types';

const { Title, Text } = Typography;
const { Option } = Select;

import TemplatesSettings from './settings/TemplatesSettings';

const SettingsPage: React.FC = () => {
  const { manager } = useAuth();
  const [form] = Form.useForm();
  const [userForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  // State for Users Management
  const [managers, setManagers] = useState<Manager[]>([]);
  const [isUserModalVisible, setIsUserModalVisible] = useState(false);

  const [usersLoading, setUsersLoading] = useState(false);
  const [editingManager, setEditingManager] = useState<Manager | null>(null);

  useEffect(() => {
    if (manager) {
      form.setFieldsValue({
        name: manager.name,
        email: manager.email,
      });
    }
  }, [manager, form]);

  const handleUpdateProfile = async (values: any) => {
    setLoading(true);
    try {
      // TODO: API для обновления профиля
      message.success('Профиль обновлен');
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка обновления профиля');
    } finally {
      setLoading(false);
    }
  };

  const fetchManagers = async () => {
    if (manager?.role !== 'admin') return;
    setUsersLoading(true);
    try {
      const data = await managersAPI.getAll();
      setManagers(data);
    } catch (error) {
      console.error('Error fetching managers:', error);
      // message.error('Ошибка загрузки пользователей');
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'users' && manager?.role === 'admin') {
      fetchManagers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, manager]);

  const handleSaveUser = async (values: any) => {
    setUsersLoading(true);
    try {
      if (editingManager) {
        await managersAPI.update(editingManager.id, values);
        message.success('Пользователь обновлен');
      } else {
        await managersAPI.create(values);
        message.success('Пользователь создан');
      }
      setIsUserModalVisible(false);
      userForm.resetFields();
      setEditingManager(null);
      fetchManagers();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка сохранения пользователя');
    } finally {
      setUsersLoading(false);
    }
  };

  const handleEditUser = (record: Manager) => {
    setEditingManager(record);
    userForm.setFieldsValue({
      name: record.name,
      email: record.email,
      role: record.role,
      password: '', // Reset password field
    });
    setIsUserModalVisible(true);
  };

  const handleAddUser = () => {
    setEditingManager(null);
    userForm.resetFields();
    setIsUserModalVisible(true);
  };

  const handleDeleteUser = async (id: number) => {
    try {
      await managersAPI.delete(id);
      message.success('Пользователь удален');
      fetchManagers();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка удаления пользователя');
    }
  };



  const handleChangePassword = async (values: any) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('Пароли не совпадают');
      return;
    }

    setLoading(true);
    try {
      // TODO: API для смены пароля
      message.success('Пароль изменен');
      form.resetFields(['oldPassword', 'newPassword', 'confirmPassword']);
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка смены пароля');
    } finally {
      setLoading(false);
    }
  };

  // Notifications State
  const [notificationSettings, setNotificationSettings] = useState({
    all_active: true,
    contact_updates: false,
    daily_report: false,
    statuses: [] as string[]
  });

  useEffect(() => {
    if (manager?.id) {
      const stored = localStorage.getItem(`crm_notification_settings_${manager.id}`);
      if (stored) {
        try {
          setNotificationSettings(JSON.parse(stored));
        } catch (e) {
          console.error("Failed to parse settings", e);
        }
      }
    }
  }, [manager]);

  const handleNotificationChange = async (key: string, value: any) => {
    const newSettings = { ...notificationSettings, [key]: value };
    setNotificationSettings(newSettings);

    if (manager?.id) {
      localStorage.setItem(`crm_notification_settings_${manager.id}`, JSON.stringify(newSettings));

      try {
        await managersAPI.updateNotificationSettings(newSettings);
      } catch (error) {
        console.error('Failed to save notification settings to backend', error);
      }
    }
  };

  // ... imports and previous code ...

  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  // Better:
  /*
     const screens = Grid.useBreakpoint();
     const isMobile = !screens.md;
  */

  // Let's rewrite the render to use a simplified mobile view.

  const renderContent = () => (
    <Tabs
      activeKey={activeTab}
      onChange={setActiveTab}
      tabPosition={isMobile ? 'top' : 'left'} // Mobile: Top tabs (scrollable), Desktop: Left tabs
      destroyInactiveTabPane
      items={[
        {
          key: 'profile',
          label: (
            <span>
              <UserOutlined /> {!isMobile && 'Профиль'}
            </span>
          ),
          children: (
            <div style={{ padding: isMobile ? 0 : '0 24px' }}>
              <Title level={4} style={{ fontSize: isMobile ? 18 : 20 }}>Личные данные</Title>
              <Form
                form={form}
                layout="vertical"
                onFinish={handleUpdateProfile}
                style={{ maxWidth: 500 }}
              >
                <Form.Item name="name" label="Имя" rules={[{ required: true }]}>
                  <Input prefix={<UserOutlined />} size="large" />
                </Form.Item>
                <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
                  <Input prefix={<UserOutlined />} disabled size="large" />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={loading} block={isMobile} size="large">
                    Сохранить
                  </Button>
                </Form.Item>
              </Form>

              <Divider />

              <Title level={4} style={{ fontSize: isMobile ? 18 : 20 }}>Смена пароля</Title>
              <Form
                layout="vertical"
                onFinish={handleChangePassword}
                style={{ maxWidth: 500 }}
              >
                <Form.Item name="oldPassword" label="Текущий пароль" rules={[{ required: true }]}>
                  <Input.Password prefix={<KeyOutlined />} size="large" />
                </Form.Item>
                <Form.Item name="newPassword" label="Новый пароль" rules={[{ required: true, min: 6 }]}>
                  <Input.Password prefix={<KeyOutlined />} size="large" />
                </Form.Item>
                <Form.Item
                  name="confirmPassword"
                  label="Подтвердите пароль"
                  rules={[
                    { required: true },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('newPassword') === value) {
                          return Promise.resolve();
                        }
                        return Promise.reject(new Error('Пароли не совпадают'));
                      },
                    }),
                  ]}
                >
                  <Input.Password prefix={<KeyOutlined />} size="large" />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={loading} block={isMobile} size="large">
                    Изменить пароль
                  </Button>
                </Form.Item>
              </Form>
            </div>
          ),
        },
        {
          key: 'notifications',
          label: (
            <span>
              <BellOutlined /> {!isMobile && 'Уведомления'}
            </span>
          ),
          children: (
            <div style={{ padding: isMobile ? 0 : '0 24px' }}>
              <Title level={4} style={{ fontSize: isMobile ? 18 : 20 }}>Уведомления</Title>
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Card size="small" bordered={false} style={{ background: '#f5f5f5' }}>
                  <Row justify="space-between" align="middle">
                    <Col span={20}>
                      <Text strong>Все уведомления</Text>
                      <div style={{ fontSize: 12, color: '#666' }}>Звук и пуш для всех входящих</div>
                    </Col>
                    <Col>
                      <Switch
                        checked={notificationSettings.all_active}
                        onChange={(checked) => handleNotificationChange('all_active', checked)}
                      />
                    </Col>
                  </Row>
                </Card>

                <Card size="small" bordered={false} style={{ background: '#f5f5f5', opacity: notificationSettings.all_active ? 0.5 : 1, pointerEvents: notificationSettings.all_active ? 'none' : 'auto' }}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Text strong>Фильтр по этапам</Text>
                    <Select
                      mode="multiple"
                      style={{ width: '100%' }}
                      placeholder="Выберите статусы..."
                      value={notificationSettings.statuses}
                      onChange={(vals) => handleNotificationChange('statuses', vals)}
                      options={Object.entries(ORDER_STATUSES).map(([key, val]) => ({
                        label: `${val.icon} ${val.label}`,
                        value: key
                      }))}
                      disabled={notificationSettings.all_active}
                    />
                  </Space>
                </Card>

                <Card size="small" bordered={false} style={{ background: '#f5f5f5' }}>
                  <Row justify="space-between" align="middle">
                    <Col>
                      <Text strong>Обновления контактов</Text>
                    </Col>
                    <Col>
                      <Switch
                        checked={notificationSettings.contact_updates}
                        onChange={(checked) => handleNotificationChange('contact_updates', checked)}
                      />
                    </Col>
                  </Row>
                </Card>
                {/* More settings if needed */}
              </Space>
            </div>
          ),
        },
        {
          key: 'system',
          label: (
            <span>
              <SettingOutlined /> {!isMobile && 'Система'}
            </span>
          ),
          children: (
            <div style={{ padding: isMobile ? 0 : '0 24px' }}>
              <Title level={4} style={{ fontSize: isMobile ? 18 : 20 }}>Система</Title>
              <Card bordered={false} style={{ background: '#f9f9f9', marginBottom: 16 }}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Версия">1.0.0</Descriptions.Item>
                  <Descriptions.Item label="БД">Supabase</Descriptions.Item>
                  <Descriptions.Item label="Обновлено">{new Date().toLocaleDateString('ru-RU')}</Descriptions.Item>
                </Descriptions>
              </Card>

              <Title level={5}>Интеграции</Title>
              <Card size="small" style={{ marginBottom: 16 }}>
                <Row justify="space-between" align="middle">
                  <Col>
                    <Space>
                      <ApiOutlined style={{ fontSize: 20, color: '#1890ff' }} />
                      <div>
                        <div style={{ fontWeight: 600 }}>Telegram Bot</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>Активен</Text>
                      </div>
                    </Space>
                  </Col>
                  <Col>
                    <Switch checked disabled />
                  </Col>
                </Row>
              </Card>
            </div>
          ),
        },
        {
          key: 'users',
          label: (
            <span>
              <TeamOutlined /> {!isMobile && 'Пользователи'}
            </span>
          ),
          children: (
            <div style={{ padding: isMobile ? 0 : '0 24px' }}>
              {/* ... (Users content slightly optimized) ... */}
              <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
                <Title level={4} style={{ margin: 0, fontSize: isMobile ? 18 : 20 }}>Пользователи</Title>
                {manager?.role === 'admin' && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleAddUser} size={isMobile ? 'middle' : 'large'}>
                    {!isMobile && 'Добавить'}
                  </Button>
                )}
              </Space>
              {/* Keeping Table for desktop, maybe List for mobile if needed, but Table is scrollable horizontally so OK for now */}
              {manager?.role === 'admin' ? (
                <Table
                  dataSource={managers}
                  rowKey="id"
                  loading={usersLoading}
                  pagination={{ simple: isMobile }}
                  columns={[
                    { title: 'Имя', dataIndex: 'name', key: 'name', render: (t, r) => <span>{t} {r.id === manager.id && <Tag color="blue">Вы</Tag>}</span> },
                    { title: 'Роль', dataIndex: 'role', key: 'role', render: r => <Tag>{r}</Tag>, responsive: ['md'] },
                    {
                      title: '', key: 'actions', render: (_, r) => r.id !== manager.id && (
                        <Space>
                          <Button type="text" icon={<EditOutlined />} onClick={() => handleEditUser(r)} />
                          <Popconfirm
                            title="Удалить?"
                            onConfirm={() => handleDeleteUser(r.id)}
                            okText="Да"
                            cancelText="Нет"
                          >
                            <Button type="text" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      )
                    }
                  ]}
                />
              ) : <Result status="403" title="Нет доступа" />}
            </div>
          )
        },
        {
          key: 'templates',
          label: (
            <span>
              <FileTextOutlined /> {!isMobile && 'Шаблоны'}
            </span>
          ),
          children: <TemplatesSettings />
        }
        // ... other tabs ...
      ]}
    />
  );


  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Mobile Header */}
      {isMobile ? (
        <div style={{ padding: '16px 16px 0', background: '#fff' }}>
          <Title level={2} style={{ margin: 0 }}>Настройки</Title>
        </div>
      ) : (
        <Title level={2}>Настройки</Title>
      )}

      <div style={{ flex: 1, overflow: 'hidden', padding: isMobile ? 0 : 24 }}>
        {/* Card Wrapper for Desktop, direct content for Mobile to save space */}
        {isMobile ? (
          <div style={{ background: '#fff', height: '100%', overflowY: 'auto' }}>
            {renderContent()}
          </div>
        ) : (
          <Card style={{ height: '100%' }} bodyStyle={{ height: '100%', overflowY: 'auto' }}>
            {renderContent()}
          </Card>
        )}
      </div>
      {/* Modals remain the same */}
      <Modal
        title={editingManager ? "Редактирование" : "Новый пользователь"}
        open={isUserModalVisible}
        onCancel={() => { setIsUserModalVisible(false); setEditingManager(null); userForm.resetFields(); }}
        onOk={() => userForm.submit()}
        centered
      >
        {/* Form Content */}
        <Form form={userForm} layout="vertical" onFinish={handleSaveUser}>
          <Form.Item name="name" label="Имя" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}><Input disabled={!!editingManager} /></Form.Item>
          <Form.Item name="password" label="Пароль"><Input.Password placeholder="Если хотите изменить" /></Form.Item>
          <Form.Item name="role" label="Роль" rules={[{ required: true }]}>
            <Select>
              <Option value="admin">Администратор</Option>
              <Option value="manager">Менеджер</Option>
              <Option value="operator">Оператор</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SettingsPage;
