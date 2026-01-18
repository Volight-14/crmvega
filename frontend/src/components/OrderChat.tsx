import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Tabs,
  Badge,
  Spin,
  Empty,
  message as antMessage,
} from 'antd';
import {
  UserOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Message, InternalMessage } from '../types';
import { orderMessagesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import io from 'socket.io-client';
import { UnifiedMessageBubble } from './UnifiedMessageBubble';
import { ChatInput } from './ChatInput';
import { formatDate, isClientMessage } from '../utils/chatUtils';

interface OrderChatProps {
  orderId: number;
  contactName?: string;
}

type ChatTab = 'client' | 'internal';

// Adapter to make InternalMessage look like Message for the bubble component
const adaptInternalToMessage = (im: InternalMessage): Message => {
  return {
    id: im.id,
    lead_id: String(im.order_id),
    author_type: 'manager', // Generic
    content: im.content,
    message_type: im.message_type || im.attachment_type || 'text',
    created_at: im.created_at,
    sender: im.sender,
    file_url: im.attachment_url || im.file_url,
    file_name: im.attachment_name,
    // Map other fields if necessary
  } as Message;
};

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

  // Reply state
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  // Fetching logic
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

  // Socket
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

    // Bubble sync logic
    socketRef.current.on('new_message_bubble', (msg: Message) => {
      const matchesMainId = mainId && msg.main_id && String(msg.main_id) === String(mainId);
      const matchesLeadId = chatLeadId && msg.lead_id && String(msg.lead_id) === String(chatLeadId);
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

  useEffect(() => {
    fetchClientMessages();
    fetchInternalMessages();
    fetchUnreadCount();
  }, [fetchClientMessages, fetchInternalMessages, fetchUnreadCount]);

  useEffect(() => {
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientMessages.length, internalMessages.length, activeTab]);

  useEffect(() => {
    if (activeTab === 'internal') {
      orderMessagesAPI.markAsRead(orderId).then(() => setUnreadCount(0));
    }
  }, [activeTab, orderId]);

  const handleSendText = async (text: string) => {
    if (sending) return;
    setSending(true);
    try {
      if (activeTab === 'client') {
        const replyId = replyTo && 'message_id_tg' in replyTo ? replyTo.message_id_tg as number : undefined;
        const newMsg = await orderMessagesAPI.sendClientMessage(orderId, text, replyId);
        setClientMessages(prev => [...prev, newMsg]);
      } else {
        const replyId = replyTo ? replyTo.id : undefined;
        const newMsg = await orderMessagesAPI.sendInternalMessage(orderId, text, replyId);
        setInternalMessages(prev => [...prev, newMsg]);
      }
      setReplyTo(null);
      scrollToBottom();
    } catch (error) {
      console.error('Error sending message:', error);
      antMessage.error('Ошибка отправки');
    } finally {
      setSending(false);
    }
  };

  const handleSendVoice = async (voice: Blob, duration: number) => {
    if (sending) return;
    setSending(true);
    try {
      if (activeTab === 'client') {
        // Client Chat Voice
        const newMsg = await orderMessagesAPI.sendClientVoice(orderId, voice, duration);
        setClientMessages(prev => [...prev, newMsg]);
      } else {
        // Internal Chat Voice
        const newMsg = await orderMessagesAPI.sendInternalVoice(orderId, voice, duration);
        setInternalMessages(prev => [...prev, newMsg]);
      }
      setReplyTo(null);
      scrollToBottom();
    } catch (error) {
      console.error('Error sending voice:', error);
      antMessage.error('Ошибка отправки голосового');
    } finally {
      setSending(false);
    }
  };

  const handleSendFile = async (file: File) => {
    if (sending) return;
    setSending(true);
    try {
      if (activeTab === 'client') {
        const replyId = replyTo && 'message_id_tg' in replyTo ? replyTo.message_id_tg as number : undefined;
        // Caption currently undefined
        const newMsg = await orderMessagesAPI.sendClientFile(orderId, file, undefined, replyId);
        setClientMessages(prev => [...prev, newMsg]);
      } else {
        const replyId = replyTo ? replyTo.id : undefined;
        const newMsg = await orderMessagesAPI.sendInternalFile(orderId, file, replyId);
        setInternalMessages(prev => [...prev, newMsg]);
      }
      setReplyTo(null);
      scrollToBottom();
    } catch (error) {
      console.error('Error sending file:', error);
      antMessage.error('Ошибка отправки файла');
    } finally {
      setSending(false);
    }
  };

  // Rendering
  const items = [
    {
      key: 'client',
      label: (
        <span>
          <UserOutlined />
          Клиент ({contactName || 'Client'})
        </span>
      ),
    },
    {
      key: 'internal',
      label: (
        <span>
          <TeamOutlined />
          Внутренний чат
          {unreadCount > 0 && <Badge count={unreadCount} style={{ marginLeft: 8 }} />}
        </span>
      ),
    },
  ];

  const renderMessages = () => {
    if (activeTab === 'client') {
      if (loading && clientMessages.length === 0) return <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>;
      if (clientMessages.length === 0) return <Empty description="Нет сообщений" />;

      const groupedMessages: { date: string, msgs: Message[] }[] = [];
      clientMessages.forEach(msg => {
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
          <div style={{ textAlign: 'center', margin: '16px 0', opacity: 0.5, fontSize: 12 }}>
            <span style={{ background: '#f5f5f5', padding: '4px 12px', borderRadius: 12 }}>{group.date}</span>
          </div>
          {group.msgs.map(msg => {
            const isOwn = !isClientMessage(msg.author_type);
            // Find reply message context if needed
            // Note: OrderChat previously passed replyMessage object. 
            // Simplified here: UnifiedMessageBubble can display reply context if we pass it.
            const replyCtx = msg.reply_to_mess_id_tg
              ? clientMessages.find(m => m.message_id_tg === msg.reply_to_mess_id_tg)
              : undefined;

            return (
              <UnifiedMessageBubble
                key={msg.id}
                msg={msg}
                isOwn={isOwn}
                onReply={(m) => setReplyTo(m)}
                replyMessage={replyCtx}
                variant="client"
              // alignment defaults: Client=Left, Team=Right
              />
            );
          })}
        </div>
      ));
    } else {
      if (loading && internalMessages.length === 0) return <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>;
      if (internalMessages.length === 0) return <Empty description="Нет внутренних сообщений" />;

      const groupedMessages: { date: string, msgs: InternalMessage[] }[] = [];
      internalMessages.forEach(msg => {
        const dateKey = formatDate(msg.created_at);
        const lastGroup = groupedMessages[groupedMessages.length - 1];
        if (lastGroup && lastGroup.date === dateKey) {
          lastGroup.msgs.push(msg);
        } else {
          groupedMessages.push({ date: dateKey, msgs: [msg] });
        }
      });

      return groupedMessages.map(group => (
        <div key={group.date}>
          <div style={{ textAlign: 'center', margin: '16px 0', opacity: 0.5, fontSize: 12 }}>
            <span style={{ background: '#f5f5f5', padding: '4px 12px', borderRadius: 12 }}>{group.date}</span>
          </div>
          {group.msgs.map(msg => {
            const isOwn = msg.sender_id === manager?.id;
            const adaptedMsg = adaptInternalToMessage(msg);
            const replyCtxInternal = msg.reply_to_id
              ? internalMessages.find(m => m.id === msg.reply_to_id)
              : undefined;
            const replyCtx = replyCtxInternal ? adaptInternalToMessage(replyCtxInternal) : undefined;

            return (
              <UnifiedMessageBubble
                key={msg.id}
                msg={adaptedMsg}
                isOwn={isOwn}
                onReply={() => setReplyTo(adaptedMsg)}
                replyMessage={replyCtx}
                variant="internal"
                alignment={isOwn ? 'right' : 'left'}
              />
            );
          })}
        </div>
      ));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0' }}>
      <div style={{ padding: '0 16px', borderBottom: '1px solid #f0f0f0' }}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key as ChatTab);
            setReplyTo(null);
          }}
          items={items}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {renderMessages()}
        <div ref={messagesEndRef} />
      </div>

      {replyTo && (
        <div style={{
          padding: '8px 16px',
          background: '#f9f9f9',
          borderTop: '1px solid #f0f0f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 12
        }}>
          <div>
            Ответ на: <b>{replyTo.author_type || (replyTo as any).sender?.name}</b>
            <div style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#888' }}>
              {replyTo.content || 'Вложение'}
            </div>
          </div>
          <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: '#1890ff', cursor: 'pointer', padding: 0 }}>Отмена</button>
        </div>
      )}

      <ChatInput
        onSendText={handleSendText}
        onSendVoice={handleSendVoice}
        onSendFile={handleSendFile}
        sending={sending}
      />
    </div>
  );

};

export default OrderChat;
