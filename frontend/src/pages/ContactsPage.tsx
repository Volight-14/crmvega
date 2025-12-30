import React, { useState, useEffect } from 'react';
import {
  Typography,
  Input,
  Table,
  Space,
  Button,
  Avatar,
  Tag,
  Select,
  Card,
  Row,
  Col,
  Badge,
  Modal,
  Form,
  message,
} from 'antd';
import {
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Contact } from '../types';
import { contactsAPI } from '../services/api';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;
const { Option } = Select;

const ContactsPage: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const { contacts: fetchedContacts } = await contactsAPI.getAll({
        search: searchText || undefined,
        status: statusFilter || undefined,
        limit: 100,
      });
      setContacts(fetchedContacts);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      message.error('Ошибка загрузки контактов');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [searchText, statusFilter]);

  const handleCreate = () => {
    setEditingContact(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    form.setFieldsValue(contact);
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: 'Удалить контакт?',
      icon: <ExclamationCircleOutlined />,
      content: 'Это действие нельзя отменить.',
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: async () => {
        try {
          await contactsAPI.delete(id);
          message.success('Контакт удален');
          fetchContacts();
        } catch (error) {
          message.error('Ошибка удаления контакта');
        }
      },
    });
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editingContact) {
        await contactsAPI.update(editingContact.id, values);
        message.success('Контакт обновлен');
      } else {
        await contactsAPI.create(values);
        message.success('Контакт создан');
      }
      setIsModalVisible(false);
      form.resetFields();
      fetchContacts();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка сохранения контакта');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'inactive':
        return <CloseCircleOutlined style={{ color: '#8c8c8c' }} />;
      case 'needs_attention':
        return <ExclamationCircleOutlined style={{ color: '#faad14' }} />;
      default:
        return null;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return 'Активный';
      case 'inactive':
        return 'Неактивный';
      case 'needs_attention':
        return 'Требует внимания';
      default:
        return status;
    }
  };

  const columns: ColumnsType<Contact> = [
    {
      title: 'Контакт',
      key: 'contact',
      render: (_, record) => (
        <Space>
          <Avatar icon={<UserOutlined />} />
          <div>
            <div
              style={{ fontWeight: 'bold', cursor: 'pointer', color: '#1890ff' }}
              onClick={() => navigate(`/contact/${record.telegram_user_id || record.id}`)}
            >
              {record.name}
            </div>
            {record.company && (
              <div style={{ fontSize: '12px', color: '#666' }}>{record.company}</div>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: 'Контакты',
      key: 'contacts',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          {record.phone && (
            <div>
              <PhoneOutlined /> {record.phone}
            </div>
          )}
          {record.email && (
            <div>
              <MailOutlined /> {record.email}
            </div>
          )}
        </Space>
      ),
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Space>
          {getStatusIcon(status)}
          <span>{getStatusLabel(status)}</span>
        </Space>
      ),
    },
    {
      title: 'Теги',
      key: 'tags',
      render: (_, record) => (
        <Space>
          {record.tags?.slice(0, 3).map((tag) => (
            <Tag key={tag.id} color={tag.color}>
              {tag.name}
            </Tag>
          ))}
          {record.tags && record.tags.length > 3 && (
            <Tag>+{record.tags.length - 3}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Заявки',
      key: 'orders',
      render: (_, record) => (
        <div>
          <div>Всего: {record.orders_count || 0}</div>
          <div style={{ fontWeight: 'bold', color: '#1890ff' }}>
            {record.orders_total_amount?.toLocaleString('ru-RU') || 0} ₽
          </div>
        </div>
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Редактировать
          </Button>
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          >
            Удалить
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2}>Контакты</Title>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            Новый контакт
          </Button>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Space size="middle" style={{ width: '100%' }}>
          <Input
            placeholder="Поиск по имени, телефону, email..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
            allowClear
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="Фильтр по статусу"
            style={{ width: 200 }}
            allowClear
          >
            <Option value="active">Активные</Option>
            <Option value="inactive">Неактивные</Option>
            <Option value="needs_attention">Требуют внимания</Option>
          </Select>
        </Space>
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={contacts}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `Всего ${total} контактов`,
          }}
        />
      </Card>

      <Modal
        title={editingContact ? 'Редактировать контакт' : 'Новый контакт'}
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="Имя"
            rules={[{ required: true, message: 'Введите имя' }]}
          >
            <Input placeholder="Имя контакта" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="Телефон">
                <Input placeholder="+7 999 123-45-67" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="Email">
                <Input type="email" placeholder="email@example.com" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="company" label="Компания">
                <Input placeholder="Название компании" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="position" label="Должность">
                <Input placeholder="Должность" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="address" label="Адрес">
            <Input.TextArea placeholder="Адрес доставки" rows={2} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="birthday" label="Дата рождения">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="Статус">
                <Select>
                  <Option value="active">Активный</Option>
                  <Option value="inactive">Неактивный</Option>
                  <Option value="needs_attention">Требует внимания</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="comment" label="Комментарий">
            <Input.TextArea placeholder="Дополнительная информация" rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ContactsPage;
