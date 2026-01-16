import React, { useState, useRef } from 'react';
import {
    Tooltip,
    Avatar,
} from 'antd';
import {
    PlayCircleOutlined,
    PauseCircleOutlined,
    UserOutlined,
    RollbackOutlined,
    FileOutlined,
    DownloadOutlined,
} from '@ant-design/icons';
import { isClientMessage, getAvatarColor, formatTime, linkifyText } from '../utils/chatUtils';
import { Message } from '../types';

interface UnifiedMessageBubbleProps {
    msg: Message; // Currently supports 'Message' type, can extend to InternalMessage if needed later
    isOwn: boolean; // Pre-calculated ownership
    onReply?: (msg: Message) => void;
    replyMessage?: Message; // Context of the replied message
    alignment?: 'left' | 'right';
    variant?: 'client' | 'internal'; // 'client' = standard grey/blue, 'internal' = cyan/purple
}

export const UnifiedMessageBubble: React.FC<UnifiedMessageBubbleProps> = ({
    msg,
    isOwn,
    onReply,
    replyMessage,
    alignment,
    variant = 'client'
}) => {
    const isFromClient = isClientMessage(msg.author_type);
    const align = alignment || (isFromClient ? 'left' : 'right');
    const isRight = align === 'right';
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Determine colors based on variant and alignment/ownership
    const getBubbleStyles = () => {
        if (variant === 'internal') {
            // Internal Chat Mode
            if (isRight) { // Me (Purple)
                return {
                    background: 'linear-gradient(135deg, #722ed1 0%, #531dab 100%)',
                    color: 'white',
                    borderRadius: '16px 4px 16px 16px',
                    linkColor: 'rgba(255,255,255,0.9)'
                };
            } else { // Colleague (Cyan)
                return {
                    background: 'linear-gradient(135deg, #13c2c2 0%, #08979c 100%)',
                    color: 'white',
                    borderRadius: '4px 16px 16px 16px',
                    linkColor: '#e6fffb'
                };
            }
        } else {
            // Client Chat Mode (Default)
            if (isRight) { // Team/Me (Blue)
                return {
                    background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
                    color: 'white',
                    borderRadius: '12px 12px 0 12px',
                    linkColor: 'white'
                };
            } else { // Client (Grey)
                return {
                    background: 'linear-gradient(135deg, #f0f2f5 0%, #e8eaed 100%)',
                    color: '#262626',
                    borderRadius: '12px 12px 12px 0',
                    linkColor: '#1890ff'
                };
            }
        }
    };

    const styles = getBubbleStyles();

    const scrollToMessage = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('highlight-message');
            setTimeout(() => element.classList.remove('highlight-message'), 2000);
        }
    };

    const handlePlayVoice = () => {
        // Priority: file_url, then content if it looks like a URL
        const src = msg.file_url || (msg.content?.startsWith('https://') ? msg.content : null);

        if (!src) return;

        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
                setIsPlaying(false);
            } else {
                audioRef.current.play();
                setIsPlaying(true);
            }
        } else {
            const audio = new Audio(src);
            audioRef.current = audio;
            audio.onended = () => setIsPlaying(false);
            audio.play();
            setIsPlaying(true);
        }
    };

    const renderAttachment = () => {
        // 1. Voice
        if (msg.message_type === 'voice' || (msg.file_url && (msg.file_url.endsWith('.ogg') || msg.file_url.endsWith('.mp3') || msg.file_url.endsWith('.wav')))) {
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
                            background: styles.color === 'white' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)',
                            borderRadius: 2,
                            width: '100%',
                        }} />
                    </div>
                    {msg.voice_duration && (
                        <span style={{ fontSize: 11, opacity: 0.8 }}>
                            {Math.floor(msg.voice_duration / 60)}:{(msg.voice_duration % 60).toString().padStart(2, '0')}
                        </span>
                    )}
                </div>
            );
        }

        // 2. Video / Video Note
        if (msg.message_type === 'video' || msg.message_type === 'video_note' || (msg.file_url && msg.file_url.endsWith('.mp4'))) {
            const isRound = msg.message_type === 'video_note';
            return (
                <div>
                    <video
                        controls
                        playsInline
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
                    <div style={{ marginTop: 4, textAlign: 'right' }}>
                        <a
                            href={msg.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                fontSize: 11,
                                color: styles.linkColor,
                                textDecoration: 'underline',
                                opacity: 0.8
                            }}
                        >
                            Скачать видео
                        </a>
                    </div>
                    {(msg.caption || msg.content) && !isRound && (
                        <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {linkifyText(msg.caption || msg.content)}
                        </div>
                    )}
                </div>
            );
        }

        // 3. Image / File
        if (msg.file_url) {
            const isImage = msg.message_type === 'image' || msg.file_url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            if (isImage) {
                return (
                    <div>
                        <img
                            src={msg.file_url}
                            alt=""
                            style={{
                                maxWidth: '100%',
                                maxHeight: 300,
                                borderRadius: 8,
                                cursor: 'pointer',
                                marginTop: 8
                            }}
                            onClick={() => window.open(msg.file_url, '_blank')}
                        />
                        {(msg.caption || msg.content) && (
                            <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {linkifyText(msg.caption || msg.content)}
                            </div>
                        )}
                    </div>
                );
            }

            // Generic File
            return (
                <a
                    href={msg.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        color: styles.linkColor,
                        textDecoration: 'none',
                        marginTop: 8
                    }}
                >
                    <FileOutlined style={{ fontSize: 20 }} />
                    <span>Скачать файл</span>
                    <DownloadOutlined />
                </a>
            );
        }

        // 4. Special case: Content is a URL (e.g. from Bubble without explicit file_url)
        if (msg.content?.startsWith('https://') && msg.content.includes('storage')) {
            // Simple heuristic check if it's voice
            const isVoice = msg.content.includes('.ogg') || msg.content.includes('.mp3') || msg.content.includes('.wav');
            if (isVoice) {
                return (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            marginTop: 8
                        }}
                        onClick={() => handlePlayVoice()}
                    >
                        <PlayCircleOutlined style={{ fontSize: 24 }} />
                        <span>🎤 Голосовое сообщение</span>
                    </div>
                );
            }
        }

        return null;
    };

    // Main wrapper ID for scrolling
    const msgId = msg.message_id_tg ? `msg-client-${msg.message_id_tg}` : `msg-${msg.id}`;

    // Helper for internal messages where author_type is missing but we have name
    const avatarName = msg.sender?.name || (msg.author_type || '?');
    const avatarInitial = avatarName[0]?.toUpperCase();
    const avatarColor = variant === 'internal'
        ? (isRight ? '#722ed1' : '#13c2c2')
        : getAvatarColor(msg.author_type);

    return (
        <div
            id={msgId}
            style={{
                display: 'flex',
                justifyContent: isRight ? 'flex-end' : 'flex-start',
                padding: '4px 0',
                position: 'relative',
                marginBottom: 8
            }}
            onDoubleClick={() => onReply && onReply(msg)}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: isRight ? 'row-reverse' : 'row',
                    alignItems: 'flex-end',
                    gap: 8,
                    maxWidth: '75%',
                }}
            >
                <Tooltip title={avatarName}>
                    <Avatar
                        size={32}
                        style={{ backgroundColor: avatarColor, flexShrink: 0 }}
                        icon={<UserOutlined />}
                    >
                        {avatarInitial}
                    </Avatar>
                </Tooltip>

                <div
                    style={{
                        background: styles.background,
                        color: styles.color,
                        padding: '8px 12px',
                        borderRadius: styles.borderRadius,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                        position: 'relative',
                        minWidth: 120,
                    }}
                >
                    {/* Reply Context */}
                    {replyMessage && (
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                const replyId = replyMessage.message_id_tg ? `msg-client-${replyMessage.message_id_tg}` : `msg-${replyMessage.id}`;
                                scrollToMessage(replyId);
                            }}
                            style={{
                                marginBottom: 4,
                                padding: '4px 8px',
                                borderLeft: `2px solid ${styles.color === 'white' ? 'white' : '#1890ff'}`,
                                backgroundColor: styles.color === 'white' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(24, 144, 255, 0.1)',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: 12,
                                opacity: 0.9
                            }}
                        >
                            <div style={{ fontWeight: 'bold' }}>{replyMessage.sender?.name || replyMessage.author_type || '...'}</div>
                            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                                {replyMessage.content || (replyMessage.message_type !== 'text' ? `[${replyMessage.message_type}]` : '...')}
                            </div>
                        </div>
                    )}

                    {/* Internal Message Sender Name (if left side internal) */}
                    {variant === 'internal' && !isRight && msg.sender?.name && (
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, opacity: 0.9 }}>
                            {msg.sender.name}
                        </div>
                    )}

                    {/* Text Content (if not just an attachment) */}
                    {msg.content && !['image', 'video', 'video_note', 'voice'].includes(msg.message_type || '') && (
                        <div className="message-content" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {linkifyText(msg.content)}
                        </div>
                    )}

                    {/* Attachments */}
                    {renderAttachment()}

                    {/* Metadata: Time and Status */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 4,
                        marginTop: 4,
                        fontSize: 11,
                        opacity: 0.8
                    }}>
                        <span>{formatTime(msg['Created Date'] || msg.created_at)}</span>

                        {isOwn && variant !== 'internal' && (
                            <>
                                {msg.status === 'delivered' && <span>Доставлено</span>}
                                {msg.status === 'read' && <span style={{ color: '#52c41a' }}>Прочитано</span>}
                                {msg.status === 'error' && <span style={{ color: '#ff4d4f' }}>Ошибка</span>}
                                {msg.status === 'blocked' && <span style={{ color: '#ff4d4f' }}>🚫 Заблокирован</span>}
                                {msg.status === 'deleted_chat' && <span style={{ color: '#ff4d4f' }}>💔 Чат удален</span>}
                            </>
                        )}

                        {/* Internal Read Status */}
                        {isOwn && variant === 'internal' && (
                            <span>{msg.is_read ? '✓✓' : '✓'}</span>
                        )}
                    </div>

                    {/* Critical Error Message Text */}
                    {(msg.status === 'blocked' || msg.status === 'deleted_chat' || msg.status === 'error') && msg.error_message && (
                        <div style={{
                            fontSize: 10,
                            color: styles.color === 'white' ? '#ffccc7' : '#cf1322',
                            marginTop: 2,
                            textAlign: 'right'
                        }}>
                            {msg.error_message}
                        </div>
                    )}

                    {onReply && (
                        <div
                            className="reply-icon"
                            style={{
                                position: 'absolute',
                                top: 4,
                                right: isRight ? 'auto' : -24,
                                left: isRight ? -24 : 'auto',
                                cursor: 'pointer', // Hover CSS typically handles visibility
                                opacity: 0 // Hidden by default, shown on hover (needs CSS support or always visible?)
                            }}
                        >
                            <RollbackOutlined onClick={(e) => { e.stopPropagation(); onReply(msg); }} />
                        </div>
                    )}

                    {/* Reactions */}
                    {msg.reactions && msg.reactions.length > 0 && (
                        <div style={{
                            position: 'absolute',
                            bottom: -10,
                            right: isRight ? 'auto' : -5,
                            left: isRight ? -5 : 'auto',
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
        </div>
    );
};
