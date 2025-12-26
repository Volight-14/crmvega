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
    Tag,
    Tooltip,
    Upload,
    Popover,
    message as antMessage
} from 'antd';
import {
    SearchOutlined,
    SendOutlined,
    UserOutlined,
    PaperClipOutlined,
    PlayCircleOutlined,
    PauseCircleOutlined,
    FileOutlined,
    DownloadOutlined,
    LoadingOutlined
} from '@ant-design/icons';

const { Content, Sider } = Layout;
const { Text, Title } = Typography;
const { TextArea } = Input;

interface ExtendedInboxContact extends InboxContact {
    telegram_user_id?: number | string;
}

// --- Helper Functions from OrderChat ---

// Helper to identify client messages (consistent with OrderChat)
const isClientMessage = (authorType?: string): boolean => {
    if (!authorType) return false; // If unknown, assume not client (so Manager/System -> Right)? 
    // Wait, OrderChat logic: 
    // const clientTypes = ['Клиент', 'user'];
    // return clientTypes.includes(authorType);
    // And uses: justifyContent: isFromClient ? 'flex-start' : 'flex-end'
    // So if authorType is undefined -> isFromClient=false -> Right side.
    const clientTypes = ['Клиент', 'user', 'client'];
    return clientTypes.includes(authorType);
};

const getAvatarColor = (authorType?: string): string => {
    if (!authorType) return '#8c8c8c';
    const colors: Record<string, string> = {
        'Клиент': '#52c41a',
        'user': '#52c41a',
        'client': '#52c41a',
        'Оператор': '#1890ff',
        'Менеджер': '#722ed1',
        'Админ': '#eb2f96',
        'Бот': '#faad14',
        'manager': '#1890ff',
    };
    return colors[authorType] || '#8c8c8c';
};

const formatTime = (dateStr?: string | number) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (dateStr?: string | number) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Сегодня';
    if (d.toDateString() === yesterday.toDateString()) return 'Вчера';

    return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
};

const linkifyText = (text: string): React.ReactNode => {
    if (!text) return null;
    const combinedRegex = /(https?:\/\/[^\s]+|@\w+)/g;
    const parts = text.split(combinedRegex);
    return parts.map((part, index) => {
        if (/(https?:\/\/[^\s]+)/g.test(part)) {
            return (
                <a key={index} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', wordBreak: 'break-all' }} onClick={(e) => e.stopPropagation()}>
                    {part}
                </a>
            );
        }
        return part;
    });
};

