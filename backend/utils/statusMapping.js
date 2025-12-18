const STATUS_MAPPING = {
    // Неразобранное
    '68464454': 'unsorted',
    'Неразобранное': 'unsorted',

    // Принято Анна
    '68464458': 'accepted_anna',
    'Принято Анна': 'accepted_anna',

    // Принято Костя
    '68626790': 'accepted_kostya',
    'Принято Костя': 'accepted_kostya',

    // Принято Стас
    '68627678': 'accepted_stas',
    'Принято Стас': 'accepted_stas',

    // Работа с клиентом
    '71445094': 'in_progress',
    'Работа с клиентом': 'in_progress',

    // Опрос
    '75360614': 'survey',
    'Опрос': 'survey',

    // Передано Никите
    '68464462': 'transferred_nikita',
    'Передано Никите': 'transferred_nikita',

    // Передано Вал Александру
    '69674402': 'transferred_val',
    'Передано Вал Александру': 'transferred_val',

    // Передано Бен Александру
    '68626794': 'transferred_ben',
    'Передано Бен Александру': 'transferred_ben',

    // Передано Фин Александру
    '74741370': 'transferred_fin',
    'Передано Фин Александру': 'transferred_fin',

    // Частично исполнена
    '68624190': 'partially_completed',
    'Частично исполнена': 'partially_completed',

    // Перенос на завтра
    '68464466': 'postponed',
    'Перенос на завтра': 'postponed',

    // Отказ клиента
    '70835430': 'client_rejected',
    'Отказ клиента': 'client_rejected',

    // Мошенник
    '70836166': 'scammer',
    'Мошенник': 'scammer',

    // На модерации
    '69707910': 'moderation',
    'На модерации': 'moderation',

    // Успешно реализована
    '142': 'completed',
    'Успешно реализована': 'completed',
    'Выполнен': 'completed', // Legacy
    'Исполнена': 'completed', // Frontend label

    // Дубль или контакт -> ??
    // Mapping to client_rejected as safe fallback
    '143': 'client_rejected',
    'Дубль или контакт': 'client_rejected'
};

const mapStatus = (inputStatus) => {
    if (!inputStatus) return 'unsorted';
    const key = String(inputStatus).trim();
    return STATUS_MAPPING[key] || 'unsorted';
};

module.exports = { mapStatus, STATUS_MAPPING };
