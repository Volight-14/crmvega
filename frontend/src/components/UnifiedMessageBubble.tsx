import React, { useState, useRef } from 'react';
import {
    Avatar,
    Popover,
    message as antMessage
} from 'antd';
import {
    PlayCircleOutlined,
    PauseCircleOutlined,
    UserOutlined,
    RollbackOutlined,
    FileOutlined,
    DownloadOutlined,
    CopyOutlined
} from '@ant-design/icons';
import { isClientMessage, getAvatarColor, formatTime, linkifyText } from '../utils/chatUtils';
import { Message } from '../types';

interface UnifiedMessageBubbleProps {
    msg: Message;
    isOwn: boolean;
    onReply?: (msg: Message) => void;
    onAddReaction?: (msg: Message, emoji: string) => void;
    replyMessage?: Message;
    alignment?: 'left' | 'right';
    variant?: 'client' | 'internal';
    onRecall?: (msg: Message) => void; // Optional recall support
}

const DEFAULT_REACTIONS = ['👍', '❤️', '🔥', '😂', '😮', '😔'];

export const UnifiedMessageBubble: React.FC<UnifiedMessageBubbleProps> = ({
    msg,
    isOwn,
    onReply,
    onAddReaction,
    replyMessage,
    alignment,
    variant = 'client'
}) => {
    const isFromClient = isClientMessage(msg.author_type);
    const align = alignment || (isFromClient ? 'left' : 'right');
    const isRight = align === 'right';
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Context Menu / Action State
    const [menuOpen, setMenuOpen] = useState(false);

    // Long Press Refs
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const isLongPress = useRef(false);

    // Determine colors
    const getBubbleStyles = () => {
        if (variant === 'internal') {
            if (isRight) {
                return {
                    background: 'linear-gradient(135deg, #722ed1 0%, #531dab 100%)',
                    color: 'white',
                    borderRadius: '16px 4px 16px 16px',
                    linkColor: 'rgba(255,255,255,0.9)'
                };
            } else {
                return {
                    background: 'linear-gradient(135deg, #13c2c2 0%, #08979c 100%)',
                    color: 'white',
                    borderRadius: '4px 16px 16px 16px',
                    linkColor: '#e6fffb'
                };
            }
        } else {
            if (isRight) {
                return {
                    background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
                    color: 'white',
                    borderRadius: '16px 4px 16px 16px',
                    linkColor: 'rgba(255,255,255,0.9)'
                };
            } else {
                return {
                    background: '#ffffff',
                    color: 'rgba(0,0,0,0.85)',
                    borderRadius: '4px 16px 16px 16px',
                    border: '1px solid #f0f0f0',
                    linkColor: '#1890ff'
                };
            }
        }
    };

    const styles = getBubbleStyles();

    // --- Actions ---
    const handleCopy = () => {
        if (msg.content) {
            navigator.clipboard.writeText(msg.content)
                .then(() => antMessage.success('Скопировано'))
                .catch(() => antMessage.error('Ошибка копирования'));
        }
        setMenuOpen(false);
    };

    const handleReactionClick = (emoji: string) => {
        if (onAddReaction) onAddReaction(msg, emoji);
        setMenuOpen(false);
    };

    // --- Interaction Handlers (Long Press & Right Click) ---
    const handleTouchStart = () => {
        isLongPress.current = false;
        timerRef.current = setTimeout(() => {
            isLongPress.current = true;
            setMenuOpen(true);
            if (navigator.vibrate) navigator.vibrate(50);
        }, 500);
    };

    const handleTouchEnd = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setMenuOpen(true);
    };

    // --- Render Helpers ---
    const toggleAudio = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const contentMenu = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 4 }}>
            <div style={{ display: 'flex', gap: 4, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
                {DEFAULT_REACTIONS.map(emoji => (
                    <div
                        key={emoji}
                        onClick={() => handleReactionClick(emoji)}
                        style={{ fontSize: 20, cursor: 'pointer', padding: 4, borderRadius: 4, transition: 'background 0.2s' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        {emoji}
                    </div>
                ))}
            </div>

            <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 4px', borderRadius: 4 }}
                onClick={() => { onReply && onReply(msg); setMenuOpen(false); }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
                <RollbackOutlined /> Ответить
            </div>
            {msg.content && (
                <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 4px', borderRadius: 4 }}
                    onClick={handleCopy}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    <CopyOutlined /> Копировать текст
                </div>
            )}
        </div>
    );

    const renderAttachment = () => {
        if (msg.file_url) {
            const isImage = msg.file_url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            const isVideo = msg.file_url.match(/\.(mp4|webm|mov)$/i);
            const isPdf = msg.file_url.match(/\.pdf$/i);
            const isVoice = msg.message_type === 'voice' || msg.file_url.endsWith('.ogg') || msg.file_url.endsWith('.wav');

            if (isVoice) {
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 160, marginTop: 8 }}>
                        <div onClick={(e) => { e.stopPropagation(); toggleAudio(); }} style={{ cursor: 'pointer', fontSize: 24 }}>
                            {isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                        </div>
                        <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.3)', borderRadius: 2 }}>
                            <div style={{ width: isPlaying ? '50%' : '0%', height: '100%', background: 'currentColor', transition: 'width 0.2s' }} />
                        </div>
                        <audio
                            ref={audioRef}
                            src={msg.file_url}
                            onEnded={() => setIsPlaying(false)}
                            style={{ display: 'none' }}
                        />
                        {msg.voice_duration && <span style={{ fontSize: 11 }}>{formatTime(new Date(0).setSeconds(msg.voice_duration || 0)).substr(3)}</span>}
                    </div>
                );
            }

            if (isImage) {
                return (
                    <div onClick={(e) => { e.stopPropagation(); window.open(msg.file_url, '_blank'); }} style={{ cursor: 'pointer', marginTop: 4 }}>
                        <img src={msg.file_url} alt="attachment" style={{ maxWidth: '100%', borderRadius: 8, maxHeight: 300, objectFit: 'cover' }} />
                    </div>
                );
            }

            if (isVideo) {
                return (
                    <div style={{ marginTop: 4 }}>
                        <video src={msg.file_url} controls style={{ maxWidth: '100%', borderRadius: 8 }} />
                    </div>
                );
            }

            if (isPdf) {
                return (
                    <div
                        style={{ marginTop: 8, cursor: 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); window.open(msg.file_url, '_blank'); }}
                    >
                        <div style={{
                            width: '240px',
                            border: '1px solid rgba(0,0,0,0.1)',
                            borderRadius: 8,
                            backgroundColor: '#f5f5f5',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '12px',
                            gap: 12,
                            color: '#333'
                        }}>
                            <div style={{
                                width: 40,
                                height: 40,
                                borderRadius: 8,
                                background: '#ff4d4f',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white'
                            }}>
                                <FileOutlined style={{ fontSize: 20 }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {msg.file_name || 'Документ PDF'}
                                </div>
                                <div style={{ fontSize: 11, color: '#8c8c8c' }}>Нажмите для просмотра</div>
                            </div>
                        </div>
                    </div>
                );
            }

            // Generic
            return (
                <a href={msg.file_url} target="_blank" rel="noopener noreferrer" style={{ color: styles.linkColor, textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <DownloadOutlined /> {msg.file_name || 'Скачать файл'}
                </a>
            );
        }
        return null;
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: isRight ? 'flex-end' : 'flex-start',
            marginBottom: 16,
            position: 'relative',
            paddingLeft: isRight ? 48 : 0,
            paddingRight: !isRight ? 48 : 0,
            width: '100%'
        }}>
            {replyMessage && (
                <div style={{
                    fontSize: 12,
                    color: '#8c8c8c',
                    marginBottom: 4,
                    marginLeft: isRight ? 0 : 4,
                    marginRight: isRight ? 4 : 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    maxWidth: '80%',
                    cursor: 'pointer'
                }}>
                    <RollbackOutlined style={{ fontSize: 10 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        В ответ на: {replyMessage.content || 'Вложение'}
                    </span>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: isRight ? 'row-reverse' : 'row', maxWidth: '100%', gap: 8 }}>
                <Avatar
                    style={{
                        backgroundColor: getAvatarColor(msg.author_type),
                        flexShrink: 0,
                        marginTop: 'auto'
                    }}
                    icon={msg.author_type === 'customer' ? <UserOutlined /> : undefined}
                >
                    {msg.author_type !== 'customer' ? msg.author_type.charAt(0).toUpperCase() : undefined}
                </Avatar>

                <Popover
                    content={contentMenu}
                    trigger="contextMenu"
                    open={menuOpen}
                    onOpenChange={setMenuOpen}
                    overlayInnerStyle={{ padding: 8, borderRadius: 8 }}
                    placement={isRight ? 'bottomRight' : 'bottomLeft'}
                >
                    <div
                        style={{
                            ...styles,
                            padding: '10px 14px',
                            minWidth: 60,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            position: 'relative',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            touchAction: 'manipulation'
                        }}
                        onDoubleClick={() => onReply && onReply(msg)}
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                        onContextMenu={handleContextMenu}
                    >
                        {!isRight && !isFromClient && (
                            <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.7, marginBottom: 2 }}>
                                {msg.author_type}
                            </div>
                        )}

                        {renderAttachment()}

                        {msg.content && !renderAttachment() && (
                            <div style={{
                                fontSize: 14,
                                lineHeight: '1.5',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                            }}>
                                {linkifyText(msg.content)}
                            </div>
                        )}

                        <div style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                            marginTop: 4,
                            gap: 4,
                            opacity: 0.7,
                            fontSize: 10
                        }}>
                            {msg.reactions && msg.reactions.length > 0 && (
                                <div style={{ display: 'flex', gap: 2, marginRight: 4 }}>
                                    {msg.reactions.map((r, i) => (
                                        <span key={i}>{typeof r === 'string' ? r : r.emoji || r}</span>
                                    ))}
                                </div>
                            )}
                            {formatTime(msg['Created Date'] || msg.created_at)}
                            {isOwn && (
                                <span>{msg.is_read ? '✓✓' : '✓'}</span>
                            )}
                        </div>
                    </div>
                </Popover>
            </div>
        </div>
    );
};
