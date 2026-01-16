import React, { useState, useEffect } from 'react';
import {
  Typography,
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  message,

  Popconfirm,
  Row,
  Col,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { Automation, TRIGGER_TYPES, ACTION_TYPES } from '../types';
import { automationsAPI } from '../services/api';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const AutomationPage: React.FC = () => {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchAutomations();
  }, []);

  const fetchAutomations = async () => {
    setLoading(true);
    try {
      const { automations: fetched } = await automationsAPI.getAll();
      setAutomations(fetched);
    } catch (error) {
      console.error('Error fetching automations:', error);
      message.error('Ошибка загрузки автоматизаций');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingAutomation(null);
    form.resetFields();
    form.setFieldsValue({
      is_active: true,
      trigger_conditions: {},
      action_config: {},
    });
    setIsModalVisible(true);
  };

  const handleEdit = (automation: Automation) => {
    setEditingAutomation(automation);
    form.setFieldsValue(automation);
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await automationsAPI.delete(id);
      message.success('Автоматизация удалена');
      fetchAutomations();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка удаления');
    }
  };

  const handleToggleActive = async (automation: Automation) => {
    try {
      await automationsAPI.update(automation.id, { is_active: !automation.is_active });
      message.success(`Автоматизация ${!automation.is_active ? 'включена' : 'отключена'}`);
      fetchAutomations();
    } catch (error: any) {
      message.error('Ошибка обновления статуса');
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      // Преобразуем JSON строки в объекты, если нужно
      if (typeof values.trigger_conditions === 'string') {
        values.trigger_conditions = JSON.parse(values.trigger_conditions);
      }
      if (typeof values.action_config === 'string') {
        values.action_config = JSON.parse(values.action_config);
      }

      if (editingAutomation) {
        await automationsAPI.update(editingAutomation.id, values);
        message.success('Автоматизация обновлена');
      } else {
        await automationsAPI.create(values);
        message.success('Автоматизация создана');
      }
      setIsModalVisible(false);
      fetchAutomations();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка сохранения');
    }
  };

  const columns = [
    {
      title: 'Название',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Automation) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{name}</div>
          {record.description && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.description}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Триггер',
      dataIndex: 'trigger_type',
      key: 'trigger_type',
      render: (triggerType: string) => {
        const trigger = TRIGGER_TYPES[triggerType as keyof typeof TRIGGER_TYPES];
        return trigger ? (
          <Space>
            <span>{trigger.icon}</span>
            <span>{trigger.label}</span>
          </Space>
        ) : triggerType;
      },
    },
    {
      title: 'Действие',
      dataIndex: 'action_type',
      key: 'action_type',
      render: (actionType: string) => {
        const action = ACTION_TYPES[actionType as keyof typeof ACTION_TYPES];
        return action ? (
          <Space>
            <span>{action.icon}</span>
            <span>{action.label}</span>
          </Space>
        ) : actionType;
      },
    },
    {
      title: 'Статус',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean, record: Automation) => (
        <Switch
          checked={isActive}
          onChange={() => handleToggleActive(record)}
          checkedChildren="Вкл"
          unCheckedChildren="Выкл"
        />
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      render: (_: any, record: Automation) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            size="small"
          />
          <Popconfirm
            title="Удалить автоматизацию?"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button
              icon={<DeleteOutlined />}
              danger
              size="small"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2}>Автоматизация</Title>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            Создать автоматизацию
          </Button>
        </Col>
      </Row>

      <Card>
        <Table
          columns={columns}
          dataSource={automations}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `Всего: ${total} автоматизаций`,
          }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal
        title={editingAutomation ? 'Редактировать автоматизацию' : 'Создать автоматизацию'}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={handleSave}
        width={700}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Название" rules={[{ required: true }]}>
            <Input placeholder="Название автоматизации" />
          </Form.Item>

          <Form.Item name="description" label="Описание">
            <TextArea rows={2} placeholder="Описание автоматизации" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="trigger_type" label="Триггер" rules={[{ required: true }]}>
                <Select placeholder="Выберите триггер">
                  {Object.entries(TRIGGER_TYPES).map(([key, value]) => (
                    <Option key={key} value={key}>
                      {value.icon} {value.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="action_type" label="Действие" rules={[{ required: true }]}>
                <Select placeholder="Выберите действие">
                  {Object.entries(ACTION_TYPES).map(([key, value]) => (
                    <Option key={key} value={key}>
                      {value.icon} {value.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="trigger_conditions"
            label="Условия (JSON)"
            tooltip="Например: {'field': 'status', 'operator': 'equals', 'value': 'new'}"
          >
            <Input.TextArea
              rows={3}
              placeholder='{"field": "status", "operator": "equals", "value": "new"}'
            />
          </Form.Item>

          <Form.Item
            name="action_config"
            label="Конфигурация действия (JSON)"
            tooltip="Например: {'manager_id': 1} или {'tag_id': 5, 'content': 'Текст заметки'}"
          >
            <Input.TextArea
              rows={3}
              placeholder='{"manager_id": 1} или {"tag_id": 5}'
            />
          </Form.Item>

          <Form.Item name="is_active" valuePropName="checked" initialValue={true}>
            <Space>
              <Switch defaultChecked />
              <Text>Автоматизация активна</Text>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AutomationPage;
