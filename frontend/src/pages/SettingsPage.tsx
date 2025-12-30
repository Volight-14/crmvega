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
} from 'antd';
import {
  UserOutlined,
  BellOutlined,
  SettingOutlined,
  TeamOutlined,
  ApiOutlined,
  ExportOutlined,
  KeyOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { managersAPI } from '../services/api';
import { Manager } from '../types';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

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

  const notificationSettings = [
    { key: 'email_notifications', label: 'Email уведомления', default: true },
    { key: 'deal_updates', label: 'Обновления сделок', default: true },
    { key: 'new_messages', label: 'Новые сообщения', default: true },
    { key: 'contact_updates', label: 'Обновления контактов', default: false },
    { key: 'daily_report', label: 'Ежедневный отчет', default: false },
  ];

  return (
    <div>
      <Title level={2}>Настройки</Title>

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'profile',
              label: (
                <span>
                  <UserOutlined /> Профиль
                </span>
              ),
              children: (
                <div>
                  <Title level={4}>Личные данные</Title>
                  <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleUpdateProfile}
                    style={{ maxWidth: 500 }}
                  >
                    <Form.Item name="name" label="Имя" rules={[{ required: true }]}>
                      <Input prefix={<UserOutlined />} />
                    </Form.Item>
                    <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
                      <Input prefix={<UserOutlined />} disabled />
                    </Form.Item>
                    <Form.Item>
                      <Button type="primary" htmlType="submit" loading={loading}>
                        Сохранить изменения
                      </Button>
                    </Form.Item>
                  </Form>

                  <Divider />

                  <Title level={4}>Смена пароля</Title>
                  <Form
                    layout="vertical"
                    onFinish={handleChangePassword}
                    style={{ maxWidth: 500 }}
                  >
                    <Form.Item name="oldPassword" label="Текущий пароль" rules={[{ required: true }]}>
                      <Input.Password prefix={<KeyOutlined />} />
                    </Form.Item>
                    <Form.Item name="newPassword" label="Новый пароль" rules={[{ required: true, min: 6 }]}>
                      <Input.Password prefix={<KeyOutlined />} />
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
                      <Input.Password prefix={<KeyOutlined />} />
                    </Form.Item>
                    <Form.Item>
                      <Button type="primary" htmlType="submit" loading={loading}>
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
                  <BellOutlined /> Уведомления
                </span>
              ),
              children: (
                <div>
                  <Title level={4}>Настройки уведомлений</Title>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {notificationSettings.map((setting) => (
                      <Card key={setting.key} size="small">
                        <Row justify="space-between" align="middle">
                          <Col>
                            <Text>{setting.label}</Text>
                          </Col>
                          <Col>
                            <Switch defaultChecked={setting.default} />
                          </Col>
                        </Row>
                      </Card>
                    ))}
                  </Space>
                </div>
              ),
            },
            {
              key: 'system',
              label: (
                <span>
                  <SettingOutlined /> Система
                </span>
              ),
              children: (
                <div>
                  <Title level={4}>Системные настройки</Title>
                  <Descriptions column={1} bordered>
                    <Descriptions.Item label="Версия CRM">1.0.0</Descriptions.Item>
                    <Descriptions.Item label="База данных">PostgreSQL (Supabase)</Descriptions.Item>
                    <Descriptions.Item label="Последнее обновление">
                      {new Date().toLocaleDateString('ru-RU')}
                    </Descriptions.Item>
                  </Descriptions>

                  <Divider />

                  <Title level={4}>Интеграции</Title>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Card>
                      <Row justify="space-between" align="middle">
                        <Col>
                          <Space>
                            <ApiOutlined />
                            <div>
                              <div style={{ fontWeight: 'bold' }}>Telegram Bot</div>
                              <Text type="secondary">Интеграция с Telegram ботом</Text>
                            </div>
                          </Space>
                        </Col>
                        <Col>
                          <Tag color="green">Активна</Tag>
                        </Col>
                      </Row>
                    </Card>
                  </Space>
                </div>
              ),
            },
            {
              key: 'users',
              label: (
                <span>
                  <TeamOutlined /> Пользователи
                </span>
              ),
              children: (
                <div>
                  <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
                    <Title level={4} style={{ margin: 0 }}>Управление пользователями</Title>
                    {manager?.role === 'admin' && (
                      <Button type="primary" icon={<PlusOutlined />} onClick={handleAddUser}>
                        Добавить пользователя
                      </Button>
                    )}
                  </Space>

                  {manager?.role === 'admin' ? (
                    <Table
                      dataSource={managers}
                      rowKey="id"
                      loading={usersLoading}
                      columns={[
                        {
                          title: 'Имя',
                          dataIndex: 'name',
                          key: 'name',
                          render: (text, record) => (
                            <Space>
                              <UserOutlined />
                              {text}
                              {record.id === manager.id && <Tag color="blue">Вы</Tag>}
                            </Space>
                          )
                        },
                        {
                          title: 'Email',
                          dataIndex: 'email',
                          key: 'email',
                        },
                        {
                          title: 'Роль',
                          dataIndex: 'role',
                          key: 'role',
                          render: (role) => {
                            let color = 'geekblue';
                            let text = role;
                            if (role === 'admin') { color = 'red'; text = 'Администратор'; }
                            if (role === 'manager') { color = 'green'; text = 'Менеджер'; }
                            if (role === 'operator') { color = 'blue'; text = 'Оператор'; }
                            return <Tag color={color}>{text}</Tag>;
                          }
                        },
                        {
                          title: 'Дата создания',
                          dataIndex: 'created_at',
                          key: 'created_at',
                          render: (date) => new Date(date).toLocaleDateString('ru-RU')
                        },
                        {
                          title: 'Действия',
                          key: 'actions',
                          render: (_, record) => (
                            <Space size="middle">
                              <Space size="middle">
                                {record.id !== manager.id && (
                                  <Space>
                                    <Button
                                      type="link"
                                      icon={<EditOutlined />}
                                      onClick={() => handleEditUser(record)}
                                    >
                                      Изменить
                                    </Button>
                                    <Popconfirm
                                      title="Удалить пользователя?"
                                      description="Это действие нельзя отменить."
                                      onConfirm={() => handleDeleteUser(record.id)}
                                      okText="Да"
                                      cancelText="Нет"
                                    >
                                      <Button type="link" danger icon={<DeleteOutlined />}>
                                        Удалить
                                      </Button>
                                    </Popconfirm>
                                  </Space>
                                )}
                              </Space>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  ) : (
                    <Card>
                      <Result
                        status="403"
                        title="Доступ запрещен"
                        subTitle="У вас нет прав для просмотра этой страницы."
                      />
                    </Card>
                  )}

                  <Modal
                    title={editingManager ? "Редактирование пользователя" : "Новый пользователь"}
                    open={isUserModalVisible}
                    onCancel={() => {
                      setIsUserModalVisible(false);
                      setEditingManager(null);
                      userForm.resetFields();
                    }}
                    onOk={() => userForm.submit()}
                  >
                    <Form form={userForm} layout="vertical" onFinish={handleSaveUser}>
                      <Form.Item name="name" label="Имя" rules={[{ required: true }]}>
                        <Input prefix={<UserOutlined />} placeholder="Иван Иванов" />
                      </Form.Item>
                      <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
                        <Input prefix={<UserOutlined />} placeholder="ivan@example.com" disabled={!!editingManager} />
                      </Form.Item>
                      <Form.Item
                        name="password"
                        label={editingManager ? "Новый пароль (оставьте пустым, чтобы не менять)" : "Пароль"}
                        rules={[{ required: !editingManager, min: 6 }]}
                      >
                        <Input.Password prefix={<KeyOutlined />} placeholder={editingManager ? "Только если хотите сменить пароль" : "Минимум 6 символов"} />
                      </Form.Item>
                      <Form.Item name="role" label="Роль" rules={[{ required: true }]}>
                        <Select placeholder="Выберите роль">
                          <Option value="admin">Администратор</Option>
                          <Option value="manager">Менеджер</Option>
                          <Option value="operator">Оператор</Option>
                        </Select>
                      </Form.Item>
                    </Form>
                  </Modal>
                </div>
              ),
            },
            {
              key: 'export',
              label: (
                <span>
                  <ExportOutlined /> Экспорт данных
                </span>
              ),
              children: (
                <div>
                  <Title level={4}>Экспорт данных</Title>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Card>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Text>Экспорт данных в различных форматах</Text>
                        <Space>
                          <Button>Экспорт контактов (CSV)</Button>
                          <Button>Экспорт сделок (CSV)</Button>
                          <Button>Экспорт всех данных (JSON)</Button>
                        </Space>
                      </Space>
                    </Card>
                    <Card>
                      <Title level={5}>Импорт данных</Title>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Text type="secondary">Импорт данных из файла CSV или JSON</Text>
                        <Button>Выбрать файл для импорта</Button>
                      </Space>
                    </Card>
                  </Space>
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default SettingsPage;
