import React, { useState, useEffect } from 'react';
import { Tag as AntTag, Button, Space, Input, Modal, Typography, List, Switch, message, Divider, Popover } from 'antd';
import { PlusOutlined, SettingOutlined, DeleteOutlined, CheckOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Tag } from '../types';
import { tagsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const { Text } = Typography;


const PREDEFINED_COLORS = [
    '#f5222d', // red
    '#fa8c16', // orange
    '#fadb14', // yellow
    '#52c41a', // green
    '#13c2c2', // cyan
    '#1890ff', // blue
    '#722ed1', // purple
    '#eb2f96', // magenta
    '#8c8c8c', // gray
];

interface OrderTagsProps {
    orderId: number;
    initialTags?: Tag[];
    onTagsChange?: (tags: Tag[]) => void;
}

export const OrderTags: React.FC<OrderTagsProps> = ({ orderId, initialTags = [], onTagsChange }) => {
    const [orderTags, setOrderTags] = useState<Tag[]>(initialTags);
    const [allTags, setAllTags] = useState<Tag[]>([]);
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [manageModalVisible, setManageModalVisible] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [, setLoading] = useState(false);
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [creationDisabled, setCreationDisabled] = useState(false);
    const [selectedColor, setSelectedColor] = useState(PREDEFINED_COLORS[5]);

    const { manager } = useAuth();
    const isAdmin = manager?.role === 'admin';
    const navigate = useNavigate();


    useEffect(() => {
        fetchTags();
        fetchOrderTags();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId]);

    const fetchTags = async () => {
        try {
            setLoading(true);
            const data = await tagsAPI.getAll();
            setAllTags(data);
        } catch (error) {
            console.error('Error fetching tags:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchOrderTags = async () => {
        try {
            const tags = await tagsAPI.getByOrderId(orderId);
            setOrderTags(tags);
            if (onTagsChange) onTagsChange(tags);
        } catch (error) {
            console.error('Error fetching order tags:', error);
        }
    };

    const fetchSettings = async () => {
        try {
            setSettingsLoading(true);
            const settings = await tagsAPI.getSettings();
            setCreationDisabled(settings.disable_user_tag_creation);
        } catch (error) {
            console.error('Error fetching settings:', error);
        } finally {
            setSettingsLoading(false);
        }
    };

    useEffect(() => {
        if (manageModalVisible) {
            fetchSettings();
            fetchTags(); // Refresh counts
        }
    }, [manageModalVisible]);

    const handleCreateTag = async () => {
        if (!searchTerm.trim()) return;
        try {
            const newTag = await tagsAPI.create({ name: searchTerm.trim(), color: selectedColor });
            setAllTags([...allTags, newTag]);
            handleAssignTag(newTag);
            setSearchTerm('');
            message.success('Тег создан');
        } catch (error: any) {
            message.error(error.response?.data?.error || 'Ошибка создания тега');
        }
    };

    const handleAssignTag = async (tag: Tag) => {
        try {
            const exists = orderTags.find(t => t.id === tag.id);
            if (exists) {
                // Remove
                await tagsAPI.removeFromOrder(orderId, tag.id);
                const updated = orderTags.filter(t => t.id !== tag.id);
                setOrderTags(updated);
                if (onTagsChange) onTagsChange(updated);
            } else {
                // Assign
                await tagsAPI.assignToOrder(orderId, tag.id);
                const updated = [...orderTags, tag];
                setOrderTags(updated);
                if (onTagsChange) onTagsChange(updated);
            }
        } catch (error) {
            message.error('Ошибка обновления тега');
        }
    };

    const handleDeleteTag = async (id: number) => {
        try {
            await tagsAPI.delete(id);
            setAllTags(allTags.filter(t => t.id !== id));
            setOrderTags(orderTags.filter(t => t.id !== id));
            message.success('Тег удален');
        } catch (error: any) {
            message.error(error.response?.data?.error || 'Ошибка удаления тега');
        }
    };

    const handleUpdateSettings = async (disabled: boolean) => {
        try {
            setSettingsLoading(true);
            await tagsAPI.updateSettings({ disable_user_tag_creation: disabled });
            setCreationDisabled(disabled);
            message.success('Настройки обновлены');
        } catch (error) {
            message.error('Ошибка обновления настроек');
        } finally {
            setSettingsLoading(false);
        }
    };

    const filteredTags = allTags.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const canCreate = isAdmin || !creationDisabled;

    const content = (
        <div style={{ width: 300 }}>
            <div style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                <Input
                    prefix={<SearchOutlined />}
                    placeholder="Найти или добавить тег"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    onPressEnter={() => {
                        if (canCreate && filteredTags.length === 0) {
                            handleCreateTag();
                        }
                    }}
                />
                {canCreate && searchTerm && filteredTags.length === 0 && (
                    <div style={{ marginTop: 8 }}>
                        <div style={{ marginBottom: 8 }}>Выберите цвет:</div>
                        <Space wrap>
                            {PREDEFINED_COLORS.map(color => (
                                <div
                                    key={color}
                                    onClick={() => setSelectedColor(color)}
                                    style={{
                                        width: 20,
                                        height: 20,
                                        borderRadius: '50%',
                                        background: color,
                                        cursor: 'pointer',
                                        border: selectedColor === color ? '2px solid #000' : '1px solid #d9d9d9'
                                    }}
                                />
                            ))}
                        </Space>
                        <Button type="primary" block style={{ marginTop: 8 }} onClick={handleCreateTag}>
                            Создать "{searchTerm}"
                        </Button>
                    </div>
                )}
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                <List
                    size="small"
                    dataSource={filteredTags}
                    renderItem={tag => {
                        const isAssigned = orderTags.some(t => t.id === tag.id);
                        return (
                            <List.Item
                                style={{ cursor: 'pointer', background: isAssigned ? '#e6f7ff' : 'transparent' }}
                                onClick={() => handleAssignTag(tag)}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                                    <AntTag color={tag.color}>{tag.name}</AntTag>
                                    {isAssigned && <CheckOutlined style={{ color: '#1890ff' }} />}
                                </div>
                            </List.Item>
                        );
                    }}
                />
            </div>
            <Divider style={{ margin: 0 }} />
            <div style={{ padding: 8 }}>
                <Button
                    type="link"
                    block
                    icon={<SettingOutlined />}
                    onClick={() => {
                        setDropdownVisible(false);
                        setManageModalVisible(true);
                    }}
                >
                    Управление тегами
                </Button>
            </div>
        </div>
    );

    return (
        <>
            <Space wrap>
                {orderTags.map(tag => (
                    <AntTag
                        key={tag.id}
                        color={tag.color}
                        style={{ cursor: 'pointer', marginRight: 4 }}
                        onClick={() => navigate(`/orders?tag=${tag.id}`)}
                    >
                        {tag.name}
                    </AntTag>
                ))}

                <Popover
                    content={content}
                    trigger="click"
                    open={dropdownVisible}
                    onOpenChange={setDropdownVisible}
                    placement="bottomLeft"
                >
                    <Button type="dashed" size="small" icon={<PlusOutlined />}>
                        Тегировать
                    </Button>
                </Popover>
            </Space>

            <Modal
                title="Управление тегами"
                open={manageModalVisible}
                onCancel={() => setManageModalVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setManageModalVisible(false)}>
                        Закрыть
                    </Button>
                ]}
            >
                {isAdmin && (
                    <div style={{ marginBottom: 24, padding: 12, background: '#fafafa', borderRadius: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text>Запретить пользователям создавать новые теги</Text>
                            <Switch
                                checked={creationDisabled}
                                onChange={handleUpdateSettings}
                                loading={settingsLoading}
                            />
                        </div>
                    </div>
                )}

                <List
                    itemLayout="horizontal"
                    dataSource={allTags}
                    renderItem={tag => (
                        <List.Item
                            actions={[
                                isAdmin ? (
                                    <Button
                                        type="text"
                                        danger
                                        icon={<DeleteOutlined />}
                                        onClick={() => handleDeleteTag(tag.id)}
                                    />
                                ) : null
                            ]}
                        >
                            <List.Item.Meta
                                avatar={
                                    <div style={{
                                        width: 24,
                                        height: 24,
                                        background: tag.color,
                                        borderRadius: 4
                                    }} />
                                }
                                title={tag.name}
                                description={
                                    <Text type="secondary">
                                        Используется в сделкаx: {tag.count || 0}
                                    </Text>
                                }
                            />
                        </List.Item>
                    )}
                />
            </Modal>
        </>
    );
};
