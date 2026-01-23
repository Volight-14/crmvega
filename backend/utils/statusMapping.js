const { ORDER_STATUSES } = require('./statuses');

const STATUS_MAPPING = {};

// Генерируем маппинг динамически из ORDER_STATUSES
Object.entries(ORDER_STATUSES).forEach(([key, value]) => {
    // Маппинг по ID (если есть)
    if (value.bubble_id) {
        STATUS_MAPPING[value.bubble_id] = key;
    }
    // Маппинг по названию (Label)
    if (value.label) {
        STATUS_MAPPING[value.label] = key;
    }
});

// Доп. алиасы для обратной совместимости (можно оставить хардкодом, если они не в конфиге)
// Например legacy значения
const LEGACY_MAPPING = {
    'Выполнен': 'completed',
    'Исполнена': 'completed',
    'duplicate': 'duplicate'
};

Object.assign(STATUS_MAPPING, LEGACY_MAPPING);

const mapStatus = (inputStatus) => {
    if (!inputStatus) return 'unsorted';
    const key = String(inputStatus).trim();
    return STATUS_MAPPING[key] || 'unsorted';
};

module.exports = { mapStatus, STATUS_MAPPING };
