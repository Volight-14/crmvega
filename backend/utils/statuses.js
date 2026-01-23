const ORDER_STATUSES = {
    // Начальные этапы
    unsorted: { label: 'Неразобранное' },

    // Принято операторами
    accepted_anna: { label: 'Принято Анна' },
    accepted_kostya: { label: 'Принято Костя' },
    accepted_stas: { label: 'Принято Стас' },
    accepted_lucy: { label: 'Принято Люси' },

    // Рабочие этапы
    in_progress: { label: 'Работа с клиентом' },
    survey: { label: 'Опрос' },

    // Передано исполнителям
    transferred_nikita: { label: 'Передано Никите' },
    transferred_val: { label: 'Передано Вал Александру' },
    transferred_ben: { label: 'Передано Бен Александру' },
    transferred_fin: { label: 'Передано Фин Александру' },

    // Финальные этапы
    partially_completed: { label: 'Частично исполнена' },
    postponed: { label: 'Перенос на завтра' },

    // Закрытые
    client_rejected: { label: 'Отказ клиента' },
    duplicate: { label: 'Дубль или контакт' },
    scammer: { label: 'Мошенник' },
    moderation: { label: 'На модерации' },

    // Успешно закрыта
    completed: { label: 'Успешно реализована' },
};

module.exports = { ORDER_STATUSES };
