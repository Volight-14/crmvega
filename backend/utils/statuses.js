const ORDER_STATUSES = {
    // Начальные этапы
    unsorted: { label: 'Неразобранное', bubble_id: '68464454' },

    // Принято операторами
    accepted_anna: { label: 'Принято Анна', bubble_id: '68464458' },
    accepted_kostya: { label: 'Принято Костя', bubble_id: '68626790' },
    accepted_stas: { label: 'Принято Стас', bubble_id: '68627678' },
    accepted_lucy: { label: 'Принято Люси', bubble_id: '80739506' },

    // Рабочие этапы
    in_progress: { label: 'Работа с клиентом', bubble_id: '71445094' },
    survey: { label: 'Опрос', bubble_id: '75360614' },

    // Передано исполнителям
    transferred_nikita: { label: 'Передано Никите', bubble_id: '68464462' },
    transferred_val: { label: 'Передано Вал Александру', bubble_id: '69674402' },
    transferred_ben: { label: 'Передано Бен Александру', bubble_id: '68626794' },
    transferred_fin: { label: 'Передано Фин Александру', bubble_id: '74741370' },

    // Финальные этапы
    partially_completed: { label: 'Частично исполнена', bubble_id: '68624190' },
    postponed: { label: 'Перенос на завтра', bubble_id: '68464466' },

    // Закрытые
    client_rejected: { label: 'Отказ клиента', bubble_id: '70835430' },
    duplicate: { label: 'Дубль или контакт', bubble_id: '143' },
    scammer: { label: 'Мошенник', bubble_id: '70836166' },
    moderation: { label: 'На модерации', bubble_id: '69707910' },

    // Успешно реализована
    completed: { label: 'Успешно реализована', bubble_id: '142' },
};

module.exports = { ORDER_STATUSES };
