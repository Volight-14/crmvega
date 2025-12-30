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
  Slider,
  InputNumber,
  message,
  Row,
  Col,
  Table,
  Modal,
  Popconfirm,
  Tag,
  Statistic,
  Spin,
  Empty,
  Tooltip,
  Collapse,
  Badge,
  Alert,
} from 'antd';
import {
  RobotOutlined,
  TeamOutlined,
  BookOutlined,
  FileTextOutlined,
  GlobalOutlined,
  BarChartOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SendOutlined,
  ThunderboltOutlined,
  CopyOutlined,
  SafetyOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import AIInstructionsTab from './AIInstructionsTab';
import PromptAnalyticsDashboard from './PromptAnalyticsDashboard';
import { aiAPI } from '../services/api';
import {
  AISettings,
  OperatorStyle,
  KnowledgeArticle,
  AnswerScript,
  WebsiteContent,
  AISuggestion,
  AIAnalytics,
  AIModel,
} from '../types';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const { Panel } = Collapse;

// Подкомпонент: Настройки модели
const ModelSettings: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Partial<AISettings>>({});
  const [models, setModels] = useState<AIModel[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [settingsRes, modelsRes] = await Promise.all([
        aiAPI.getSettings(),
        aiAPI.getModels(),
      ]);
      setSettings(settingsRes.settings);
      setModels(modelsRes.models);
      form.setFieldsValue(settingsRes.settings);
    } catch (error: any) {
      message.error('Ошибка загрузки настроек');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      await aiAPI.updateSettingsBatch(values);
      message.success('Настройки сохранены');
      setSettings(values);
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spin tip="Загрузка настроек..." />;

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSave}
      initialValues={settings}
    >
      <Row gutter={[24, 24]}>
        <Col xs={24} md={12}>
          <Form.Item
            name="model"
            label="Модель AI"
            rules={[{ required: true }]}
          >
            <Select
              showSearch
              placeholder="Выберите модель"
              optionFilterProp="children"
            >
              {models.map((m) => (
                <Option key={m.id} value={m.id}>
                  <Space>
                    {m.name}
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      ({m.provider})
                    </Text>
                    {m.recommended && <Tag color="green">Рекомендуется</Tag>}
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Form.Item
            name="temperature"
            label={
              <Tooltip title="Креативность ответов: 0 = точные, 1 = креативные">
                Температура
              </Tooltip>
            }
          >
            <Slider min={0} max={1} step={0.1} marks={{ 0: '0', 0.5: '0.5', 1: '1' }} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Form.Item name="max_tokens" label="Макс. токенов">
            <InputNumber min={100} max={4096} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item
        name="system_prompt"
        label="Системный промпт"
        rules={[{ required: true }]}
      >
        <TextArea
          rows={6}
          placeholder="Инструкции для AI агента..."
          showCount
          maxLength={4000}
        />
      </Form.Item>

      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12}>
          <Form.Item
            name="auto_suggestions_enabled"
            label="Автоматические подсказки"
            valuePropName="checked"
          >
            <Switch checkedChildren="Вкл" unCheckedChildren="Выкл" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="min_delay_seconds" label="Минимальная задержка (сек)">
            <InputNumber min={1} max={60} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={saving} icon={<CheckCircleOutlined />}>
            Сохранить настройки
          </Button>
          <Button onClick={loadData} icon={<ReloadOutlined />}>
            Сбросить
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
};

// Подкомпонент: Управление операторами
const OperatorsManagement: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [operators, setOperators] = useState<OperatorStyle[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingOperator, setEditingOperator] = useState<OperatorStyle | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadOperators();
  }, []);

  const loadOperators = async () => {
    setLoading(true);
    try {
      const { operators } = await aiAPI.getOperators();
      setOperators(operators);
    } catch (error) {
      message.error('Ошибка загрузки операторов');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values: any) => {
    try {
      const styleData = {
        summary: values.summary,
        tone: values.tone,
        patterns: values.patterns,
        phrases: values.phrases,
      };

      if (editingOperator) {
        await aiAPI.updateOperator(editingOperator.id, {
          operator_name: values.operator_name,
          telegram_user_id: values.telegram_user_id,
          role: values.role,
          style_data: styleData,
        });
        message.success('Оператор обновлён');
      } else {
        await aiAPI.createOperator({
          operator_name: values.operator_name,
          telegram_user_id: values.telegram_user_id,
          role: values.role,
          style_data: styleData,
        });
        message.success('Оператор создан');
      }
      setModalVisible(false);
      form.resetFields();
      loadOperators();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка сохранения');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await aiAPI.deleteOperator(id);
      message.success('Оператор удалён');
      loadOperators();
    } catch (error) {
      message.error('Ошибка удаления');
    }
  };

  const openModal = (operator?: OperatorStyle) => {
    setEditingOperator(operator || null);
    if (operator) {
      form.setFieldsValue({
        operator_name: operator.operator_name,
        telegram_user_id: operator.telegram_user_id,
        role: operator.role,
        summary: operator.style_data?.summary,
        tone: operator.style_data?.tone,
        patterns: operator.style_data?.patterns,
        phrases: operator.style_data?.phrases,
      });
    } else {
      form.resetFields();
    }
    setModalVisible(true);
  };

  const columns = [
    {
      title: 'Имя',
      dataIndex: 'operator_name',
      key: 'operator_name',
    },
    {
      title: 'Telegram ID',
      dataIndex: 'telegram_user_id',
      key: 'telegram_user_id',
      render: (id: number) => id ? <Tag>{id}</Tag> : '-',
    },
    {
      title: 'Роль',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'Manager' ? 'blue' : 'green'}>{role}</Tag>
      ),
    },
    {
      title: 'Тон общения',
      key: 'tone',
      render: (_: any, record: OperatorStyle) => (
        <Text ellipsis style={{ maxWidth: 200 }}>
          {record.style_data?.tone || '-'}
        </Text>
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      render: (_: any, record: OperatorStyle) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => openModal(record)}
          />
          <Popconfirm
            title="Удалить оператора?"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
          Добавить оператора
        </Button>
      </div>

      <Table
        dataSource={operators}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingOperator ? 'Редактирование оператора' : 'Новый оператор'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="operator_name"
                label="Имя оператора"
                rules={[{ required: true }]}
              >
                <Input placeholder="Иван Иванов" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="telegram_user_id" label="Telegram User ID">
                <InputNumber placeholder="123456789" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="role" label="Роль" initialValue="Operator">
            <Select>
              <Option value="Operator">Оператор</Option>
              <Option value="Manager">Менеджер</Option>
              <Option value="Senior">Старший оператор</Option>
            </Select>
          </Form.Item>

          <Title level={5}>Стиль общения</Title>

          <Form.Item name="summary" label="Описание стиля">
            <TextArea rows={2} placeholder="Краткое описание стиля общения" />
          </Form.Item>

          <Form.Item name="tone" label="Тон общения">
            <Input placeholder="Дружелюбный, профессиональный, вежливый" />
          </Form.Item>

          <Form.Item name="patterns" label="Паттерны">
            <TextArea rows={2} placeholder="Использует эмодзи, короткие предложения" />
          </Form.Item>

          <Form.Item name="phrases" label="Типичные фразы">
            <TextArea rows={2} placeholder="Добрый день!, Рад помочь!, Хорошего дня!" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingOperator ? 'Сохранить' : 'Создать'}
              </Button>
              <Button onClick={() => setModalVisible(false)}>Отмена</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

