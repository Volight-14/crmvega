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
    Typography
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    FileImageOutlined,
    SearchOutlined
} from '@ant-design/icons';
import { templatesAPI, uploadAPI } from '../../services/api';
import { WebsiteContent } from '../../types';

const { TextArea } = Input;
const { Text } = Typography;

interface TemplateContent {
    text?: string;
    attachments?: Array<{ type: 'image' | 'file'; url: string; name?: string }>;
}

const parseContent = (content?: string): TemplateContent => {
    if (!content) return { text: '' };
    try {
        const parsed = JSON.parse(content);
        // Simple check if it looks like our schema
        if (parsed && (parsed.text !== undefined || parsed.attachments !== undefined)) {
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
        const { title, text } = values;

        // Prepare content
        const attachments = fileList.map(f => ({
            type: 'image' as const, // assuming images for now
            url: f.url || f.response?.url,
            name: f.name
        })).filter(a => a.url);

        const contentObj: TemplateContent = {
            text,
            attachments: attachments.length > 0 ? attachments : undefined
        };

        const content = JSON.stringify(contentObj);

        try {
            if (editingTemplate) {
                await templatesAPI.update(editingTemplate.id, { title, content });
                message.success('Template updated');
            } else {
                await templatesAPI.create({ title, content });
                message.success('Template created');
            }
            setIsModalVisible(false);
            form.resetFields();
            setFileList([]);
            setEditingTemplate(null);
            fetchTemplates();
        } catch (error) {
            message.error('Error saving template');
        }
    };

    const handleEdit = (record: WebsiteContent) => {
        setEditingTemplate(record);
        const parsed = parseContent(record.content);

        form.setFieldsValue({
            title: record.title,
            text: parsed.text
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
            message.success('Template deleted');
            fetchTemplates();
        } catch (error) {
            message.error('Error deleting template');
        }
    };

    // Upload handlers
    const customRequest = async (options: any) => {
        const { file, onSuccess, onError } = options;
        setUploading(true);
        try {
            const result = await uploadAPI.uploadFile(file);
            onSuccess(result, file);
            message.success(`${file.name} uploaded successfully`);
        } catch (err: any) {
            onError(err);
            message.error(`${file.name} upload failed`);
        } finally {
            setUploading(false);
        }
    };

    const handleFileChange = ({ fileList }: any) => {
        // Should update fileList to reflect status
        // Use map to ensure we catch the response securely
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
                            <Space key={i}>
                                <FileImageOutlined />
                                <Text type="secondary" style={{ fontSize: 12 }}>{att.name || 'Image'}</Text>
                            </Space>
                        ))}
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
                                                overflow: 'hidden'
                                            }}>
                                                {parsed.text}
                                            </div>
                                        )}
                                        {parsed.attachments && parsed.attachments.length > 0 && (
                                            <div style={{ marginTop: 8 }}>
                                                <FileImageOutlined /> {parsed.attachments.length} вложений
                                            </div>
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
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <Form.Item name="title" label="Название (триггер)" rules={[{ required: true }]}>
                        <Input placeholder="Например: Приветствие" />
                    </Form.Item>

                    <Form.Item name="text" label="Текст сообщения">
                        <TextArea rows={4} placeholder="Введите текст шаблона..." />
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
                </Form>
            </Modal>
        </div>
    );
};

export default TemplatesSettings;
