import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
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
    Tag,
    Badge,
    Space,
    message as antMessage
} from 'antd';
import {
    SearchOutlined,
    UserOutlined,
    ArrowLeftOutlined,
} from '@ant-design/icons';
import { UnifiedMessageBubble } from '../components/UnifiedMessageBubble';
import { ChatInput } from '../components/ChatInput';
import { formatDate, formatTime, isClientMessage } from '../utils/chatUtils';

const { Content, Sider } = Layout;
const { Text, Title } = Typography;
type Socket = ReturnType<typeof io>;

interface ExtendedInboxContact extends InboxContact {
    telegram_user_id?: number | string;
    last_message_at?: string;
    avatar_url?: string;
}

const InboxPage: React.FC = () => {
    const { manager } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [contacts, setContacts] = useState<ExtendedInboxContact[]>([]);
    const [selectedContact, setSelectedContact] = useState<ExtendedInboxContact | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoadingContacts, setIsLoadingContacts] = useState(false);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [sending, setSending] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<Socket | null>(null);

    // Initial load
    useEffect(() => {
        fetchContacts();

        // Socket connection
        const socketUrl = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';
        socketRef.current = io(socketUrl, {
            transports: ['websocket', 'polling'],
        });

        socketRef.current.on('connect', () => {
            console.log('Socket connected in Inbox');
        });

        return () => {
            socketRef.current?.disconnect();
        };
    }, []);

    // Listen for new messages
    useEffect(() => {
        if (!socketRef.current) return;

        const handleNewMessage = (data: { contact_id: number, message: Message }) => {
            // Update last message in contacts list
            setContacts(prev => prev.map(c => {
                if (c.id === data.contact_id) {
                    return {
                        ...c,
                        last_message: data.message,
                        last_message_at: data.message.created_at || data.message['Created Date'],
                        unread_count: (selectedContact?.id === c.id) ? 0 : (c.unread_count || 0) + 1
                    };
                }
                return c;
            }).sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()));

            // Update current chat if open
            if (selectedContact?.id === data.contact_id) {
                setMessages(prev => {
                    if (prev.some(m => m.id === data.message.id)) return prev;
                    return [...prev, data.message];
                });
                scrollToBottom();
            }
        };

        socketRef.current.on('contact_message', handleNewMessage);

        return () => {
            socketRef.current?.off('contact_message', handleNewMessage);
        };
    }, [selectedContact]);

    // Handle URL param selection
    useEffect(() => {
        const contactId = searchParams.get('contactId');
        if (contactId && contacts.length > 0) {
            const contact = contacts.find(c => c.id === Number(contactId));
            if (contact && (!selectedContact || selectedContact.id !== contact.id)) {
                selectContact(contact);
            }
        }
    }, [searchParams, contacts]);

    const fetchContacts = async () => {
        try {
            setIsLoadingContacts(true);
            const contactsData = await contactsAPI.getSummary({ limit: 50, search: searchQuery });
            setContacts(contactsData);
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
            setMessages(data);
            scrollToBottom();
        } catch (error: any) {
            console.error('Error fetching messages:', error);
            if (error.response) {
                console.error('Server Error Details:', error.response.data);
                antMessage.error(`Ошибка загрузки: ${JSON.stringify(error.response.data)}`);
            }
        } finally {
            setIsLoadingMessages(false);
        }
    };

    const selectContact = (contact: ExtendedInboxContact) => {
        setSelectedContact(contact);
        setSearchParams({ contactId: String(contact.id) });
        fetchMessages(contact.id);
    };

    const handleSendMessage = async (text: string) => {
        if (!selectedContact || sending) return;
        setSending(true);
        try {
            const newMessage = await contactMessagesAPI.sendToContact(selectedContact.id, text, 'manager');
            setMessages(prev => [...prev, newMessage]);
            fetchContacts();
            scrollToBottom();
        } catch (error) {
            console.error('Error sending message:', error);
            antMessage.error('Не удалось отправить сообщение');
        } finally {
            setSending(false);
        }
    };

    const handleSendVoice = async (voice: Blob, duration: number) => {
        if (!selectedContact || sending) return;
        setSending(true);
        try {
            const newMessage = await contactMessagesAPI.sendVoice(selectedContact.id, voice, duration);
            setMessages(prev => [...prev, newMessage]);
            fetchContacts();
            scrollToBottom();
        } catch (error: any) {
            const errMsg = error.response?.data?.error || 'Ошибка отправки голосового';
            antMessage.error(errMsg);
        } finally {
            setSending(false);
        }
    };

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const showList = !isMobile || (isMobile && !selectedContact);
    const showChat = !isMobile || (isMobile && selectedContact);

    return (
        <Layout style={{ height: 'calc(100vh - 100px)', background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8 }}>
            {showList && (
                <Sider
                    width={isMobile ? '100%' : 350}
                    theme="light"
                    style={{ borderRight: isMobile ? 'none' : '1px solid #f0f0f0' }}
                >
                    <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0' }}>
                        <Title level={4} style={{ marginBottom: 16 }}>Диалоги</Title>
                        <Input
                            placeholder="Поиск..."
                            prefix={<SearchOutlined />}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onPressEnter={fetchContacts}
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
                                        className={`contact-item ${selectedContact?.id === contact.id ? 'active' : ''}`}
                                        onClick={() => selectContact(contact)}
                                        style={{
                                            cursor: 'pointer',
                                            padding: '12px 16px',
                                            background: selectedContact?.id === contact.id ? '#e6f7ff' : 'transparent',
                                            borderBottom: '1px solid #f0f0f0',
                                            transition: 'all 0.3s'
                                        }}
                                    >
                                        <List.Item.Meta
                                            avatar={
                                                <Badge count={contact.unread_count} size="small">
                                                    <Avatar size={48} icon={<UserOutlined />} src={contact.avatar_url} />
                                                </Badge>
                                            }
                                            title={
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            )}

            {showChat && (
                <Content style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                    {selectedContact ? (
                        <>
                            {/* Header */}
                            <div style={{
                                padding: '16px 24px',
                                borderBottom: '1px solid #f0f0f0',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: '#fff',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                zIndex: 1,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    {isMobile && (
                                        <Button
                                            icon={<ArrowLeftOutlined />}
                                            onClick={() => setSelectedContact(null)}
                                            type="text"
                                        />
                                    )}
                                    <Avatar size={40} style={{ backgroundColor: '#87d068' }}>{selectedContact.name[0]}</Avatar>
                                    <div>
                                        <Title level={5} style={{ margin: 0 }}>{selectedContact.name}</Title>
                                        <Space size="small">
                                            {selectedContact.phone && (
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    {selectedContact.phone}
                                                </Text>
                                            )}
                                            <Text type="secondary" style={{ fontSize: 10, color: '#d9d9d9' }}>
                                                ID: {selectedContact.id} {selectedContact.telegram_user_id ? `| TG: ${selectedContact.telegram_user_id}` : '| No TG ID'}
                                            </Text>
                                        </Space>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    {selectedContact.latest_order_id && (
                                        <Link to={`/order/${selectedContact.latest_order_id}`}>
                                            <Button type="link" size="small">{isMobile ? 'Сделка' : 'Открыть сделку'}</Button>
                                        </Link>
                                    )}
                                </div>
                            </div>

                            {/* Messages Area */}
                            <div style={{
                                flex: 1,
                                padding: isMobile ? '12px' : '24px',
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
                                                    return (
                                                        <UnifiedMessageBubble
                                                            key={msg.id}
                                                            msg={msg}
                                                            isOwn={isOwn}
                                                        // Reply logic can be added here if we implement onReply/replyTo state
                                                        />
                                                    );
                                                })}
                                            </div>
                                        ));
                                    })()
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            <ChatInput
                                onSendText={handleSendMessage}
                                onSendVoice={handleSendVoice}
                                sending={sending}
                            />
                        </>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f5f5f5' }}>
                            <Empty description={isMobile ? "Выберите диалог" : "Выберите диалог из списка слева"} />
                        </div>
                    )
                    }
                </Content >
            )
            }
        </Layout >
    );
};

export default InboxPage;
