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
    LoadingOutlined,
    AudioOutlined,
    DeleteOutlined
} from '@ant-design/icons';

const { Content, Sider } = Layout;
const { Text, Title } = Typography;
const { TextArea } = Input;
type Socket = ReturnType<typeof io>;

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
        // Voice / Audio
        if ((msg.message_type === 'voice' || msg.file_url?.endsWith('.ogg') || msg.file_url?.endsWith('.mp3') || msg.file_url?.endsWith('.wav')) && msg.file_url) {
            return (

                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        marginTop: 8,
                        minWidth: 150
                    }}
                    onClick={(e) => { e.stopPropagation(); handlePlayVoice(); }}
                >
                    {isPlaying ? (
                        <PauseCircleOutlined style={{ fontSize: 24 }} />
                    ) : (
                        <PlayCircleOutlined style={{ fontSize: 24 }} />
                    )}
                    <div style={{ flex: 1 }}>
                        <div style={{
                            height: 4,
                            background: isOwn ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)',
                            borderRadius: 2,
                            width: '100%',
                        }} />
                    </div>
                </div>
            );
        }
        // Image
        if ((msg.message_type === 'image' || (msg.message_type as any) === 'photo' || msg.file_url?.match(/\.(jpeg|jpg|gif|png|webp)$/i)) && msg.file_url) {
            return (
                <div style={{ marginTop: 4 }}>
                    <img
                        src={msg.file_url}
                        alt="Attachment"
                        style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, cursor: 'pointer' }}
                        onClick={() => window.open(msg.file_url, '_blank')}
                    />
                </div>
            );
        }
        if ((msg.message_type === 'video' || msg.message_type === 'video_note') && msg.file_url) {
            return (
                <div style={{ marginTop: 4 }}>
                    <video
                        src={msg.file_url}
                        controls
                        playsInline
                        style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8 }}
                    />
                    <div style={{ marginTop: 4 }}>
                        <a href={msg.file_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: isOwn ? 'white' : '#1890ff', textDecoration: 'underline' }}>
                            Скачать видео
                        </a>
                    </div>
                </div>
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

    // Voice Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
    const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<Socket | null>(null);
    const selectedContactRef = useRef<number | null>(null);

    useEffect(() => {
        selectedContactRef.current = selectedContact?.id || null;
    }, [selectedContact]);

    // URL params handling
    const contactIdParam = searchParams.get('contactId');

    useEffect(() => {
        fetchContacts();
        setupSocket();

        // Polling as fallback
        const interval = setInterval(fetchContacts, 30000);

        return () => {
            clearInterval(interval);
            socketRef.current?.disconnect();
        };
    }, []);

    // Re-fetch contacts when search changes
    useEffect(() => {
        fetchContacts();
    }, [searchQuery]);

    const setupSocket = () => {
        const socketUrl = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';
        socketRef.current = io(socketUrl, {
            transports: ['websocket', 'polling'],
        });

        socketRef.current.on('new_message_global', () => {
            // Refresh contacts list to show new message/time
            fetchContacts();

            // If we have a contact selected, refresh messages to show new one
            // Ideally we should check if the message belongs to this contact,
            // but fetching is cheap enough for now
            if (selectedContactRef.current) {
                fetchMessages(selectedContactRef.current);
            }
        });
    };

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

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Detect support
            let mimeType = 'audio/webm;codecs=opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/mp4';
                if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';
            }
            const options = mimeType ? { mimeType } : undefined;

            const mediaRecorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const type = mimeType || 'audio/webm';
                const audioBlob = new Blob(audioChunksRef.current, { type });
                const url = URL.createObjectURL(audioBlob);
                setRecordedAudio(audioBlob);
                setAudioPreviewUrl(url);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingDuration(0);
            recordingTimerRef.current = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);

        } catch (error) {
            antMessage.error('Не удалось получить доступ к микрофону');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }
        }
    };

    const cancelRecording = () => {
        setRecordedAudio(null);
        setAudioPreviewUrl(null);
        setRecordingDuration(0);
        setIsRecording(false);
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
        if (audioPreviewUrl) {
            URL.revokeObjectURL(audioPreviewUrl!);
        }
    };

    const sendVoiceMessage = async () => {
        if (!selectedContact || !recordedAudio) return;

        setSending(true);
        try {
            // Note: sendVoice is now added to contactMessagesAPI
            // @ts-ignore
            const newMessage = await contactMessagesAPI.sendVoice(selectedContact.id, recordedAudio, undefined);
            setMessages(prev => [...prev, newMessage]);
            cancelRecording();
            fetchContacts();
            scrollToBottom();
        } catch (error: any) {
            const errMsg = error.response?.data?.error || 'Ошибка отправки голосового';
            antMessage.error(errMsg);
        } finally {
            setSending(false);
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
                            <div style={{ display: 'flex', gap: 8 }}>
                                {selectedContact.latest_order_id && (
                                    <Link to={`/order/${selectedContact.latest_order_id}`}>
                                        <Button type="link">Открыть сделку</Button>
                                    </Link>
                                )}
                                <Link to={`/contact/${selectedContact.id}`}>
                                    <Button type="link">Открыть профиль</Button>
                                </Link>
                            </div>
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
                        <div style={{
                            padding: '12px 16px',
                            background: '#fff',
                            borderTop: '1px solid #f0f0f0',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            minHeight: 64,
                        }}>
                            {recordedAudio && audioPreviewUrl ? (
                                <>
                                    <Button
                                        danger
                                        icon={<DeleteOutlined />}
                                        onClick={cancelRecording}
                                        shape="circle"
                                    />
                                    <div style={{
                                        flex: 1,
                                        background: '#f5f5f5',
                                        borderRadius: 20,
                                        padding: '4px 16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12
                                    }}>
                                        <audio src={audioPreviewUrl} controls style={{ height: 32, width: '100%' }} />
                                    </div>
                                    <Button
                                        type="primary"
                                        icon={<SendOutlined />}
                                        onClick={sendVoiceMessage}
                                        loading={sending}
                                        shape="circle"
                                    />
                                </>
                            ) : isRecording ? (
                                <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 12, padding: '0 8px' }}>
                                    <div style={{
                                        color: '#ff4d4f',
                                        fontWeight: 500,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                    }}>
                                        <div style={{ width: 10, height: 10, background: '#ff4d4f', borderRadius: '50%' }} />
                                        {formatDuration(recordingDuration)}
                                    </div>
                                    <Text type="secondary" style={{ flex: 1, marginLeft: 16 }}>Запись голосового сообщения...</Text>
                                    <Button
                                        danger
                                        type="primary"
                                        icon={<PauseCircleOutlined />}
                                        onClick={stopRecording}
                                        shape="circle"
                                    />
                                </div>
                            ) : (
                                <>
                                    <TextArea
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
                                        style={{ borderRadius: 12, resize: 'none', flex: 1 }}
                                    />

                                    <Button
                                        icon={<AudioOutlined />}
                                        shape="circle"
                                        size="large"
                                        onClick={startRecording}
                                        disabled={sending || !!messageInput.trim()}
                                    />

                                    <Button
                                        type="primary"
                                        shape="circle"
                                        size="large"
                                        icon={<SendOutlined />}
                                        onClick={handleSendMessage}
                                        loading={sending}
                                        disabled={!messageInput.trim() && !sending}
                                    />
                                </>
                            )}
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