// Подкомпонент: База знаний
const KnowledgeBase: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>();
  const [searchText, setSearchText] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingArticle, setEditingArticle] = useState<KnowledgeArticle | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadData();
  }, [selectedCategory, searchText]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [articlesRes, categoriesRes] = await Promise.all([
        aiAPI.getKnowledge({ category: selectedCategory, search: searchText }),
        aiAPI.getKnowledgeCategories(),
      ]);
      setArticles(articlesRes.articles);
      setCategories(categoriesRes.categories);
    } catch (error) {
      message.error('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values: any) => {
    try {
      if (editingArticle) {
        await aiAPI.updateKnowledgeArticle(editingArticle.id, values);
        message.success('Статья обновлена');
      } else {
        await aiAPI.createKnowledgeArticle(values);
        message.success('Статья создана');
      }
      setModalVisible(false);
      form.resetFields();
      loadData();
    } catch (error) {
      message.error('Ошибка сохранения');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await aiAPI.deleteKnowledgeArticle(id);
      message.success('Статья удалена');
      loadData();
    } catch (error) {
      message.error('Ошибка удаления');
    }
  };

  const openModal = (article?: KnowledgeArticle) => {
    setEditingArticle(article || null);
    if (article) {
      form.setFieldsValue(article);
    } else {
      form.resetFields();
    }
    setModalVisible(true);
  };

  const columns = [
    {
      title: 'Заголовок',
      dataIndex: 'title',
      key: 'title',
      render: (title: string) => <Text strong>{title || '-'}</Text>,
    },
    {
      title: 'Категория',
      dataIndex: 'category',
      key: 'category',
      render: (cat: string) => cat ? <Tag color="blue">{cat}</Tag> : '-',
    },
    {
      title: 'Приоритет',
      dataIndex: 'priority',
      key: 'priority',
      render: (p: string) => {
        const colors: Record<string, string> = { High: 'red', Normal: 'blue', Low: 'default' };
        return p ? <Tag color={colors[p] || 'default'}>{p}</Tag> : '-';
      },
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => (
        <Badge status={s === 'Active' ? 'success' : 'default'} text={s || '-'} />
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      render: (_: any, record: KnowledgeArticle) => (
        <Space>
          <Button type="text" icon={<EditOutlined />} onClick={() => openModal(record)} />
          <Popconfirm title="Удалить?" onConfirm={() => handleDelete(record.id)}>
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            Добавить статью
          </Button>
        </Col>
        <Col flex="auto">
          <Input.Search
            placeholder="Поиск..."
            onSearch={setSearchText}
            allowClear
            style={{ maxWidth: 300 }}
          />
        </Col>
        <Col>
          <Select
            placeholder="Категория"
            allowClear
            style={{ width: 200 }}
            onChange={setSelectedCategory}
            value={selectedCategory}
          >
            {categories.map((c) => (
              <Option key={c} value={c}>{c}</Option>
            ))}
          </Select>
        </Col>
      </Row>

      <Table
        dataSource={articles}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        expandable={{
          expandedRowRender: (record) => (
            <Paragraph style={{ margin: 0 }}>
              {record.content || 'Нет содержимого'}
            </Paragraph>
          ),
        }}
      />

      <Modal
        title={editingArticle ? 'Редактирование статьи' : 'Новая статья'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="title" label="Заголовок" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="category" label="Категория">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="priority" label="Приоритет" initialValue="Normal">
                <Select>
                  <Option value="High">Высокий</Option>
                  <Option value="Normal">Обычный</Option>
                  <Option value="Low">Низкий</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="Статус" initialValue="Active">
                <Select>
                  <Option value="Active">Активный</Option>
                  <Option value="Draft">Черновик</Option>
                  <Option value="Archived">Архив</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="content" label="Содержимое" rules={[{ required: true }]}>
            <TextArea rows={8} />
          </Form.Item>
          <Form.Item name="tags" label="Теги">
            <Input placeholder="тег1, тег2, тег3" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingArticle ? 'Сохранить' : 'Создать'}
              </Button>
              <Button onClick={() => setModalVisible(false)}>Отмена</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

// Подкомпонент: Скрипты ответов
const AnswerScripts: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [scripts, setScripts] = useState<AnswerScript[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingScript, setEditingScript] = useState<AnswerScript | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadScripts();
  }, []);

  const loadScripts = async () => {
    setLoading(true);
    try {
      const { scripts } = await aiAPI.getScripts();
      setScripts(scripts);
    } catch (error) {
      message.error('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values: any) => {
    try {
      if (editingScript) {
        await aiAPI.updateScript(editingScript.id, values);
        message.success('Скрипт обновлён');
      } else {
        await aiAPI.createScript(values);
        message.success('Скрипт создан');
      }
      setModalVisible(false);
      form.resetFields();
      loadScripts();
    } catch (error) {
      message.error('Ошибка сохранения');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await aiAPI.deleteScript(id);
      message.success('Скрипт удалён');
      loadScripts();
    } catch (error) {
      message.error('Ошибка удаления');
    }
  };

  const openModal = (script?: AnswerScript) => {
    setEditingScript(script || null);
    if (script) {
      form.setFieldsValue(script);
    } else {
      form.resetFields();
    }
    setModalVisible(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('Скопировано');
  };

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
          Добавить скрипт
        </Button>
      </div>

      <Collapse>
        {scripts.map((script) => (
          <Panel
            key={script.id}
            header={
              <Space>
                <Tag>{script.question_number || '-'}</Tag>
                <Text strong ellipsis style={{ maxWidth: 600 }}>
                  {script.question || 'Без вопроса'}
                </Text>
              </Space>
            }
            extra={
              <Space onClick={(e) => e.stopPropagation()}>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => copyToClipboard(script.answer || '')}
                />
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openModal(script)}
                />
                <Popconfirm title="Удалить?" onConfirm={() => handleDelete(script.id)}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            }
          >
            <Paragraph>
              <Text strong>Ответ:</Text>
              <br />
              {script.answer || '-'}
            </Paragraph>
            {script.note && (
              <Paragraph type="secondary">
                <Text strong>Примечание:</Text> {script.note}
              </Paragraph>
            )}
          </Panel>
        ))}
      </Collapse>

      {scripts.length === 0 && !loading && <Empty description="Нет скриптов" />}

      <Modal
        title={editingScript ? 'Редактирование скрипта' : 'Новый скрипт'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="question_number" label="Номер вопроса">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="question" label="Вопрос" rules={[{ required: true }]}>
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item name="answer" label="Ответ" rules={[{ required: true }]}>
            <TextArea rows={5} />
          </Form.Item>
          <Form.Item name="note" label="Примечание">
            <Input />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingScript ? 'Сохранить' : 'Создать'}
              </Button>
              <Button onClick={() => setModalVisible(false)}>Отмена</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

// Подкомпонент: Контент сайта
const WebsiteContentManager: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<WebsiteContent[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingContent, setEditingContent] = useState<WebsiteContent | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [contentRes, sectionsRes] = await Promise.all([
        aiAPI.getWebsiteContent(),
        aiAPI.getWebsiteSections(),
      ]);
      setContent(contentRes.content);
      setSections(sectionsRes.sections);
    } catch (error) {
      message.error('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values: any) => {
    try {
      if (editingContent) {
        await aiAPI.updateWebsiteContent(editingContent.id, values);
        message.success('Контент обновлён');
      } else {
        await aiAPI.createWebsiteContent(values);
        message.success('Контент создан');
      }
      setModalVisible(false);
      form.resetFields();
      loadData();
    } catch (error) {
      message.error('Ошибка сохранения');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await aiAPI.deleteWebsiteContent(id);
      message.success('Удалено');
      loadData();
    } catch (error) {
      message.error('Ошибка удаления');
    }
  };

  const openModal = (item?: WebsiteContent) => {
    setEditingContent(item || null);
    if (item) {
      form.setFieldsValue(item);
    } else {
      form.resetFields();
    }
    setModalVisible(true);
  };

  const columns = [
    { title: 'Заголовок', dataIndex: 'title', key: 'title' },
    {
      title: 'Секция',
      dataIndex: 'section',
      key: 'section',
      render: (s: string) => s ? <Tag>{s}</Tag> : '-',
    },
    {
      title: 'Действия',
      key: 'actions',
      render: (_: any, record: WebsiteContent) => (
        <Space>
          <Button type="text" icon={<EditOutlined />} onClick={() => openModal(record)} />
          <Popconfirm title="Удалить?" onConfirm={() => handleDelete(record.id)}>
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
          Добавить контент
        </Button>
      </div>

      <Table
        dataSource={content}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        expandable={{
          expandedRowRender: (record) => (
            <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {record.content || 'Нет содержимого'}
            </Paragraph>
          ),
        }}
      />

      <Modal
        title={editingContent ? 'Редактирование' : 'Новый контент'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="title" label="Заголовок" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="section" label="Секция">
            <Select allowClear>
              {sections.map((s) => (
                <Option key={s} value={s}>{s}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="content" label="Содержимое" rules={[{ required: true }]}>
            <TextArea rows={10} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingContent ? 'Сохранить' : 'Создать'}
              </Button>
              <Button onClick={() => setModalVisible(false)}>Отмена</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

// Подкомпонент: Аналитика
const AIAnalyticsPanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState<AIAnalytics | null>(null);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [analyticsRes, suggestionsRes] = await Promise.all([
        aiAPI.getAnalytics(),
        aiAPI.getSuggestions({ limit: 10 }),
      ]);
      setAnalytics(analyticsRes);
      setSuggestions(suggestionsRes.suggestions);
    } catch (error) {
      message.error('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Spin tip="Загрузка аналитики..." />;
  if (!analytics) return <Empty description="Нет данных" />;

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Всего подсказок" value={analytics.total} prefix={<RobotOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Отправлено в Telegram"
              value={analytics.sent}
              prefix={<SendOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Положительный фидбек"
              value={analytics.feedbackStats.good}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Отрицательный фидбек"
              value={analytics.feedbackStats.bad}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Последние подсказки" extra={<Button onClick={loadData} icon={<ReloadOutlined />} />}>
        <Table
          dataSource={suggestions}
          rowKey="id"
          pagination={false}
          size="small"
          columns={[
            {
              title: 'Сообщение клиента',
              dataIndex: 'client_message',
              key: 'client_message',
              render: (text: string) => (
                <Text ellipsis style={{ maxWidth: 300 }}>{text}</Text>
              ),
            },
            {
              title: 'Подсказка AI',
              dataIndex: 'suggested_response',
              key: 'suggested_response',
              render: (text: string) => (
                <Text ellipsis style={{ maxWidth: 300 }}>{text}</Text>
              ),
            },
            {
              title: 'Фидбек',
              dataIndex: 'feedback',
              key: 'feedback',
              render: (f: string) => {
                if (!f) return <Tag>Нет</Tag>;
                const colors: Record<string, string> = { good: 'green', bad: 'red', edited: 'orange' };
                return <Tag color={colors[f] || 'default'}>{f}</Tag>;
              },
            },
            {
              title: 'Дата',
              dataIndex: 'created_at',
              key: 'created_at',
              render: (date: string) => new Date(date).toLocaleString('ru-RU'),
            },
          ]}
        />
      </Card>
    </>
  );
};

// Подкомпонент: Тестирование AI
const AITesting: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [operators, setOperators] = useState<OperatorStyle[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    loadOperators();
  }, []);

  const loadOperators = async () => {
    try {
      const { operators } = await aiAPI.getOperators();
      setOperators(operators);
    } catch (error) {
      console.error('Error loading operators:', error);
    }
  };

  const handleTest = async (values: any) => {
    setLoading(true);
    setResult(null);
    try {
      const response = await aiAPI.testSuggestion({
        client_message: values.client_message,
        operator_id: values.operator_id,
      });
      setResult(response);
      message.success('Подсказка сгенерирована');
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка генерации');
      setResult({ error: error.response?.data?.error || error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} md={12}>
        <Card title="Тестовый запрос">
          <Form form={form} layout="vertical" onFinish={handleTest}>
            <Form.Item name="operator_id" label="Оператор (опционально)">
              <Select allowClear placeholder="Выберите оператора для стиля">
                {operators.map((op) => (
                  <Option key={op.id} value={op.telegram_user_id}>
                    {op.operator_name} ({op.role})
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="client_message"
              label="Сообщение клиента"
              rules={[{ required: true, message: 'Введите сообщение' }]}
            >
              <TextArea
                rows={4}
                placeholder="Здравствуйте, у меня вопрос по услугам..."
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                icon={<ThunderboltOutlined />}
                block
              >
                Сгенерировать подсказку
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </Col>

      <Col xs={24} md={12}>
        <Card title="Результат">
          {loading && <Spin tip="Генерация..." />}

          {result && !result.error && (
            <Space direction="vertical" style={{ width: '100%' }}>
              {result.suggested_response && (
                <Alert
                  message="Сгенерированный ответ"
                  description={result.suggested_response}
                  type="success"
                  showIcon
                />
              )}
              {result.context_summary && (
                <Alert
                  message="Контекст"
                  description={result.context_summary}
                  type="info"
                  showIcon
                />
              )}
              {result.qc_issues && Object.keys(result.qc_issues).length > 0 && (
                <Alert
                  message="QC Issues"
                  description={JSON.stringify(result.qc_issues, null, 2)}
                  type="warning"
                  showIcon
                />
              )}
            </Space>
          )}

          {result?.error && (
            <Alert message="Ошибка" description={result.error} type="error" showIcon />
          )}

          {!loading && !result && (
            <Empty description="Введите сообщение и нажмите 'Сгенерировать'" />
          )}
        </Card>
      </Col>
    </Row>
  );
};

// Главный компонент
const AISettingsTab: React.FC = () => {
  return (
    <div>
      <Title level={4}>
        <RobotOutlined /> VEGA AI Agent
      </Title>
      <Text type="secondary" style={{ marginBottom: 16, display: 'block' }}>
        Настройка AI-помощника для генерации подсказок операторам
      </Text>

      <Tabs
        defaultActiveKey="instructions"
        type="card"
        items={[
          {
            key: 'instructions',
            label: (
              <span>
                <SafetyOutlined /> Инструкции
              </span>
            ),
            children: <AIInstructionsTab />,
          },
          {
            key: 'model',
            label: (
              <span>
                <RobotOutlined /> Модель
              </span>
            ),
            children: <ModelSettings />,
          },
          {
            key: 'operators',
            label: (
              <span>
                <TeamOutlined /> Операторы
              </span>
            ),
            children: <OperatorsManagement />,
          },
          {
            key: 'knowledge',
            label: (
              <span>
                <BookOutlined /> База знаний
              </span>
            ),
            children: <KnowledgeBase />,
          },
          {
            key: 'scripts',
            label: (
              <span>
                <FileTextOutlined /> Скрипты
              </span>
            ),
            children: <AnswerScripts />,
          },
          {
            key: 'website',
            label: (
              <span>
                <GlobalOutlined /> Контент сайта
              </span>
            ),
            children: <WebsiteContentManager />,
          },
          {
            key: 'analytics',
            label: (
              <span>
                <BarChartOutlined /> Аналитика
              </span>
            ),
            children: <AIAnalyticsPanel />,
          },
          {
            key: 'prompt-analytics',
            label: (
              <span>
                <LineChartOutlined /> Качество подсказок
              </span>
            ),
            children: <PromptAnalyticsDashboard />,
          },
          {
            key: 'testing',
            label: (
              <span>
                <PlayCircleOutlined /> Тестирование
              </span>
            ),
            children: <AITesting />,
          },
        ]}
      />
    </div>
  );
};

export default AISettingsTab;

