import React, { useState, useEffect } from 'react';
import {
  Typography,
  Card,
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  InputNumber,
  message,
  Popconfirm,
  Tooltip,
  Alert,
  Collapse,
  Row,
  Col,
  Spin,
  Empty,
  Divider,
  Statistic,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  LockOutlined,
  StarOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  EyeOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { aiAPI } from '../services/api';
import { 
  AIInstruction, 
  InstructionLevel, 
  INSTRUCTION_LEVELS,
  INSTRUCTION_LEVEL_COLORS,
  INSTRUCTION_LEVEL_ICONS
} from '../types';
import { useAuth } from '../contexts/AuthContext';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const { Panel } = Collapse;

// Иконки для уровней
const LevelIcon: React.FC<{ level: InstructionLevel }> = ({ level }) => {
  const icons: Record<InstructionLevel, React.ReactNode> = {
    1: <LockOutlined style={{ color: '#ff4d4f' }} />,
    2: <StarOutlined style={{ color: '#fa8c16' }} />,
    3: <FileTextOutlined style={{ color: '#1890ff' }} />,
  };
  return <>{icons[level]}</>;
};

const AIInstructionsTab: React.FC = () => {
  const { manager } = useAuth();
  const [loading, setLoading] = useState(false);
  const [instructions, setInstructions] = useState<AIInstruction[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [userRole, setUserRole] = useState<string>('operator');
  const [modalVisible, setModalVisible] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState<AIInstruction | null>(null);
  const [promptPreview, setPromptPreview] = useState<{ text: string; counts: any } | null>(null);
  const [filterLevel, setFilterLevel] = useState<InstructionLevel | undefined>();
  const [filterActive, setFilterActive] = useState<boolean | undefined>();
  const [form] = Form.useForm();

  useEffect(() => {
    loadData();
  }, [filterLevel, filterActive]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [instructionsRes, categoriesRes] = await Promise.all([
        aiAPI.getInstructions({ 
          level: filterLevel, 
          is_active: filterActive 
        }),
        aiAPI.getInstructionCategories(),
      ]);
      setInstructions(instructionsRes.instructions);
      setUserRole(instructionsRes.user_role);
      setCategories(categoriesRes.categories);
    } catch (error: any) {
      message.error('Ошибка загрузки инструкций');
    } finally {
      setLoading(false);
    }
  };

  const loadPromptPreview = async () => {
    try {
      const data = await aiAPI.getInstructionsForPrompt();
      setPromptPreview({ text: data.prompt_text, counts: data.counts });
      setPreviewVisible(true);
    } catch (error) {
      message.error('Ошибка загрузки превью');
    }
  };

  const handleSave = async (values: any) => {
    try {
      if (editingInstruction) {
        await aiAPI.updateInstruction(editingInstruction.id, values);
        message.success('Инструкция обновлена');
      } else {
        await aiAPI.createInstruction(values);
        message.success('Инструкция создана');
      }
      setModalVisible(false);
      form.resetFields();
      setEditingInstruction(null);
      loadData();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка сохранения');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await aiAPI.deleteInstruction(id);
      message.success('Инструкция удалена');
      loadData();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка удаления');
    }
  };

  const handleToggleActive = async (instruction: AIInstruction) => {
    try {
      await aiAPI.updateInstruction(instruction.id, { is_active: !instruction.is_active });
      message.success(instruction.is_active ? 'Инструкция деактивирована' : 'Инструкция активирована');
      loadData();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка');
    }
  };

  const openModal = (instruction?: AIInstruction) => {
    setEditingInstruction(instruction || null);
    if (instruction) {
      form.setFieldsValue(instruction);
    } else {
      form.resetFields();
      form.setFieldsValue({ level: 3, is_active: true, sort_order: 0 });
    }
    setModalVisible(true);
  };

  const canCreate = (level: InstructionLevel) => {
    if (userRole === 'admin') return true;
    return level === 3;
  };

  const isAdmin = userRole === 'admin';

  // Группируем инструкции по уровням
  const groupedInstructions = {
    1: instructions.filter(i => i.level === 1),
    2: instructions.filter(i => i.level === 2),
    3: instructions.filter(i => i.level === 3),
  };

  const columns = [
    {
      title: 'Статус',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (active: boolean, record: AIInstruction) => (
        <Tooltip title={record.can_edit ? (active ? 'Деактивировать' : 'Активировать') : 'Нет прав'}>
          <Switch
            checked={active}
            size="small"
            disabled={!record.can_edit}
            onChange={() => handleToggleActive(record)}
          />
        </Tooltip>
      ),
    },
    {
      title: 'Название',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: AIInstruction) => (
        <Space>
          <LevelIcon level={record.level} />
          <Text strong={record.is_active} type={record.is_active ? undefined : 'secondary'}>
            {title}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Уровень',
      dataIndex: 'level',
      key: 'level',
      width: 140,
      render: (level: InstructionLevel) => (
        <Tag color={INSTRUCTION_LEVEL_COLORS[level]}>
          {INSTRUCTION_LEVEL_ICONS[level]} {INSTRUCTION_LEVELS[level].label}
        </Tag>
      ),
    },
    {
      title: 'Категория',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (cat: string) => cat ? <Tag>{cat}</Tag> : '-',
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 120,
      render: (_: any, record: AIInstruction) => (
        <Space>
          {record.can_edit && (
            <Tooltip title="Редактировать">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => openModal(record)}
              />
            </Tooltip>
          )}
          {record.can_delete && (
            <Popconfirm
              title="Удалить инструкцию?"
              description="Это действие нельзя отменить"
              onConfirm={() => handleDelete(record.id)}
              okText="Удалить"
              cancelText="Отмена"
            >
              <Tooltip title="Удалить">
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
          {!record.can_edit && !record.can_delete && (
            <Tooltip title="Только просмотр">
              <LockOutlined style={{ color: '#999' }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Заголовок и описание */}
      <Alert
        message="Иерархия инструкций AI"
        description={
          <div>
            <p style={{ margin: '8px 0' }}>
              Инструкции применяются к AI в порядке приоритета. Более высокий уровень не может быть переопределён низшим.
            </p>
            <Space wrap>
              <Tag color="red"><LockOutlined /> Законы — неизменяемые правила (только админ)</Tag>
              <Tag color="orange"><StarOutlined /> Приоритетные — важные инструкции (только админ)</Tag>
              <Tag color="blue"><FileTextOutlined /> Обычные — тонкая настройка (все сотрудники)</Tag>
            </Space>
          </div>
        }
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      {/* Панель действий */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={() => openModal()}
            >
              Добавить инструкцию
            </Button>
            <Button 
              icon={<EyeOutlined />} 
              onClick={loadPromptPreview}
            >
              Превью промпта
            </Button>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={loadData}
            >
              Обновить
            </Button>
          </Space>
        </Col>
        <Col flex="auto" />
        <Col>
          <Space>
            <Select
              placeholder="Уровень"
              allowClear
              style={{ width: 150 }}
              value={filterLevel}
              onChange={setFilterLevel}
            >
              <Option value={1}><LockOutlined /> Законы</Option>
              <Option value={2}><StarOutlined /> Приоритетные</Option>
              <Option value={3}><FileTextOutlined /> Обычные</Option>
            </Select>
            <Select
              placeholder="Статус"
              allowClear
              style={{ width: 120 }}
              value={filterActive}
              onChange={setFilterActive}
            >
              <Option value={true}><CheckCircleOutlined /> Активные</Option>
              <Option value={false}><StopOutlined /> Неактивные</Option>
            </Select>
          </Space>
        </Col>
      </Row>

      {/* Таблица с группировкой */}
      {loading ? (
        <Spin tip="Загрузка..." />
      ) : instructions.length === 0 ? (
        <Empty description="Нет инструкций" />
      ) : (
        <Collapse defaultActiveKey={['1', '2', '3']}>
          {/* Законы */}
          <Panel 
            key="1" 
            header={
              <Space>
                <LockOutlined style={{ color: '#ff4d4f' }} />
                <Text strong>Законы AI ({groupedInstructions[1].length})</Text>
                <Text type="secondary">— неизменяемые правила, нарушать запрещено</Text>
              </Space>
            }
          >
            {groupedInstructions[1].length > 0 ? (
              <Table
                dataSource={groupedInstructions[1]}
                columns={columns}
                rowKey="id"
                pagination={false}
                size="small"
                expandable={{
                  expandedRowRender: (record) => (
                    <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {record.content}
                    </Paragraph>
                  ),
                }}
              />
            ) : (
              <Empty description="Нет законов" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Panel>

          {/* Приоритетные */}
          <Panel 
            key="2" 
            header={
              <Space>
                <StarOutlined style={{ color: '#fa8c16' }} />
                <Text strong>Приоритетные инструкции ({groupedInstructions[2].length})</Text>
                <Text type="secondary">— важные инструкции от администрации</Text>
              </Space>
            }
          >
            {groupedInstructions[2].length > 0 ? (
              <Table
                dataSource={groupedInstructions[2]}
                columns={columns}
                rowKey="id"
                pagination={false}
                size="small"
                expandable={{
                  expandedRowRender: (record) => (
                    <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {record.content}
                    </Paragraph>
                  ),
                }}
              />
            ) : (
              <Empty description="Нет приоритетных инструкций" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Panel>

          {/* Обычные */}
          <Panel 
            key="3" 
            header={
              <Space>
                <FileTextOutlined style={{ color: '#1890ff' }} />
                <Text strong>Обычные инструкции ({groupedInstructions[3].length})</Text>
                <Text type="secondary">— дополнительные инструкции для тонкой настройки</Text>
              </Space>
            }
          >
            {groupedInstructions[3].length > 0 ? (
              <Table
                dataSource={groupedInstructions[3]}
                columns={columns}
                rowKey="id"
                pagination={{ pageSize: 10 }}
                size="small"
                expandable={{
                  expandedRowRender: (record) => (
                    <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {record.content}
                    </Paragraph>
                  ),
                }}
              />
            ) : (
              <Empty description="Нет обычных инструкций" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Panel>
        </Collapse>
      )}

      {/* Модальное окно создания/редактирования */}
      <Modal
        title={
          <Space>
            {editingInstruction ? <EditOutlined /> : <PlusOutlined />}
            {editingInstruction ? 'Редактирование инструкции' : 'Новая инструкция'}
          </Space>
        }
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingInstruction(null);
          form.resetFields();
        }}
        footer={null}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item
            name="level"
            label="Уровень инструкции"
            rules={[{ required: true }]}
            extra={
              <Text type="secondary">
                {form.getFieldValue('level') === 1 && 'Законы нельзя нарушать. Только администратор может создавать и редактировать.'}
                {form.getFieldValue('level') === 2 && 'Приоритетные инструкции. Только администратор может создавать и редактировать.'}
                {form.getFieldValue('level') === 3 && 'Обычные инструкции. Все сотрудники могут создавать.'}
              </Text>
            }
          >
            <Select 
              disabled={!!editingInstruction}
              onChange={() => form.validateFields(['level'])}
            >
              <Option value={1} disabled={!isAdmin}>
                <Space>
                  <LockOutlined style={{ color: '#ff4d4f' }} />
                  Закон — неизменяемое правило
                  {!isAdmin && <Tag>Только админ</Tag>}
                </Space>
              </Option>
              <Option value={2} disabled={!isAdmin}>
                <Space>
                  <StarOutlined style={{ color: '#fa8c16' }} />
                  Приоритетная — важная инструкция
                  {!isAdmin && <Tag>Только админ</Tag>}
                </Space>
              </Option>
              <Option value={3}>
                <Space>
                  <FileTextOutlined style={{ color: '#1890ff' }} />
                  Обычная — дополнительная инструкция
                </Space>
              </Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="title"
            label="Название"
            rules={[{ required: true, message: 'Введите название' }]}
          >
            <Input placeholder="Краткое название инструкции" maxLength={255} />
          </Form.Item>

          <Form.Item
            name="content"
            label="Содержимое инструкции"
            rules={[{ required: true, message: 'Введите содержимое' }]}
            extra="Опишите правило или инструкцию для AI. Будьте конкретны и однозначны."
          >
            <TextArea
              rows={6}
              placeholder="Подробное описание правила или инструкции..."
              showCount
              maxLength={2000}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="category" label="Категория">
                <Select
                  allowClear
                  placeholder="Выберите или введите"
                  mode="tags"
                  maxCount={1}
                >
                  {categories.map(cat => (
                    <Option key={cat} value={cat}>{cat}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="sort_order" label="Порядок">
                <InputNumber min={0} max={999} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="is_active" label="Активна" valuePropName="checked">
                <Switch checkedChildren="Да" unCheckedChildren="Нет" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingInstruction ? 'Сохранить' : 'Создать'}
              </Button>
              <Button onClick={() => {
                setModalVisible(false);
                setEditingInstruction(null);
                form.resetFields();
              }}>
                Отмена
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Модальное окно превью промпта */}
      <Modal
        title={<Space><EyeOutlined /> Превью промпта для AI</Space>}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={<Button onClick={() => setPreviewVisible(false)}>Закрыть</Button>}
        width={800}
      >
        {promptPreview && (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>
                <Card size="small">
                  <Statistic 
                    title="Законов" 
                    value={promptPreview.counts.laws} 
                    prefix={<LockOutlined style={{ color: '#ff4d4f' }} />}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic 
                    title="Приоритетных" 
                    value={promptPreview.counts.priority}
                    prefix={<StarOutlined style={{ color: '#fa8c16' }} />}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic 
                    title="Обычных" 
                    value={promptPreview.counts.normal}
                    prefix={<FileTextOutlined style={{ color: '#1890ff' }} />}
                  />
                </Card>
              </Col>
            </Row>
            <Card 
              title="Текст инструкций для системного промпта" 
              size="small"
              style={{ maxHeight: 400, overflow: 'auto' }}
            >
              <pre style={{ 
                whiteSpace: 'pre-wrap', 
                fontFamily: 'monospace',
                fontSize: 12,
                margin: 0,
                background: '#f5f5f5',
                padding: 12,
                borderRadius: 4
              }}>
                {promptPreview.text || '(нет активных инструкций)'}
              </pre>
            </Card>
          </>
        )}
      </Modal>
    </div>
  );
};

export default AIInstructionsTab;

