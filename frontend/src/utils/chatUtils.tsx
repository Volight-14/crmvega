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
    return d.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Madrid'
    });
};

// Format date
export const formatDate = (date?: string | number): string => {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();

    // Convert both to Madrid date strings to compare "Today" / "Yesterday" accurately
    const madridOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
    };

    const dString = d.toLocaleDateString('ru-RU', madridOptions);
    const nowString = now.toLocaleDateString('ru-RU', madridOptions);

    // Check Yesterday (approximate logic is usually fine for chat, but strict timezone is better)
    // To check yesterday strictly in a timezone is tricky without libraries like date-fns-tz.
    // Let's use a simpler heuristic: if the date string matches today -> Today.
    // If not, just return the date. "Yesterday" is nice but strict timezone math without lib is verbose.
    // I will try to implement a basic yesterday check by subtracting 24h from 'now' and checking string.

    if (dString === nowString) {
        return 'Сегодня';
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = yesterday.toLocaleDateString('ru-RU', madridOptions);

    if (dString === yesterdayString) {
        return 'Вчера';
    }

    return d.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Madrid'
    });
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
