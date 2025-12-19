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
  PlayCircleOutlined,
  PauseCircleOutlined,
  UserOutlined,
  TeamOutlined,
  ReloadOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { Message, InternalMessage, Manager } from '../types';
import { dealMessagesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import io from 'socket.io-client';

const { TextArea } = Input;

interface DealChatProps {
  dealId: number;
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

// Компонент сообщения клиента
const ClientMessageBubble: React.FC<{
  msg: Message;
  onReply: (msg: Message) => void;
}> = ({ msg, onReply }) => {
  const isFromClient = isClientMessage(msg.author_type);
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

  const renderContent = () => {
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
            {msg.voice_duration && (
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                {Math.floor(msg.voice_duration / 60)}:{(msg.voice_duration % 60).toString().padStart(2, '0')}
              </span>
            )}
          </div>
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
            {msg.caption && <div style={{ marginTop: 8 }}>{msg.caption}</div>}
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

    return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</div>;
  };

  return (
    <div
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
            padding: '10px 14px',
            borderRadius: isFromClient ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            position: 'relative',
          }}
        >
          {msg.reply_to_mess_id_tg && (
            <div style={{
              fontSize: 11,
              opacity: 0.7,
              borderLeft: `2px solid ${isFromClient ? '#1890ff' : 'rgba(255,255,255,0.5)'}`,
              paddingLeft: 8,
              marginBottom: 6,
            }}>
              ↩️ Ответ на сообщение
            </div>
          )}
          {renderContent()}
          <div style={{
            fontSize: 11,
            opacity: 0.6,
            marginTop: 4,
            textAlign: 'right',
          }}>
            {msg.user && <span style={{ marginRight: 8 }}>{msg.user}</span>}
            {formatTime(msg['Created Date'] || msg.created_at || msg.timestamp)}
          </div>
        </div>
      </div>
    </div>
  );
};

