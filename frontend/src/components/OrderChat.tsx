import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Tabs,
  Badge,
  Input,
  Button,
  Upload,
  Tooltip,
  Avatar,
  Spin,
  Empty,
  message as antMessage,
  Popover,
} from 'antd';
import {
  SendOutlined,
  PaperClipOutlined,
  AudioOutlined,
  CloseOutlined,
  FileOutlined,
  RollbackOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  UserOutlined,
  TeamOutlined,
  ReloadOutlined,
  DownloadOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { Message, InternalMessage, Manager } from '../types';
import { orderMessagesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import io from 'socket.io-client';

const { TextArea } = Input;

interface OrderChatProps {
  orderId: number;
  contactName?: string;
}

type ChatTab = 'client' | 'internal';

// Определяем, от клиента ли сообщение
const isClientMessage = (authorType: string): boolean => {
  const clientTypes = ['Клиент', 'user'];
  return clientTypes.includes(authorType);
};

// Определяем цвет аватара по типу автора
const getAvatarColor = (authorType: string): string => {
  const colors: Record<string, string> = {
    'Клиент': '#52c41a',
    'user': '#52c41a',
    'Оператор': '#1890ff',
    'Менеджер': '#722ed1',
    'Админ': '#eb2f96',
    'Бот': '#faad14',
    'Служба заботы': '#13c2c2',
    'manager': '#1890ff',
  };
  return colors[authorType] || '#8c8c8c';
};

// Форматирование времени
const formatTime = (date: string | number | undefined): string => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (date: string | number | undefined): string => {
  if (!date) return '';
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) {
    return 'Сегодня';
  } else if (d.toDateString() === yesterday.toDateString()) {
    return 'Вчера';
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};

// Функция для преобразования текста со ссылками и упоминаниями в кликабельные элементы
const linkifyText = (text: string): React.ReactNode => {
  if (!text) return null;

  // Регулярные выражения для поиска URL и @username
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const mentionRegex = /(@\w+)/g;

  // Комбинированный regex для разделения текста
  const combinedRegex = /(https?:\/\/[^\s]+|@\w+)/g;

  const parts = text.split(combinedRegex);

  return parts.map((part, index) => {
    // Проверяем, является ли часть URL
    if (urlRegex.test(part)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'inherit',
            textDecoration: 'underline',
            wordBreak: 'break-all'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }

    // Проверяем, является ли часть @username
    if (mentionRegex.test(part)) {
      const username = part.substring(1); // Убираем @
      return (
        <a
          key={index}
          href={`https://t.me/${username}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'inherit',
            textDecoration: 'underline',
            fontWeight: 500
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }

    // Обычный текст
    return part;
  });
};

// Компонент сообщения клиента
const ClientMessageBubble = ({ msg, currentUserId, onReply, replyMessage }: { msg: Message; currentUserId: number; onReply: (msg: Message) => void; replyMessage?: Message }) => {
  const isFromClient = isClientMessage(msg.author_type);
  const isOwn = msg.sender_id === currentUserId;
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const scrollToMessage = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('highlight-message');
      setTimeout(() => element.classList.remove('highlight-message'), 2000);
    }
  };

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
    if (msg.message_type === 'voice' && msg.file_url) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
          }}
          onClick={handlePlayVoice}
        >
          {isPlaying ? (
            <PauseCircleOutlined style={{ fontSize: 24 }} />
          ) : (
            <PlayCircleOutlined style={{ fontSize: 24 }} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{
              height: 4,
              background: isFromClient ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.3)',
              borderRadius: 2,
              minWidth: 100,
            }} />
          </div>
        </div>
      );
    }

    if (msg.message_type === 'video' || msg.message_type === 'video_note' || (msg.file_url && msg.file_url.endsWith('.mp4'))) {
      const isRound = msg.message_type === 'video_note';
      return (
        <div>
          <video
            controls
            src={msg.file_url}
            style={{
              marginTop: 8,
              maxWidth: '100%',
              borderRadius: isRound ? '50%' : 8,
              aspectRatio: isRound ? '1/1' : 'auto',
              objectFit: 'cover',
              width: isRound ? 200 : 'auto',
              height: isRound ? 200 : 'auto',
              maxHeight: 300,
            }}
          />
          {(msg.caption || msg.content) && !isRound && (
            <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {msg.caption || msg.content}
            </div>
          )}
        </div>
      );
    }

    if ((msg.message_type === 'file' || msg.message_type === 'image') && msg.file_url) {
      const isImage = msg.message_type === 'image' || msg.file_url.match(/\.(jpg|jpeg|png|gif|webp)$/i);

      if (isImage) {
        return (
          <div>
            <img
              src={msg.file_url}
              alt={msg.file_name || 'Image'}
              style={{
                maxWidth: '100%',
                maxHeight: 300,
                borderRadius: 8,
                cursor: 'pointer',
              }}
              onClick={() => window.open(msg.file_url, '_blank')}
            />
            {(msg.caption || msg.content) && (
              <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {msg.caption || msg.content}
              </div>
            )}
          </div>
        );
      }

      return (
        <a
          href={msg.file_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: isFromClient ? '#1890ff' : 'white',
            textDecoration: 'none',
          }}
        >
          <FileOutlined style={{ fontSize: 20 }} />
          <span>{msg.file_name || 'Файл'}</span>
          <DownloadOutlined />
        </a>
      );
    }

    // Проверяем если контент это URL (например, голосовое из Bubble)
    if (msg.content?.startsWith('https://') && msg.content.includes('storage')) {
      const isVoice = msg.content.includes('.ogg') || msg.content.includes('.mp3') || msg.content.includes('.wav');
      if (isVoice) {
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
            }}
            onClick={() => {
              const audio = new Audio(msg.content);
              audio.play();
            }}
          >
            <PlayCircleOutlined style={{ fontSize: 24 }} />
            <span>🎤 Голосовое сообщение</span>
          </div>
        );
      }
    }

    return null;
  };

  return (
    <div
      id={`msg-client-${msg.message_id_tg || msg.id}`}
      style={{
        display: 'flex',
        justifyContent: isFromClient ? 'flex-start' : 'flex-end',
        padding: '4px 0',
        position: 'relative',
      }}
      onDoubleClick={() => onReply(msg)}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: isFromClient ? 'row' : 'row-reverse',
          alignItems: 'flex-end',
          gap: 8,
          maxWidth: '75%',
        }}
      >
        <Tooltip title={msg.author_type}>
          <Avatar
            size={32}
            style={{ backgroundColor: getAvatarColor(msg.author_type), flexShrink: 0 }}
            icon={<UserOutlined />}
          />
        </Tooltip>
        <div
          style={{
            background: isFromClient
              ? 'linear-gradient(135deg, #f0f2f5 0%, #e8eaed 100%)'
              : 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
            color: isFromClient ? '#262626' : 'white',
            padding: '8px 12px',
            borderRadius: isFromClient ? '12px 12px 12px 0' : '12px 12px 0 12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            position: 'relative',
            minWidth: 120,
          }}
        >
          {replyMessage && (
            <div
              onClick={(e) => { e.stopPropagation(); scrollToMessage(`msg-client-${replyMessage.message_id_tg || replyMessage.id}`); }}
              style={{
                marginBottom: 4,
                padding: '4px 8px',
                borderLeft: `2px solid ${isFromClient ? '#1890ff' : 'white'}`,
                backgroundColor: isFromClient ? 'rgba(24, 144, 255, 0.1)' : 'rgba(255, 255, 255, 0.2)',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
                opacity: 0.9
              }}
            >
              <div style={{ fontWeight: 'bold' }}>{replyMessage.author_type}</div>
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                {replyMessage.content || (replyMessage.message_type !== 'text' ? `[${replyMessage.message_type}]` : '...')}
              </div>
            </div>
          )}

          {msg.content && <div className="message-content" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{linkifyText(msg.content)}</div>}
          {renderAttachment()}

          <div style={{
            fontSize: 11,
            opacity: 0.6,
            marginTop: 4,
            textAlign: 'right',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
          }}>
            <span
              onClick={(e) => { e.stopPropagation(); onReply(msg); }}
              style={{ cursor: 'pointer', opacity: 0.8, display: 'flex', alignItems: 'center' }}
              title="Ответить"
            >
              <RollbackOutlined rotate={180} />
            </span>
            <span>
              {formatTime(msg.created_at || msg['Created Date'])}
            </span>
            {isOwn && (
              <span>
                {/* Status icon logic if needed */}
              </span>
            )}
            {msg.voice_duration && (
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                {Math.floor(msg.voice_duration / 60)}:{(msg.voice_duration % 60).toString().padStart(2, '0')}
              </span>
            )}
          </div>

          {/* Реакции */}
          {msg.reactions && msg.reactions.length > 0 && (
            <div style={{
              position: 'absolute',
              bottom: -10,
              right: isFromClient ? -5 : 'auto',
              left: isFromClient ? 'auto' : -5,
              backgroundColor: '#fff',
              border: '1px solid #f0f0f0',
              borderRadius: 12,
              padding: '2px 6px',
              fontSize: 12,
              display: 'flex',
              gap: 2,
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              zIndex: 10,
            }}>
              {msg.reactions.map((r: any, idx: number) => (
                <span key={idx}>{r.emoji}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div >
  );
};

// Компонент внутреннего сообщения
const InternalMessageBubble = ({ msg, currentUserId, onReply, replyMessage }: { msg: InternalMessage; currentUserId: number; onReply: (msg: InternalMessage) => void; replyMessage?: InternalMessage }) => {
  const isOwn = msg.sender_id === currentUserId;

  const scrollToMessage = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('highlight-message');
      setTimeout(() => element.classList.remove('highlight-message'), 2000);
    }
  };

  const renderAttachment = () => {
    const attachmentUrl = msg.attachment_url || msg.file_url;
    if (!attachmentUrl) return null;

    // Voice / Audio
    if (msg.message_type === 'voice' || attachmentUrl.endsWith('.ogg') || attachmentUrl.endsWith('.mp3')) {
      return (
        <audio
          controls
          src={attachmentUrl}
          style={{ marginTop: 8, maxWidth: '100%', borderRadius: 8 }}
        />
      );
    }

    // Video / Video Note
    if (msg.message_type === 'video' || msg.message_type === 'video_note' || attachmentUrl.endsWith('.mp4')) {
      const isRound = msg.message_type === 'video_note';
      return (
        <video
          controls
          src={attachmentUrl}
          style={{
            marginTop: 8,
            maxWidth: '100%',
            borderRadius: isRound ? '50%' : 8,
            aspectRatio: isRound ? '1/1' : 'auto',
            objectFit: 'cover',
            width: isRound ? 200 : 'auto',
            height: isRound ? 200 : 'auto'
          }}
        />
      );
    }

    // Image / Sticker
    if (msg.message_type === 'image' || msg.message_type === 'sticker' || attachmentUrl.match(/\.(jpeg|jpg|gif|png|webp)$/)) {
      return (
        <a href={attachmentUrl} target="_blank" rel="noopener noreferrer">
          <img
            src={attachmentUrl}
            alt="Attachment"
            style={{
              maxWidth: '100%',
              maxHeight: 200,
              borderRadius: 8,
              marginTop: 8,
              cursor: 'pointer',
            }}
          />
        </a>
      );
    }

    // Default: File
    return (
      <a
        href={attachmentUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 8,
          color: isOwn ? 'rgba(255,255,255,0.9)' : '#1890ff',
        }}
      >
        <PaperClipOutlined />
        <span>Скачать файл</span>
      </a>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isOwn ? 'flex-end' : 'flex-start',
        padding: '4px 0',
      }}
      onDoubleClick={() => onReply(msg)}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: isOwn ? 'row-reverse' : 'row',
          alignItems: 'flex-end',
          gap: 8,
          maxWidth: '75%',
        }}
      >
        <Tooltip title={msg.sender?.name || 'Сотрудник'}>
          <Avatar
            size={32}
            style={{
              backgroundColor: isOwn ? '#722ed1' : '#13c2c2',
              flexShrink: 0,
            }}
          >
            {(msg.sender?.name || '?')[0].toUpperCase()}
          </Avatar>
        </Tooltip>
        <div
          style={{
            background: isOwn
              ? 'linear-gradient(135deg, #722ed1 0%, #531dab 100%)'
              : 'linear-gradient(135deg, #13c2c2 0%, #08979c 100%)',
            color: 'white',
            padding: '10px 14px',
            borderRadius: isOwn ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
          }}
        >
          {!isOwn && (
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, opacity: 0.9 }}>
              {msg.sender?.name}
            </div>
          )}
          {replyMessage && (
            <div
              onClick={(e) => { e.stopPropagation(); scrollToMessage(`msg-internal-${replyMessage.id}`); }}
              style={{
                marginBottom: 4,
                padding: '4px 8px',
                borderLeft: `2px solid ${isOwn ? 'white' : '#1890ff'}`,
                backgroundColor: isOwn ? 'rgba(255, 255, 255, 0.2)' : 'rgba(24, 144, 255, 0.1)',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
                opacity: 0.9
              }}
            >
              <div style={{ fontWeight: 'bold' }}>{replyMessage.sender?.name || 'Manager'}</div>
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                {replyMessage.content || '...'}
              </div>
            </div>
          )}
          <div className="message-content" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {linkifyText(msg.content)}
          </div>
          {renderAttachment()}
          <div style={{
            fontSize: 11,
            opacity: 0.6,
            marginTop: 4,
            textAlign: 'right',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
          }}>
            <span
              onClick={(e) => { e.stopPropagation(); onReply(msg); }}
              style={{ cursor: 'pointer', opacity: 0.8, display: 'flex', alignItems: 'center' }}
              title="Ответить"
            >
              <RollbackOutlined rotate={180} />
            </span>
            {formatTime(msg.created_at)}
            {!msg.is_read && !isOwn && (
              <span style={{ marginLeft: 8, color: '#faad14' }}>●</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Основной компонент чата
const OrderChat: React.FC<OrderChatProps> = ({ orderId, contactName }) => {
  const { manager } = useAuth();
  const [activeTab, setActiveTab] = useState<ChatTab>('client');
  const [clientMessages, setClientMessages] = useState<Message[]>([]);
  const [internalMessages, setInternalMessages] = useState<InternalMessage[]>([]);
  const [chatLeadId, setChatLeadId] = useState<string | undefined>();
  const [externalId, setExternalId] = useState<string | undefined>();
  const [mainId, setMainId] = useState<string | undefined>();
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | InternalMessage | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Загрузка сообщений
  const fetchClientMessages = useCallback(async () => {
    try {
      setLoading(true);
      const response = await orderMessagesAPI.getClientMessages(orderId);
      setClientMessages(response.messages);
      setChatLeadId(response.chatLeadId);
      setExternalId(response.externalId);
      setMainId(response.mainId);
    } catch (error) {
      console.error('Error fetching client messages:', error);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const fetchInternalMessages = useCallback(async () => {
    try {
      const response = await orderMessagesAPI.getInternalMessages(orderId);
      setInternalMessages(response.messages);

      // Отмечаем как прочитанные
      if (response.messages.length > 0) {
        await orderMessagesAPI.markAsRead(orderId);
      }
    } catch (error) {
      console.error('Error fetching internal messages:', error);
    }
  }, [orderId]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await orderMessagesAPI.getUnreadCount(orderId);
      setUnreadCount(response.count);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  }, [orderId]);

  // Socket.IO подключение
  useEffect(() => {
    const socketUrl = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';
    socketRef.current = io(socketUrl, {
      transports: ['websocket', 'polling'],
    });

    socketRef.current.on('connect', () => {
      socketRef.current?.emit('join_order', orderId.toString());
    });

    socketRef.current.on('new_client_message', (msg: Message) => {
      setClientMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    socketRef.current.on('message_updated', (msg: Message) => {
      setClientMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m));
    });

    socketRef.current.on('new_internal_message', (msg: InternalMessage) => {
      setInternalMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      if (msg.sender_id !== manager?.id) {
        setUnreadCount(prev => prev + 1);
      }
    });

    // Также слушаем сообщения из Bubble
    socketRef.current.on('new_message_bubble', (msg: Message) => {
      // Проверяем, относится ли сообщение к нашей заявке
      // 1. По main_id (Highest priority linked key)
      const matchesMainId = mainId && msg.main_id && String(msg.main_id) === String(mainId);
      // 2. По lead_id (Telegram or Legacy Bubble)
      const matchesLeadId = chatLeadId && msg.lead_id && String(msg.lead_id) === String(chatLeadId);
      // 3. По external_id (Old Bubble logic)
      const matchesExternalId = externalId && msg.lead_id && String(msg.lead_id) === String(externalId);

      if (matchesMainId || matchesLeadId || matchesExternalId) {
        setClientMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    });

    return () => {
      socketRef.current?.emit('leave_order', orderId.toString());
      socketRef.current?.disconnect();
    };
  }, [orderId, manager?.id, chatLeadId, externalId, mainId]);

  // Загрузка данных при монтировании
  useEffect(() => {
    fetchClientMessages();
    fetchInternalMessages();
    fetchUnreadCount();
  }, [fetchClientMessages, fetchInternalMessages, fetchUnreadCount]);

  // Скролл при новых сообщениях
  useEffect(() => {
    scrollToBottom();
  }, [clientMessages, internalMessages, scrollToBottom]);

  // При переключении на внутренний чат - отмечаем прочитанными
  useEffect(() => {
    if (activeTab === 'internal') {
      orderMessagesAPI.markAsRead(orderId).then(() => {
        setUnreadCount(0);
      });
    }
  }, [activeTab, orderId]);

  // Отправка сообщения
  const handleSend = async () => {
    if (!messageText.trim() || sending) return;

    setSending(true);
    try {
      if (activeTab === 'client') {
        const replyId = replyTo && 'message_id_tg' in replyTo ? replyTo.message_id_tg as number : undefined;
        const newMsg = await orderMessagesAPI.sendClientMessage(orderId, messageText.trim(), replyId);
        setClientMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      } else {
        const replyId = replyTo && 'id' in replyTo && !('message_id_tg' in replyTo) ? (replyTo as InternalMessage).id : undefined;
        const newMsg = await orderMessagesAPI.sendInternalMessage(orderId, messageText.trim(), replyId);
        setInternalMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }
      setMessageText('');
      setReplyTo(null);
    } catch (error: any) {
      antMessage.error(error.response?.data?.error || 'Ошибка отправки сообщения');
    } finally {
      setSending(false);
    }
  };

  // Отправка файла
  const handleFileUpload = async (file: File) => {
    setSending(true);
    try {
      if (activeTab === 'client') {
        const replyId = replyTo && 'message_id_tg' in replyTo ? replyTo.message_id_tg as number : undefined;
        const newMsg = await orderMessagesAPI.sendClientFile(orderId, file, undefined, replyId);
        setClientMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      } else {
        const replyId = replyTo && 'id' in replyTo && !('message_id_tg' in replyTo) ? (replyTo as InternalMessage).id : undefined;
        const newMsg = await orderMessagesAPI.sendInternalFile(orderId, file, replyId);
        setInternalMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }
      setReplyTo(null);
    } catch (error: any) {
      antMessage.error(error.response?.data?.error || 'Ошибка отправки файла');
    } finally {
      setSending(false);
    }
    return false;
  };

  // Запись голосового
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/ogg' });
        stream.getTracks().forEach(track => track.stop());

        // Отправляем голосовое
        if (activeTab === 'client') {
          const replyId = replyTo && 'message_id_tg' in replyTo ? replyTo.message_id_tg as number : undefined;
          try {
            const newMsg = await orderMessagesAPI.sendClientVoice(orderId, audioBlob, undefined, replyId);
            setClientMessages(prev => [...prev, newMsg]);
            setReplyTo(null);
          } catch (error: any) {
            antMessage.error(error.response?.data?.error || 'Ошибка отправки голосового');
          }
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      antMessage.error('Не удалось получить доступ к микрофону');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Группировка сообщений по дате
  const groupMessagesByDate = <T extends { created_at?: string; 'Created Date'?: string }>(messages: T[]) => {
    const groups: { date: string; messages: T[] }[] = [];
    let currentDate = '';

    messages.forEach(msg => {
      const msgDate = formatDate(msg.created_at || msg['Created Date']);
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });

    return groups;
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#fff',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      {/* Заголовок с табами */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '12px 16px',
      }}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as ChatTab)}
          style={{ marginBottom: 0 }}
          items={[
            {
              key: 'client',
              label: (
                <span style={{ color: activeTab === 'client' ? '#fff' : 'rgba(255,255,255,0.7)' }}>
                  <UserOutlined style={{ marginRight: 8 }} />
                  {contactName || 'Клиент'}
                </span>
              ),
            },
            {
              key: 'internal',
              label: (
                <Badge count={unreadCount} size="small" offset={[10, 0]}>
                  <span style={{ color: activeTab === 'internal' ? '#fff' : 'rgba(255,255,255,0.7)' }}>
                    <TeamOutlined style={{ marginRight: 8 }} />
                    Внутренний чат
                  </span>
                </Badge>
              ),
            },
          ]}
        />
      </div>

      {/* Область сообщений */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        background: 'linear-gradient(180deg, #f8f9fa 0%, #fff 100%)',
      }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spin size="large" />
          </div>
        ) : activeTab === 'client' ? (
          clientMessages.length === 0 ? (
            <Empty
              description="Нет сообщений"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ marginTop: 60 }}
            />
          ) : (
            groupMessagesByDate(clientMessages).map((group, gi) => (
              <div key={gi}>
                <div style={{
                  textAlign: 'center',
                  margin: '16px 0',
                }}>
                  <span style={{
                    background: 'rgba(0,0,0,0.06)',
                    padding: '4px 12px',
                    borderRadius: 12,
                    fontSize: 12,
                    color: '#8c8c8c',
                  }}>
                    {group.date}
                  </span>
                </div>
                {group.messages.map(msg => (
                  <ClientMessageBubble
                    key={msg.id}
                    msg={msg}
                    currentUserId={manager?.id || 0}
                    onReply={(m) => setReplyTo(m)}
                    replyMessage={msg.reply_to_mess_id_tg ? clientMessages.find(m => m.message_id_tg === msg.reply_to_mess_id_tg) : undefined}
                  />
                ))}
              </div>
            ))
          )
        ) : (
          internalMessages.length === 0 ? (
            <Empty
              description="Нет внутренних сообщений"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ marginTop: 60 }}
            />
          ) : (
            groupMessagesByDate(internalMessages).map((group, gi) => (
              <div key={gi}>
                <div style={{
                  textAlign: 'center',
                  margin: '16px 0',
                }}>
                  <span style={{
                    background: 'rgba(0,0,0,0.06)',
                    padding: '4px 12px',
                    borderRadius: 12,
                    fontSize: 12,
                    color: '#8c8c8c',
                  }}>
                    {group.date}
                  </span>
                </div>
                {group.messages.map(msg => (
                  <InternalMessageBubble
                    key={msg.id}
                    msg={msg}
                    currentUserId={manager?.id || 0}
                    onReply={(m) => setReplyTo(m)}
                    replyMessage={msg.reply_to_id ? internalMessages.find(m => m.id === msg.reply_to_id) : undefined}
                  />
                ))}
              </div>
            ))
          )
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div style={{
          padding: '8px 16px',
          background: '#f0f5ff',
          borderTop: '1px solid #d6e4ff',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            flex: 1,
            borderLeft: '3px solid #1890ff',
            paddingLeft: 12,
          }}>
            <div style={{ fontSize: 12, color: '#1890ff', fontWeight: 500 }}>
              Ответ на сообщение
            </div>
            <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#595959' }}>
              {replyTo.content.substring(0, 50)}
            </div>
          </div>
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={() => setReplyTo(null)}
          />
        </div>
      )}

      {/* Ввод сообщения */}
      <div style={{
        padding: '12px 16px',
        background: '#fff',
        borderTop: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'flex-end',
        gap: 12,
      }}>
        <Upload
          showUploadList={false}
          beforeUpload={(file) => handleFileUpload(file)}
        >
          <Button icon={<PaperClipOutlined />} shape="circle" disabled={sending} />
        </Upload>

        <TextArea
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          placeholder={activeTab === 'client' ? "Сообщение клиенту" : "Внутренний комментарий"}
          autoSize={{ minRows: 1, maxRows: 4 }}
          onKeyDown={handleKeyPress}
          disabled={sending}
          style={{
            borderRadius: 8,
            resize: 'none',
          }}
        />

        {activeTab === 'client' ? (
          isRecording ? (
            <Button
              danger
              type="primary"
              shape="circle"
              icon={<PauseCircleOutlined />}
              onClick={stopRecording}
            />
          ) : (
            <Button
              icon={<AudioOutlined />}
              shape="circle"
              onClick={startRecording}
              disabled={sending || !!messageText}
            />
          )
        ) : null}

        <Button
          type="primary"
          icon={sending ? <ReloadOutlined spin /> : <SendOutlined />}
          onClick={handleSend}
          disabled={!messageText.trim() && !sending}
          shape="circle"
        />
      </div>
    </div>
  );
};

export default OrderChat;
