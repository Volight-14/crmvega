import React, { useState, useEffect } from 'react';
import {
    Table,
    Button,
    Modal,
    Form,
    Input,
    message,
    Space,
    Popconfirm,
    Upload,
    Typography,
    Mentions,
    Select,
    Card,
    Row,
    Col,
    Empty
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    FileImageOutlined,
    SearchOutlined,
    LinkOutlined,
    ThunderboltOutlined,
    MinusCircleOutlined
} from '@ant-design/icons';
import { templatesAPI, uploadAPI } from '../../services/api';
import { WebsiteContent } from '../../types';

const { Option } = Select;
const { Text } = Typography;

interface TemplateButton {
    text: string;
    type: 'quick_reply' | 'url';
    url?: string;
}

interface TemplateContent {
    text?: string;
    attachments?: Array<{ type: 'image' | 'file'; url: string; name?: string }>;
    buttons?: TemplateButton[];
}

const ORDER_VARIABLES = [
    'Клиент отдает',
    'Отдает в валюте',
    'Отправляет из банка',
    'Город РФ где отдает',
    'Сеть с какой отправляет USDT',
    'Оплата сейчас или при встрече?',
    'Клиент получает'
];

const parseContent = (content?: string): TemplateContent => {
    if (!content) return { text: '' };
    try {
        const parsed = JSON.parse(content);
        // Simple check if it looks like our schema
        if (parsed && (parsed.text !== undefined || parsed.attachments !== undefined || parsed.buttons !== undefined)) {
            return parsed;
        }
        return { text: content };
    } catch (e) {
        return { text: content };
    }
};