// Компонент внутреннего сообщения
const InternalMessageBubble: React.FC<{
  msg: InternalMessage;
  currentUserId: number;
  onReply: (msg: InternalMessage) => void;
}> = ({ msg, currentUserId, onReply }) => {
  const isOwn = msg.sender_id === currentUserId;

  const renderAttachment = () => {
    if (!msg.attachment_url) return null;

    if (msg.attachment_type === 'image') {
      return (
        <img
          src={msg.attachment_url}
          alt={msg.attachment_name || 'Image'}
          style={{
            maxWidth: '100%',
            maxHeight: 200,
            borderRadius: 8,
            marginTop: 8,
            cursor: 'pointer',
          }}
          onClick={() => window.open(msg.attachment_url, '_blank')}
        />
      );
    }

    return (
      <a
        href={msg.attachment_url}
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
        <FileOutlined />
        <span>{msg.attachment_name || 'Файл'}</span>
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
          {msg.reply_to && (
            <div style={{
              fontSize: 11,
              opacity: 0.7,
              borderLeft: '2px solid rgba(255,255,255,0.5)',
              paddingLeft: 8,
              marginBottom: 6,
            }}>
              ↩️ {msg.reply_to.sender?.name}: {msg.reply_to.content.substring(0, 50)}...
            </div>
          )}
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {msg.content}
          </div>
          {renderAttachment()}
          <div style={{
            fontSize: 11,
            opacity: 0.6,
            marginTop: 4,
            textAlign: 'right',
          }}>
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
const DealChat: React.FC<DealChatProps> = ({ dealId, contactName }) => {
  const { manager } = useAuth();
  const [activeTab, setActiveTab] = useState<ChatTab>('client');
  const [clientMessages, setClientMessages] = useState<Message[]>([]);
  const [internalMessages, setInternalMessages] = useState<InternalMessage[]>([]);
  const [chatLeadId, setChatLeadId] = useState<string | null>(null);
  const [externalId, setExternalId] = useState<string | null>(null);
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
      const response = await dealMessagesAPI.getClientMessages(dealId);
      setClientMessages(response.messages);
      setChatLeadId(response.chatLeadId || null);
      setExternalId(response.externalId || null);
    } catch (error) {
      console.error('Error fetching client messages:', error);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  const fetchInternalMessages = useCallback(async () => {
    try {
      const response = await dealMessagesAPI.getInternalMessages(dealId);
      setInternalMessages(response.messages);

      // Отмечаем как прочитанные
      if (response.messages.length > 0) {
        await dealMessagesAPI.markAsRead(dealId);
      }
    } catch (error) {
      console.error('Error fetching internal messages:', error);
    }
  }, [dealId]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await dealMessagesAPI.getUnreadCount(dealId);
      setUnreadCount(response.count);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  }, [dealId]);

  // Socket.IO подключение
  useEffect(() => {
    const socketUrl = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';
    socketRef.current = io(socketUrl, {
      transports: ['websocket', 'polling'],
    });

    socketRef.current.on('connect', () => {
      socketRef.current?.emit('join_deal', dealId.toString());
    });

    socketRef.current.on('new_client_message', (msg: Message) => {
      setClientMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
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
      // Проверяем, относится ли сообщение к нашей сделке
      // Сообщение подходит, если его lead_id совпадает с chatLeadId или externalId сделки
      if ((chatLeadId && msg.lead_id === chatLeadId) || (externalId && msg.lead_id === externalId)) {
        setClientMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    });

    return () => {
      socketRef.current?.emit('leave_deal', dealId.toString());
      socketRef.current?.disconnect();
    };
  }, [dealId, manager?.id, chatLeadId, externalId]);

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
      dealMessagesAPI.markAsRead(dealId).then(() => {
        setUnreadCount(0);
      });
    }
  }, [activeTab, dealId]);

  // Отправка сообщения
  const handleSend = async () => {
    if (!messageText.trim() || sending) return;

    setSending(true);
    try {
      if (activeTab === 'client') {
        const replyId = replyTo && 'message_id_tg' in replyTo ? replyTo.message_id_tg as number : undefined;
        const newMsg = await dealMessagesAPI.sendClientMessage(dealId, messageText.trim(), replyId);
        setClientMessages(prev => [...prev, newMsg]);
      } else {
        const replyId = replyTo && 'id' in replyTo && !('message_id_tg' in replyTo) ? (replyTo as InternalMessage).id : undefined;
        const newMsg = await dealMessagesAPI.sendInternalMessage(dealId, messageText.trim(), replyId);
        setInternalMessages(prev => [...prev, newMsg]);
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
        const newMsg = await dealMessagesAPI.sendClientFile(dealId, file, undefined, replyId);
        setClientMessages(prev => [...prev, newMsg]);
      } else {
        const replyId = replyTo && 'id' in replyTo && !('message_id_tg' in replyTo) ? (replyTo as InternalMessage).id : undefined;
        const newMsg = await dealMessagesAPI.sendInternalFile(dealId, file, replyId);
        setInternalMessages(prev => [...prev, newMsg]);
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
            const newMsg = await dealMessagesAPI.sendClientVoice(dealId, audioBlob, undefined, replyId);
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
                    onReply={(m) => setReplyTo(m)}
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
            <div style={{ fontSize: 13, color: '#595959', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {replyTo.content.substring(0, 100)}
            </div>
          </div>
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={() => setReplyTo(null)}
            size="small"
          />
        </div>
      )}

      {/* Поле ввода */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #f0f0f0',
        background: '#fff',
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
      }}>
        <Upload
          showUploadList={false}
          beforeUpload={handleFileUpload}
          disabled={sending}
        >
          <Tooltip title="Прикрепить файл">
            <Button
              icon={<PaperClipOutlined />}
              shape="circle"
              disabled={sending}
              style={{ flexShrink: 0 }}
            />
          </Tooltip>
        </Upload>

        {activeTab === 'client' && (
          <Tooltip title={isRecording ? 'Остановить запись' : 'Голосовое сообщение'}>
            <Button
              icon={<AudioOutlined />}
              shape="circle"
              danger={isRecording}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={sending}
              style={{ flexShrink: 0 }}
            />
          </Tooltip>
        )}

        <TextArea
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={activeTab === 'client' ? 'Сообщение клиенту...' : 'Внутреннее сообщение...'}
          autoSize={{ minRows: 1, maxRows: 4 }}
          style={{
            flex: 1,
            borderRadius: 20,
            resize: 'none',
          }}
          disabled={sending || isRecording}
        />

        <Tooltip title="Обновить">
          <Button
            icon={<ReloadOutlined />}
            shape="circle"
            onClick={() => activeTab === 'client' ? fetchClientMessages() : fetchInternalMessages()}
            loading={loading}
            style={{ flexShrink: 0 }}
          />
        </Tooltip>

        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={sending}
          disabled={!messageText.trim() || isRecording}
          style={{
            borderRadius: 20,
            paddingLeft: 20,
            paddingRight: 20,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none',
          }}
        >
          Отправить
        </Button>
      </div>
    </div>
  );
};

export default DealChat;

