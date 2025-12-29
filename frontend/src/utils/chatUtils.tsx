import React from 'react';

// Determine if message is from client
export const isClientMessage = (authorType?: string): boolean => {
    if (!authorType) return false;
    const clientTypes = ['Клиент', 'user', 'client'];
    return clientTypes.includes(authorType);
};

// Get avatar color based on author type
export const getAvatarColor = (authorType?: string): string => {
    if (!authorType) return '#8c8c8c';
    const colors: Record<string, string> = {
        'Клиент': '#52c41a',
        'user': '#52c41a',
        'client': '#52c41a',
        'Оператор': '#1890ff',
        'Менеджер': '#722ed1',
        'Админ': '#eb2f96',
        'Бот': '#faad14',
        'Служба заботы': '#13c2c2',
        'manager': '#1890ff',
    };
    return colors[authorType] || '#8c8c8c';
};

// Format time
export const formatTime = (date?: string | number): string => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

// Format date
export const formatDate = (date?: string | number): string => {
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

// Linkify text
export const linkifyText = (text?: string): React.ReactNode => {
    if (!text) return null;

    const combinedRegex = /(https?:\/\/[^\s]+|@\w+)/g;
    const parts = text.split(combinedRegex);

    return parts.map((part, index) => {
        // URL
        if (/(https?:\/\/[^\s]+)/g.test(part)) {
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

        // Username
        if (/(@\w+)/g.test(part)) {
            const username = part.substring(1);
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

        return part;
    });
};

export const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};