const TemplatesSettings: React.FC = () => {
    const [templates, setTemplates] = useState<WebsiteContent[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<WebsiteContent | null>(null);
    const [searchText, setSearchText] = useState('');
    const [form] = Form.useForm();

    const filteredTemplates = templates
        .filter(t => t.title?.toLowerCase().includes(searchText.toLowerCase()))
        .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    // Upload state
    const [fileList, setFileList] = useState<any[]>([]);
    const [uploading, setUploading] = useState(false);

    const fetchTemplates = async () => {
        setLoading(true);
        try {
            const data = await templatesAPI.getAll();
            setTemplates(data);
        } catch (error) {
            console.error(error);
            message.error('Failed to load templates');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTemplates();
    }, []);

    const handleSave = async (values: any) => {
        const { title, text, buttons } = values;

        // Prepare content
        const attachments = fileList.map(f => ({
            type: 'image' as const, // assuming images for now
            url: f.url || f.response?.url,
            name: f.name
        })).filter(a => a.url);

        const contentObj: TemplateContent = {
            text,
            attachments: attachments.length > 0 ? attachments : undefined,
            buttons: buttons && buttons.length > 0 ? buttons : undefined
        };

        const content = JSON.stringify(contentObj);

        try {
            if (editingTemplate) {
                await templatesAPI.update(editingTemplate.id, { title, content });
                message.success('Шаблон обновлен');
            } else {
                await templatesAPI.create({ title, content });
                message.success('Шаблон создан');
            }
            setIsModalVisible(false);
            form.resetFields();
            setFileList([]);
            setEditingTemplate(null);
            fetchTemplates();
        } catch (error) {
            message.error('Ошибка сохранения шаблона');
        }
    };

    const handleEdit = (record: WebsiteContent) => {
        setEditingTemplate(record);
        const parsed = parseContent(record.content);

        form.setFieldsValue({
            title: record.title,
            text: parsed.text,
            buttons: parsed.buttons || []
        });

        if (parsed.attachments) {
            setFileList(parsed.attachments.map((a, i) => ({
                uid: `-${i}`,
                name: a.name || 'Image',
                status: 'done',
                url: a.url,
            })));
        } else {
            setFileList([]);
        }

        setIsModalVisible(true);
    };

    const handleDelete = async (id: number) => {
        try {
            await templatesAPI.delete(id);
            message.success('Шаблон удален');
            fetchTemplates();
        } catch (error) {
            message.error('Ошибка удаления');
        }
    };

    // Upload handlers
    const customRequest = async (options: any) => {
        const { file, onSuccess, onError } = options;
        setUploading(true);
        try {
            const result = await uploadAPI.uploadFile(file);
            onSuccess(result, file);
            message.success(`${file.name} загружен`);
        } catch (err: any) {
            onError(err);
            message.error(`${file.name} ошибка загрузки`);
        } finally {
            setUploading(false);
        }
    };

    const handleFileChange = ({ fileList }: any) => {
        const newFileList = fileList.map((file: any) => {
            if (file.response) {
                file.url = file.response.url;
            }
            return file;
        });
        setFileList(newFileList);
    };

    const columns = [
        {
            title: 'Название',
            dataIndex: 'title',
            key: 'title',
            width: '20%',
            sorter: (a: WebsiteContent, b: WebsiteContent) => (a.title || '').localeCompare(b.title || ''),
        },
        {
            title: 'Содержимое',
            dataIndex: 'content',
            key: 'content',
            render: (content: string) => {
                const parsed = parseContent(content);
                return (
                    <Space direction="vertical" style={{ width: '100%' }}>
                        {parsed.text && (
                            <Text ellipsis={{ tooltip: parsed.text }} style={{ maxWidth: 400 }}>
                                {parsed.text}
                            </Text>
                        )}
                        {parsed.attachments && parsed.attachments.map((att, i) => (
                            <Space key={`att-${i}`}>
                                <FileImageOutlined />
                                <Text type="secondary" style={{ fontSize: 12 }}>{att.name || 'Image'}</Text>
                            </Space>
                        ))}
                        {parsed.buttons && parsed.buttons.length > 0 && (
                            <Space wrap>
                                {parsed.buttons.map((btn, i) => (
                                    <Button size="small" key={`btn-${i}`} icon={btn.type === 'url' ? <LinkOutlined /> : <ThunderboltOutlined />}>
                                        {btn.text}
                                    </Button>
                                ))}
                            </Space>
                        )}
                    </Space>
                );
            }
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 150,
            render: (_: any, record: WebsiteContent) => (
                <Space>
                    <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    <Popconfirm title="Удалить шаблон?" onConfirm={() => handleDelete(record.id)}>
                        <Button danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    return (
        <div>
            <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
                <Text strong>Шаблоны сообщений</Text>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                    setEditingTemplate(null);
                    form.resetFields();
                    setFileList([]);
                    setIsModalVisible(true);
                }}>
                    Добавить шаблон
                </Button>
            </Space>

            <Input
                placeholder="Поиск по названию..."
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                style={{ marginBottom: 16, width: 300 }}
                allowClear
            />

            {window.innerWidth < 768 ? (
                <div style={{ paddingBottom: 20 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {filteredTemplates.map(item => {
                            const parsed = parseContent(item.content);
                            return (
                                <div key={item.id} style={{
                                    background: '#fff',
                                    borderRadius: 12,
                                    padding: 16,
                                    border: '1px solid #f0f0f0'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <Text strong style={{ fontSize: 16 }}>{item.title}</Text>
                                        <Space>
                                            <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(item)} />
                                            <Popconfirm title="Удалить?" onConfirm={() => handleDelete(item.id)}>
                                                <Button danger icon={<DeleteOutlined />} size="small" />
                                            </Popconfirm>
                                        </Space>
                                    </div>
                                    <div style={{ color: '#666' }}>
                                        {parsed.text && (
                                            <div style={{
                                                display: '-webkit-box',
                                                WebkitLineClamp: 3,
                                                WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden',
                                                marginBottom: 8
                                            }}>
                                                {parsed.text}
                                            </div>
                                        )}
                                        {parsed.attachments && parsed.attachments.length > 0 && (
                                            <div style={{ marginBottom: 8 }}>
                                                <FileImageOutlined /> {parsed.attachments.length} вложений
                                            </div>
                                        )}
                                        {parsed.buttons && parsed.buttons.length > 0 && (
                                            <Space wrap>
                                                {parsed.buttons.map((btn, i) => (
                                                    <Button size="small" key={i} icon={btn.type === 'url' ? <LinkOutlined /> : <ThunderboltOutlined />}>
                                                        {btn.text}
                                                    </Button>
                                                ))}
                                            </Space>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <Table
                    dataSource={filteredTemplates}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={{
                        defaultPageSize: 10,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        showTotal: (total, range) => `${range[0]}-${range[1]} из ${total} шаблонов`,
                    }}
                />
            )}

            <Modal
                title={editingTemplate ? "Редактировать шаблон" : "Новый шаблон"}
                open={isModalVisible}
                onCancel={() => setIsModalVisible(false)}
                onOk={() => form.submit()}
                confirmLoading={uploading}
                width={600}
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <Form.Item name="title" label="Название (триггер)" rules={[{ required: true, message: 'Введите название' }]}>
                        <Input placeholder="Например: Приветствие" />
                    </Form.Item>

                    <Form.Item name="text" label="Текст сообщения">
                        <Mentions
                            rows={4}
                            placeholder="Введите текст. Используйте [ для вставки переменных сделки."
                            prefix="["
                        >
                            {ORDER_VARIABLES.map(value => (
                                <Mentions.Option key={value} value={value}>
                                    {value}
                                </Mentions.Option>
                            ))}
                        </Mentions>
                    </Form.Item>

                    <Form.Item label="Вложения (Картинка)">
                        <Upload
                            customRequest={customRequest}
                            listType="picture-card"
                            fileList={fileList}
                            onChange={handleFileChange}
                            maxCount={1}
                            accept="image/*"
                        >
                            <div>
                                <PlusOutlined />
                                <div style={{ marginTop: 8 }}>Upload</div>
                            </div>
                        </Upload>
                    </Form.Item>

                    <Form.List name="buttons">
                        {(fields, { add, remove }) => (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <Text strong>Кнопки (Telegram)</Text>
                                    <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                                        Добавить кнопку
                                    </Button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    {fields.map(({ key, name, ...restField }) => (
                                        <Card size="small" key={key} hoverable bodyStyle={{ padding: 12 }}>
                                            <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
                                                <div style={{ flex: 1 }}>
                                                    <Row gutter={8}>
                                                        <Col span={12}>
                                                            <Form.Item
                                                                {...restField}
                                                                name={[name, 'text']}
                                                                rules={[{ required: true, message: 'Текст обязателен' }]}
                                                                noStyle
                                                            >
                                                                <Input placeholder="Текст кнопки" />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col span={12}>
                                                            <Form.Item
                                                                {...restField}
                                                                name={[name, 'type']}
                                                                initialValue="quick_reply"
                                                                noStyle
                                                            >
                                                                <Select style={{ width: '100%' }}>
                                                                    <Option value="quick_reply">Быстрый ответ</Option>
                                                                    <Option value="url">URL Ссылка</Option>
                                                                </Select>
                                                            </Form.Item>
                                                        </Col>
                                                    </Row>
                                                    <Form.Item
                                                        noStyle
                                                        shouldUpdate={(prev, curr) =>
                                                            prev.buttons?.[name]?.type !== curr.buttons?.[name]?.type
                                                        }
                                                    >
                                                        {({ getFieldValue }) => {
                                                            const type = getFieldValue(['buttons', name, 'type']);
                                                            return type === 'url' ? (
                                                                <div style={{ marginTop: 8 }}>
                                                                    <Form.Item
                                                                        {...restField}
                                                                        name={[name, 'url']}
                                                                        rules={[{ required: true, message: 'URL обязателен' }]}
                                                                        noStyle
                                                                    >
                                                                        <Input placeholder="https://..." prefix={<LinkOutlined />} />
                                                                    </Form.Item>
                                                                </div>
                                                            ) : null;
                                                        }}
                                                    </Form.Item>
                                                </div>
                                                <MinusCircleOutlined onClick={() => remove(name)} style={{ color: 'red' }} />
                                            </Space>
                                        </Card>
                                    ))}
                                    {fields.length === 0 && <Empty description="Нет кнопок" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
                                </div>
                            </>
                        )}
                    </Form.List>
                </Form>
            </Modal>
        </div>
    );
};

export default TemplatesSettings;