const MessageBubble = ({ msg, isOwn }: { msg: Message, isOwn: boolean }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const handlePlayVoice = () => {
        if (!msg.file_url) return;
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
                setIsPlaying(false);
            } else {
                audioRef.current.play();
                setIsPlaying(true);
            }
        } else {
            const audio = new Audio(msg.file_url);
            audioRef.current = audio;
            audio.onended = () => setIsPlaying(false);
            audio.play();
            setIsPlaying(true);
        }
    };

    const renderAttachment = () => {
        if ((msg.message_type === 'voice' || msg.content?.includes('.ogg')) && msg.file_url) {
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 4 }} onClick={handlePlayVoice}>
                    {isPlaying ? <PauseCircleOutlined style={{ fontSize: 24 }} /> : <PlayCircleOutlined style={{ fontSize: 24 }} />}
                    <span style={{ fontSize: 12 }}>Голосовое сообщение</span>
                </div>
            );
        }
        if ((msg.message_type === 'image' || (msg.message_type as any) === 'photo') && msg.file_url) {
            return (
                <img src={msg.file_url} alt="Attachment" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, marginTop: 4, cursor: 'pointer' }} onClick={() => window.open(msg.file_url, '_blank')} />
            );
        }
        if (msg.file_url && !msg.file_url.endsWith('.ogg')) {
            return (
                <a href={msg.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, color: isOwn ? 'white' : '#1890ff' }}>
                    <FileOutlined /> <span>Файл</span> <DownloadOutlined />
                </a>
            );
        }
        return null;
    };

    return (
        <div style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
            <div style={{ display: 'flex', flexDirection: isOwn ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, maxWidth: '75%' }}>
                <Tooltip title={msg.author_type}>
                    <Avatar size={32} style={{ backgroundColor: getAvatarColor(msg.author_type), flexShrink: 0 }} icon={<UserOutlined />} >
                        {msg.author_type ? msg.author_type[0].toUpperCase() : '?'}
                    </Avatar>
                </Tooltip>
                <div style={{
                    background: isOwn ? 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)' : 'linear-gradient(135deg, #f0f2f5 0%, #e8eaed 100%)',
                    color: isOwn ? 'white' : '#262626',
                    padding: '8px 12px',
                    borderRadius: isOwn ? '12px 12px 0 12px' : '12px 12px 12px 0',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                    position: 'relative',
                    minWidth: 120
                }}>
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{linkifyText(msg.content)}</div>
                    {renderAttachment()}
                    <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4, textAlign: 'right' }}>
                        {formatTime(msg['Created Date'] || msg.created_at)}
                    </div>
                </div>
            </div>
        </div>
    );
};

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
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // URL params handling
    const contactIdParam = searchParams.get('contactId');

    useEffect(() => {
        fetchContacts();
        // Увеличен интервал с 10s до 30s для снижения нагрузки
        const interval = setInterval(fetchContacts, 30000);
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
            setMessages(data); // Backend returns in ascending order (oldest first)
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
        if (!selectedContact || !messageInput.trim() || sending) return;

        try {
            setSending(true);
            const newMessage = await contactMessagesAPI.sendToContact(selectedContact.id, messageInput, 'manager');
            setMessages([...messages, newMessage]);
            setMessageInput('');
            fetchContacts();
            scrollToBottom();
        } catch (error) {
            console.error('Error sending message:', error);
            antMessage.error('Не удалось отправить сообщение');
        } finally {
            setSending(false);
        }
    };

    // NOTE: File upload for inbox generic chat needs backend support or existing endpoint adaptation.
    // For now assuming we can't easily upload files without a specific endpoint in 'contactMessagesAPI'.
    // Logic will be added if requested or if endpoints exist.

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
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
                                        avatar={<Avatar style={{ backgroundColor: '#1890ff' }} icon={<UserOutlined />} />}
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
                            background: '#fff',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                            zIndex: 1
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Avatar size="large" style={{ backgroundColor: '#87d068' }} icon={<UserOutlined />} />
                                <div>
                                    <Title level={5} style={{ margin: 0, whiteSpace: 'nowrap' }}>{selectedContact.name}</Title>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        {selectedContact.phone && <Text type="secondary" style={{ fontSize: 12 }}>{selectedContact.phone}</Text>}
                                        {selectedContact.telegram_user_id && (
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                Telegram: {selectedContact.telegram_user_id}
                                            </Text>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <Link to={`/contacts/${selectedContact.id}`}>
                                <Button type="link">Открыть профиль</Button>
                            </Link>
                        </div>

                        {/* Messages Area */}
                        <div style={{
                            flex: 1,
                            padding: '24px',
                            overflowY: 'auto',
                            background: '#f5f5f5',
                            backgroundImage: 'url("https://gw.alipayobjects.com/zos/rmsportal/FfdJeJRQWjEeGTpqgBKj.png")', // Subtle pattern
                            backgroundBlendMode: 'overlay',
                        }}>
                            {isLoadingMessages ? (
                                <div style={{ textAlign: 'center', marginTop: 40 }}><Spin /></div>
                            ) : messages.length === 0 ? (
                                <Empty description="История сообщений пуста" style={{ marginTop: 60 }} />
                            ) : (
                                (() => {
                                    const groupedMessages: { date: string, msgs: Message[] }[] = [];
                                    messages.forEach(msg => {
                                        const dateKey = formatDate(msg['Created Date'] || msg.created_at);
                                        const lastGroup = groupedMessages[groupedMessages.length - 1];
                                        if (lastGroup && lastGroup.date === dateKey) {
                                            lastGroup.msgs.push(msg);
                                        } else {
                                            groupedMessages.push({ date: dateKey, msgs: [msg] });
                                        }
                                    });

                                    return groupedMessages.map(group => (
                                        <div key={group.date}>
                                            <div style={{ textAlign: 'center', margin: '24px 0 16px', opacity: 0.5, fontSize: 12 }}>
                                                <span style={{ background: '#e0e0e0', padding: '4px 12px', borderRadius: 12 }}>{group.date}</span>
                                            </div>
                                            {group.msgs.map(msg => {
                                                const isOwn = !isClientMessage(msg.author_type);
                                                return <MessageBubble key={msg.id} msg={msg} isOwn={isOwn} />;
                                            })}
                                        </div>
                                    ));
                                })()
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div style={{ padding: 16, background: '#fff', borderTop: '1px solid #f0f0f0' }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                                <TextArea
                                    rows={1}
                                    autoSize={{ minRows: 1, maxRows: 4 }}
                                    placeholder="Напишите сообщение..."
                                    value={messageInput}
                                    onChange={(e) => setMessageInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                    style={{ borderRadius: 12, resize: 'none' }}
                                />
                                <Button
                                    type="primary"
                                    shape="circle"
                                    size="large"
                                    icon={<SendOutlined />}
                                    onClick={handleSendMessage}
                                    loading={sending}
                                    disabled={!messageInput.trim()}
                                />
                            </div>
                        </div>
                    </>
                ) : (
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f5f5f5' }}>
                        <Empty description="Выберите диалог" />
                    </div>
                )}
            </Content>
        </Layout>
    );
};

export default InboxPage;
