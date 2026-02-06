import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Spin,
  Empty,
  message as antMessage,
  Switch,
  Tooltip,
} from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  LockOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { Message, Order } from '../types';
import { orderMessagesAPI, messagesAPI, ordersAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import io from 'socket.io-client';
import { UnifiedMessageBubble } from './UnifiedMessageBubble';
import { ChatInput } from './ChatInput';
import { formatDate, isClientMessage } from '../utils/chatUtils';

interface OrderChatProps {
  orderId: number;
  mainId?: number | string;
  contactName?: string;
  isMobile?: boolean;
}

// Extended interface for the unified timeline
interface TimelineMessage extends Message {
  source_type?: 'client' | 'internal';
  sort_date?: string;
  is_system?: boolean;
  display_author?: string;
}

const OrderChat: React.FC<OrderChatProps> = ({ orderId, mainId: propMainId, contactName, isMobile = false }) => {
  const { manager } = useAuth();

  // State for merged timeline
  const [messages, setMessages] = useState<TimelineMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Input mode: 'client' (default) or 'internal'
  const [inputMode, setInputMode] = useState<'client' | 'internal'>('client');

  const [sending, setSending] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [mainId, setMainId] = useState<string | undefined>(propMainId ? String(propMainId) : undefined);

  // Reply state
  const [replyTo, setReplyTo] = useState<TimelineMessage | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  }, []);

  const fetchOrder = useCallback(async () => {
    try {
      const targetId = propMainId || mainId || orderId;
      const data = await ordersAPI.getById(Number(targetId));
      setOrder(data);
      if (data.main_id) setMainId(String(data.main_id));
    } catch (e) {
      console.error('Failed to fetch order in chat', e);
    }
  }, [orderId, mainId, propMainId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const replacements: Record<string, string> = order ? {
    '[Клиент отдает]': order.SumInput != null ? String(order.SumInput) : '',
    '[Отдает в валюте]': order.CurrPair1 || '',
    '[Отправляет из банка]': order.BankRus01 || order.BankEsp || '',
    '[Город РФ где отдает]': order.CityRus01 || order.CityEsp01 || '',
    '[Сеть с какой отправляет USDT]': order.NetworkUSDT01 || '',
    '[Оплата сейчас или при встрече?]': order.PayNow || '',
    '[Клиент получает]': order.SumOutput != null ? String(order.SumOutput) : ''
  } : {};

  // Fetching logic (Timeline)
  const fetchTimeline = useCallback(async (loadMore = false) => {
    try {
      if (!loadMore) setLoading(true);
      else setLoadingMore(true);

      const limit = 50;
      // If loading more, find the oldest message date
      let before: string | undefined = undefined;

      if (loadMore && messages.length > 0) {
        // Find oldest sort_date
        const oldest = messages[messages.length - 1];
        before = oldest.sort_date || oldest.created_at || oldest['Created Date'];
      }

      const response = await orderMessagesAPI.getTimeline(orderId, { limit, before });

      // Cast response to TimelineMessage
      const fetched = response.messages as TimelineMessage[];

      if (loadMore) {
        setMessages(prev => {
          // Avoid duplicates just in case
          const existingIds = new Set(prev.map(m => m.id + '_' + (m.source_type || 'c')));
          const newMsgs = fetched.filter(m => !existingIds.has(m.id + '_' + (m.source_type || 'c')));
          return [...prev, ...newMsgs];
        });
      } else {
        setMessages(fetched);
        // On initial load, mark internal read
        orderMessagesAPI.markAsRead(orderId);
      }

      setHasMore(response.meta.has_more);

    } catch (error) {
      console.error('Error fetching timeline:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, messages.length]); // depend on length for pagination cursor

  // Initial load
  useEffect(() => {
    fetchTimeline(false);
    // Mark client messages as read when chat opens
    orderMessagesAPI.markClientMessagesAsRead(orderId).catch(err =>
      console.error('Failed to mark client messages read on chat open:', err)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!loading && !loadingMore && messages.length > 0) {
      // Only scroll if we are not manually scrolling up (e.g. init)
      // For simple UX, let's scroll bottom on first load.
      if (messages.length <= 50) scrollToBottom();
    }
  }, [loading, scrollToBottom, messages.length, loadingMore]);


  // Socket
  useEffect(() => {
    const socketUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';
    socketRef.current = io(socketUrl, {
      transports: ['websocket', 'polling'],
    });

    socketRef.current.on('connect', () => {
      socketRef.current?.emit('join_order', orderId.toString());
      if (mainId) socketRef.current?.emit('join_lead', mainId);
    });

    if (socketRef.current.connected && mainId) {
      socketRef.current.emit('join_lead', mainId);
    }

    const handleNewMessage = (msg: TimelineMessage) => {
      // Determine if duplicate
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id && m.source_type === msg.source_type)) return prev;
        // Prepend or Append?
        // Our list is ordered DESC (Newest first) ? 
        // Wait, usually chat UI is Newest at Bottom.
        // Backend returns DESC (Newest first).
        // Frontend usually renders ASC (Oldest first).
        // Let's check render logic.
        // If I render via `messages.slice().reverse().map...` then items are top to bottom.
        // Let's assume `messages` state is DESC (Newest at index 0).
        return [msg, ...prev];
      });
      scrollToBottom();
    };

    socketRef.current.on('new_client_message', (msg: Message) => {
      // Validate if message belongs to this order context (by main_id)
      const matchesMainId = mainId && msg.main_id && String(msg.main_id) === String(mainId);

      // If we don't have mainId yet, or strict match fails, we shouldn't show it to avoid "ghost" messages
      if (matchesMainId) {
        handleNewMessage({ ...msg, source_type: 'client', sort_date: msg['Created Date'], display_author: 'Клиент' });
      }
    });

    socketRef.current.on('new_internal_message', (msg: any) => {
      // Internal messages have explicit order_id
      if (msg.order_id && Number(msg.order_id) === Number(orderId)) {
        handleNewMessage({
          ...msg,
          source_type: 'internal',
          sort_date: msg.created_at,
          is_system: msg.attachment_type === 'system',
          display_author: msg.sender?.name || 'Система',
          author_type: msg.sender?.name || 'Manager' // Ensure avatar works
        });
      }
    });

    // Bubble sync
    socketRef.current.on('new_message_bubble', (msg: Message) => {
      const matchesMainId = mainId && msg.main_id && String(msg.main_id) === String(mainId);
      if (matchesMainId) {
        handleNewMessage({ ...msg, source_type: 'client', sort_date: msg['Created Date'], display_author: 'Клиент' });
      }
    });

    socketRef.current.on('message_updated', (updatedMsg: Message) => {
      setMessages(prev => prev.map(m => {
        if (Number(m.id) === Number(updatedMsg.id)) {
          // Preserve local props. Protect content.
          // If updatedMsg key is missing or null, keep old one?
          // Usually updates are full replacements.
          // But if reaction update somehow stripped content, we want to be safe.
          const newContent = updatedMsg.content !== undefined ? updatedMsg.content : m.content;

          return {
            ...m,
            ...updatedMsg,
            content: newContent,
            reactions: updatedMsg.reactions
          };
        }
        return m;
      }));
    });

    return () => {
      socketRef.current?.emit('leave_order', orderId.toString());
      socketRef.current?.disconnect();
    };
  }, [orderId, manager?.id, mainId, scrollToBottom]);


  // Actions
  const handleSendText = async (text: string) => {
    if (sending) return;
    setSending(true);
    try {
      if (inputMode === 'client') {
        const replyId = replyTo && 'message_id_tg' in replyTo ? replyTo.message_id_tg as number : undefined;
        await orderMessagesAPI.sendClientMessage(orderId, text, replyId);
      } else {
        const replyId = replyTo ? replyTo.id : undefined;
        await orderMessagesAPI.sendInternalMessage(orderId, text, replyId);
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
      // Voice always to desired channel
      if (inputMode === 'client') {
        await orderMessagesAPI.sendClientVoice(orderId, voice, duration);
      } else {
        await orderMessagesAPI.sendInternalVoice(orderId, voice, duration);
      }
      scrollToBottom();
    } catch (error) {
      console.error('Error sending voice:', error);
      antMessage.error('Ошибка отправки голосового');
    } finally {
      setSending(false);
    }
  };

  const handleSendFile = async (file: File, caption?: string) => {
    if (sending) return;
    setSending(true);
    try {
      if (inputMode === 'client') {
        const replyId = replyTo && 'message_id_tg' in replyTo ? replyTo.message_id_tg as number : undefined;
        await orderMessagesAPI.sendClientFile(orderId, file, caption, replyId);
      } else {
        const replyId = replyTo ? replyTo.id : undefined;
        await orderMessagesAPI.sendInternalFile(orderId, file, replyId);
        if (caption) {
          await orderMessagesAPI.sendInternalMessage(orderId, caption, replyId);
        }
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

  const handleAddReaction = async (msg: Message, emoji: string) => {
    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id === msg.id) {
        const currentReactions = m.reactions || [];
        // Remove my existing reaction
        const otherReactions = currentReactions.filter(r => r.author_id !== manager?.id);
        const myExistingReaction = currentReactions.find(r => r.author_id === manager?.id);

        let newReactions = [...otherReactions];

        // If I clicked a DIFFERENT emoji, add it. If SAME, leave it removed (toggle off).
        if (myExistingReaction?.emoji !== emoji) {
          newReactions.push({
            emoji,
            author: manager?.name || 'Me',
            author_id: manager?.id,
            created_at: new Date().toISOString()
          });
        }

        return { ...m, reactions: newReactions };
      }
      return m;
    }));

    try {
      await messagesAPI.addReaction(msg.id, emoji);
    } catch (error) {
      console.error('Error adding reaction:', error);
      // Rollback could be added here if needed, but rarely necessary for reactions
      antMessage.error('Не удалось отправить реакцию');
    }
  };

  // --- Rendering ---

  const renderList = () => {
    // Messages are DESC (Newest first). We need to reverse for display (Oldest at top).
    const displayList = [...messages].reverse();

    const groupedMessages: { date: string, msgs: TimelineMessage[] }[] = [];
    displayList.forEach(msg => {
      const d = msg.sort_date || msg['Created Date'] || msg.created_at;
      const dateKey = formatDate(d);
      const lastGroup = groupedMessages[groupedMessages.length - 1];
      if (lastGroup && lastGroup.date === dateKey) {
        lastGroup.msgs.push(msg);
      } else {
        groupedMessages.push({ date: dateKey, msgs: [msg] });
      }
    });

    return (
      <>
        {hasMore && (
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <button
              onClick={() => fetchTimeline(true)}
              disabled={loadingMore}
              style={{
                background: 'none',
                border: 'none',
                color: '#1890ff',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: '13px'
              }}
            >
              {loadingMore ? 'Загрузка...' : 'Загрузить предыдущие'}
            </button>
          </div>
        )}

        {groupedMessages.map(group => (
          <div key={group.date}>
            <div style={{ textAlign: 'center', margin: '16px 0', opacity: 0.5, fontSize: 12 }}>
              <span style={{ background: '#f5f5f5', padding: '4px 12px', borderRadius: 12 }}>{group.date}</span>
            </div>
            {group.msgs.map(msg => {
              // System Message Render - визуально отличается от обычных сообщений
              if (msg.is_system) {
                return (
                  <div key={`${msg.source_type}_${msg.id}`} style={{
                    textAlign: 'center',
                    margin: '12px 0',
                  }}>
                    <div style={{
                      background: '#f0f0f0',
                      display: 'inline-block',
                      padding: '6px 14px',
                      borderRadius: 16,
                      fontSize: 12,
                      color: '#8c8c8c',
                      maxWidth: '80%',
                      wordWrap: 'break-word'
                    }}>
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // Regular message rendering
              let variant: 'client' | 'internal' = 'client';

              // Internal messages (not system) get special color
              if (msg.source_type === 'internal') {
                variant = 'internal';
              }

              // Client = Left
              // Manager (to Client) = Right
              // Internal = Right (Own) or Left (Other Manager)

              let isOwn = false;
              if (msg.source_type === 'client') {
                isOwn = !isClientMessage(msg.author_type); // Manager is Own
              } else {
                // Internal
                isOwn = msg.sender?.id === manager?.id;
                if (!msg.sender?.id && msg.manager_id === manager?.id) isOwn = true;
              }

              // Alignment logic
              let alignment: 'left' | 'right' | undefined = undefined;
              if (msg.source_type === 'internal') {
                alignment = isOwn ? 'right' : 'left';
              }

              // Determine Reply Context (we need to find the message in our list)
              let replyCtx: Message | undefined = undefined;
              if (msg.reply_to_mess_id_tg && messages.find) { // client reply TG
                replyCtx = messages.find(m => m.message_id_tg === msg.reply_to_mess_id_tg);
              } else if ((msg as any).reply_to_id) { // internal reply
                replyCtx = messages.find(m => m.id === (msg as any).reply_to_id && m.source_type === 'internal');
              }

              return (
                <UnifiedMessageBubble
                  key={`${msg.source_type}_${msg.id}`}
                  msg={msg}
                  isOwn={isOwn}
                  onReply={(m) => setReplyTo(m as TimelineMessage)}
                  onAddReaction={handleAddReaction}
                  replyMessage={replyCtx}
                  variant={variant}
                  alignment={alignment}
                />
              );
            })}
          </div>
        ))}
      </>
    );
  };


  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#fff',
      borderRadius: isMobile ? 0 : 8,
      border: isMobile ? 'none' : '1px solid #f0f0f0',
    }}>
      {/* Header / Mode Switcher */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#fafafa',
        borderRadius: isMobile ? 0 : '8px 8px 0 0'
      }}>
        <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          {contactName || 'Чат с клиентом'}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tooltip title="Переключить режим отправки">
            <Switch
              checkedChildren={<><TeamOutlined /> Свои</>}
              unCheckedChildren={<><GlobalOutlined /> Клиент</>}
              checked={inputMode === 'internal'}
              onChange={(checked) => setInputMode(checked ? 'internal' : 'client')}
              style={{ background: inputMode === 'internal' ? '#faad14' : '#1890ff' }}
            />
          </Tooltip>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '8px 4px' : 16 }}>
        {loading && messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
        ) : messages.length === 0 ? (
          <Empty description="Нет сообщений" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : renderList()}
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
            Ответ на: <b>{replyTo.display_author || (replyTo as any).sender?.name}</b>
            <div style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#888' }}>
              {replyTo.content || 'Вложение'}
            </div>
          </div>
          <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: '#1890ff', cursor: 'pointer', padding: 0 }}>Отмена</button>
        </div>
      )}

      {/* Input Area with visual indicator of mode */}
      <div style={{
        borderLeft: inputMode === 'internal' ? '4px solid #faad14' : '4px solid #1890ff',
        transition: 'all 0.3s'
      }}>
        <ChatInput
          onSendText={handleSendText}
          onSendVoice={handleSendVoice}
          onSendFile={handleSendFile}
          sending={sending}
          replacements={replacements}
          placeholder={inputMode === 'internal' ? "Внутренняя заметка..." : "Написать клиенту..."}
        />
      </div>
    </div>
  );
};

export default OrderChat;
