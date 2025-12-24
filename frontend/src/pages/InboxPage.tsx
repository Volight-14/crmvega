import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { contactsAPI, contactMessagesAPI } from '../services/api';
import { InboxContact, Message } from '../types';
import { Link, useSearchParams } from 'react-router-dom';
import {
    Layout,
    List,
    Input,
    Avatar,
    Button,
    Spin,
    Typography,
    Empty,
    Badge,
    Space,
    Tag
} from 'antd';
import {
    SearchOutlined,
    SendOutlined,
    UserOutlined,
    PaperClipOutlined
} from '@ant-design/icons';

const { Content, Sider } = Layout;
const { Text, Title } = Typography;
const { TextArea } = Input;

interface ExtendedInboxContact extends InboxContact {
    telegram_user_id?: number | string;
}

const InboxPage: React.FC = () => {
    const { manager } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [contacts, setContacts] = useState<ExtendedInboxContact[]>([]);
    const [selectedContact, setSelectedContact] = useState<ExtendedInboxContact | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoadingContacts, setIsLoadingContacts] = useState(false);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [messageInput, setMessageInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // URL params handling
    const contactIdParam = searchParams.get('contactId');

    useEffect(() => {
        fetchContacts();
        const interval = setInterval(fetchContacts, 10000); // Poll for updates every 10s
        return () => clearInterval(interval);
    }, [searchQuery]);

    useEffect(() => {
        if (contactIdParam && contacts.length > 0) {
            const contact = contacts.find(c => c.id === Number(contactIdParam));
            if (contact) {
                // Only select if not already selected to avoid loop/refetch
                if (selectedContact?.id !== contact.id) {
                    selectContact(contact);
                }
            }
        }
    }, [contactIdParam, contacts]);

    const fetchContacts = async () => {
        try {
            if (contacts.length === 0) setIsLoadingContacts(true);
            const data = await contactsAPI.getSummary({ search: searchQuery });
            setContacts(data as ExtendedInboxContact[]);
        } catch (error) {
            console.error('Error fetching inbox contacts:', error);
        } finally {
            setIsLoadingContacts(false);
        }
    };

    const fetchMessages = async (contactId: number) => {
        try {
            setIsLoadingMessages(true);
            const data = await contactMessagesAPI.getByContactId(contactId, { limit: 50 });
            setMessages(data.reverse()); // Show newest at bottom
            scrollToBottom();
        } catch (error) {
            console.error('Error fetching messages:', error);
        } finally {
            setIsLoadingMessages(false);
        }
    };

    const selectContact = (contact: ExtendedInboxContact) => {
        setSelectedContact(contact);
        setSearchParams({ contactId: String(contact.id) });
        fetchMessages(contact.id);
    };

    const handleSendMessage = async () => {
        if (!selectedContact || !messageInput.trim()) return;

        try {
            const newMessage = await contactMessagesAPI.sendToContact(selectedContact.id, messageInput, 'manager');
            setMessages([...messages, newMessage]);
            setMessageInput('');
            fetchContacts(); // Update last message in sidebar
            scrollToBottom();
        } catch (error) {
            console.error('Error sending message:', error);
            // Could use Antd Message.error here
        }
    };

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const formatTime = (dateStr?: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString([], { month: 'numeric', day: 'numeric' });
    };

    return (
        <Layout style={{ height: 'calc(100vh - 100px)', background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8 }}>
            <Sider width={350} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
                <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0' }}>
                    <Title level={4} style={{ marginBottom: 16 }}>Диалоги</Title>
                    <Input
                        placeholder="Поиск..."
                        prefix={<SearchOutlined />}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div style={{ height: 'calc(100% - 108px)', overflowY: 'auto' }}>
                    {isLoadingContacts && contacts.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
                    ) : (
                        <List
                            itemLayout="horizontal"
                            dataSource={contacts}
                            renderItem={(contact) => (
                                <List.Item
                                    onClick={() => selectContact(contact)}
                                    style={{
                                        padding: '12px 16px',
                                        cursor: 'pointer',
                                        background: selectedContact?.id === contact.id ? '#e6f7ff' : 'transparent',
                                        borderLeft: selectedContact?.id === contact.id ? '3px solid #1890ff' : '3px solid transparent'
                                    }}
                                    className="hover:bg-gray-50"
                                >
                                    <List.Item.Meta
                                        avatar={<Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />}
                                        title={
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Text strong style={{ maxWidth: 160 }} ellipsis>{contact.name}</Text>
                                                {contact.last_active && (
                                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                                        {formatTime(contact.last_active)}
                                                    </Text>
                                                )}
                                            </div>
                                        }
                                        description={
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Text type="secondary" style={{ width: 180 }} ellipsis>
                                                    {contact.last_message?.content || 'Нет сообщений'}
                                                </Text>
                                                {contact.telegram_user_id && <Tag color="blue" style={{ margin: 0, fontSize: 10 }}>TG</Tag>}
                                            </div>
                                        }
                                    />
                                </List.Item>
                            )}
                        />
                    )}
                </div>
            </Sider>
            <Content style={{ display: 'flex', flexDirection: 'column' }}>
                {selectedContact ? (
                    <>
                        {/* Header */}
                        <div style={{
                            padding: '12px 24px',
                            borderBottom: '1px solid #f0f0f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#fff'
                        }}>
                            <Space>
                                <Avatar size="large" icon={<UserOutlined />} style={{ backgroundColor: '#87d068' }} />
                                <div>
                                    <Title level={5} style={{ margin: 0 }}>{selectedContact.name}</Title>
                                    <Space size="small">
                                        {selectedContact.phone && <Text type="secondary" style={{ fontSize: 12 }}>{selectedContact.phone}</Text>}
                                        {selectedContact.telegram_user_id && (
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                Telegram: {selectedContact.telegram_user_id}
                                            </Text>
                                        )}
                                    </Space>
                                </div>
                            </Space>
                            <Link to={`/contacts/${selectedContact.id}`}>
                                <Button type="link">Открыть профиль</Button>
                            </Link>
                        </div>

                        {/* Messages */}
                        <div style={{
                            flex: 1,
                            padding: 24,
                            overflowY: 'auto',
                            background: '#f5f5f5',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16
                        }}>
                            {isLoadingMessages ? (
                                <div style={{ textAlign: 'center', marginTop: 40 }}><Spin /></div>
                            ) : messages.length === 0 ? (
                                <Empty description="История сообщений пуста" style={{ marginTop: 60 }} />
                            ) : (
                                messages.map((msg) => {
                                    const isOwn = msg.author_type === 'manager' || msg.author_type === 'Админ' || msg.author_type === 'Менеджер';
                                    return (
                                        <div key={msg.id} style={{
                                            display: 'flex',
                                            justifyContent: isOwn ? 'flex-end' : 'flex-start'
                                        }}>
                                            <div style={{
                                                maxWidth: '70%',
                                                padding: '12px 16px',
                                                borderRadius: 12,
                                                borderBottomRightRadius: isOwn ? 0 : 12,
                                                borderBottomLeftRadius: isOwn ? 12 : 0,
                                                background: isOwn ? '#1890ff' : '#fff',
                                                color: isOwn ? '#fff' : 'inherit',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                            }}>
                                                {msg.file_url && (
                                                    <div style={{ marginBottom: 8 }}>
                                                        {(msg.message_type === 'image' || (msg.message_type as any) === 'photo') ? (
                                                            <img src={msg.file_url} alt="Attachment" style={{ maxWidth: '100%', borderRadius: 8 }} />
                                                        ) : (
                                                            <a href={msg.file_url} target="_blank" rel="noopener noreferrer" style={{ color: isOwn ? '#fff' : '#1890ff', textDecoration: 'underline' }}>
                                                                <PaperClipOutlined /> Вложение
                                                            </a>
                                                        )}
                                                    </div>
                                                )}
                                                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                                                <div style={{
                                                    textAlign: 'right',
                                                    marginTop: 4,
                                                    fontSize: 10,
                                                    opacity: 0.7
                                                }}>
                                                    {formatTime(msg['Created Date'] || msg.created_at)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div style={{ padding: 16, background: '#fff', borderTop: '1px solid #f0f0f0' }}>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <TextArea
                                    rows={2}
                                    placeholder="Напишите сообщение..."
                                    value={messageInput}
                                    onChange={(e) => setMessageInput(e.target.value)}
                                    // Make 'Enter' send message (optional, usually ctrl+enter for textarea)
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                    style={{ resize: 'none' }}
                                />
                                <Button
                                    type="primary"
                                    icon={<SendOutlined />}
                                    onClick={handleSendMessage}
                                    style={{ height: 'auto' }}
                                    disabled={!messageInput.trim()}
                                >

                                </Button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f5f5f5' }}>
                        <Empty description="Выберите диалог, чтобы начать общение" />
                    </div>
                )}
            </Content>
        </Layout>
    );
};

export default InboxPage;
