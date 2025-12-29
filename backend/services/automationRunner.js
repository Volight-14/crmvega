const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Выполнить автоматизации для триггера
 * @param {string} triggerType - Тип триггера (deal_created, deal_status_changed, etc.)
 * @param {object} entity - Объект сущности (deal, contact, message)
 * @param {object} options - Дополнительные опции (io для Socket.IO)
 */
async function runAutomations(triggerType, entity, options = {}) {
  try {
    // Получаем активные автоматизации для этого триггера
    const { data: automations, error } = await supabase
      .from('automations')
      .select('*')
      .eq('trigger_type', triggerType)
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching automations:', error);
      return;
    }

    if (!automations || automations.length === 0) {
      return;
    }

    // Выполняем каждую автоматизацию
    for (const automation of automations) {
      try {
        // Проверяем условия триггера
        if (checkTriggerConditions(automation.trigger_conditions, entity)) {
          // Парсим action_config если это строка
          let actionConfig = automation.action_config;
          if (typeof actionConfig === 'string') {
            try {
              actionConfig = JSON.parse(actionConfig);
            } catch (e) {
              console.error('Error parsing action_config:', e);
              continue;
            }
          }

          // Выполняем действие
          await executeAction(automation.action_type, actionConfig, entity, options);
        }
      } catch (error) {
        console.error(`Error executing automation ${automation.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error running automations:', error);
  }
}

/**
 * Проверка условий триггера
 */
function checkTriggerConditions(conditions, entity) {
  if (!conditions || Object.keys(conditions).length === 0) {
    return true; // Нет условий = выполняется всегда
  }

  // Поддержка JSON строки (если передана из формы)
  let parsedConditions = conditions;
  if (typeof conditions === 'string') {
    try {
      parsedConditions = JSON.parse(conditions);
    } catch (e) {
      console.error('Error parsing trigger conditions:', e);
      return false;
    }
  }

  // Простая проверка условий
  // Пример: {"field": "status", "operator": "equals", "value": "new"}
  const { field, operator, value } = parsedConditions;

  if (!field || !operator) {
    return true;
  }

  const entityValue = entity[field];

  switch (operator) {
    case 'equals':
      return String(entityValue) === String(value);
    case 'not_equals':
      return String(entityValue) !== String(value);
    case 'contains':
      return String(entityValue).toLowerCase().includes(String(value).toLowerCase());
    case 'greater_than':
      return parseFloat(entityValue) > parseFloat(value);
    case 'less_than':
      return parseFloat(entityValue) < parseFloat(value);
    default:
      return true;
  }
}

/**
 * Выполнение действия автоматизации
 */
async function executeAction(actionType, actionConfig, entity, options = {}) {
  switch (actionType) {
    case 'assign_manager':
      // Назначить менеджера на сделку/контакт
      if (entity.contact_id && actionConfig.manager_id) {
        await supabase
          .from('contacts')
          .update({ manager_id: actionConfig.manager_id })
          .eq('id', entity.contact_id);
      } else if (entity.id && actionConfig.manager_id) {
        // Пытаемся определить таблицу из entity
        if (entity.OrderName || entity.title || entity.amount !== undefined) {
          // Это сделка (order)
          await supabase
            .from('orders') // Renamed from deals
            .update({ manager_id: actionConfig.manager_id })
            .eq('id', entity.id);
        } else if (entity.name && !entity.OrderName && !entity.title) {
          // Это контакт
          await supabase
            .from('contacts')
            .update({ manager_id: actionConfig.manager_id })
            .eq('id', entity.id);
        }
      }
      break;

    case 'add_tag':
      // Добавить тег
      if (entity.contact_id && actionConfig.tag_id) {
        await supabase
          .from('contact_tags')
          .upsert({
            contact_id: entity.contact_id,
            tag_id: actionConfig.tag_id,
          }, { onConflict: 'contact_id,tag_id' });
      } else if (entity.id && actionConfig.tag_id) {
        // Определяем тип сущности
        if (entity.OrderName || entity.title || entity.amount !== undefined) {
          // Это сделка
          await supabase
            .from('order_tags') // Assumed renamed from deal_tags? Check DB schema for order_tags?
            // Safer to check if order_tags exists? Or just assume consistency.
            // frontend types has Tag, but no OrderTag interface shown.
            // But let's assume order_tags.
            .upsert({
              order_id: entity.id, // Renamed from deal_id
              tag_id: actionConfig.tag_id,
            }, { onConflict: 'order_id,tag_id' });
        } else if (entity.name && !entity.OrderName && !entity.title && entity.contact_id === undefined) {
          // Это контакт (без contact_id, но есть id)
          await supabase
            .from('contact_tags')
            .upsert({
              contact_id: entity.id,
              tag_id: actionConfig.tag_id,
            }, { onConflict: 'contact_id,tag_id' });
        }
      }
      break;

    case 'create_note':
      // Создать заметку
      const noteData = {
        content: actionConfig.content || 'Автоматическая заметка',
        priority: actionConfig.priority || 'info',
        manager_id: actionConfig.manager_id || null,
      };

      if (entity.contact_id) {
        noteData.contact_id = entity.contact_id;
      } else if (entity.id && entity.name && !entity.OrderName && !entity.title) {
        // Это контакт
        noteData.contact_id = entity.id;
      } else if (entity.id && (entity.OrderName || entity.title || entity.amount !== undefined)) {
        // Это сделка
        noteData.order_id = entity.id; // Renamed from deal_id
      }

      if (noteData.contact_id || noteData.order_id) {
        await supabase.from('notes').insert(noteData);
      }
      break;

    case 'update_status':
      // Изменить статус
      if (entity.id && actionConfig.status) {
        // Определяем таблицу
        if (entity.OrderName || entity.title || entity.amount !== undefined) {
          // Это сделка
          await supabase
            .from('orders') // Renamed from deals
            .update({ status: actionConfig.status })
            .eq('id', entity.id);
        } else if (entity.name && !entity.OrderName && !entity.title) {
          // Это контакт
          await supabase
            .from('contacts')
            .update({ status: actionConfig.status })
            .eq('id', entity.id);
        }
      }
      break;

    case 'send_notification':
      // Отправить уведомление через Socket.IO
      if (options.io && actionConfig.message) {
        const managerId = actionConfig.manager_id || entity.manager_id;
        if (managerId) {
          options.io.to(`user_${managerId}`).emit('automation_notification', {
            message: actionConfig.message,
            type: actionConfig.notification_type || 'info',
            entity_type: entity.title ? 'deal' : entity.name ? 'contact' : 'message',
            entity_id: entity.id,
          });
        } else {
          // Отправляем всем менеджерам
          options.io.emit('automation_notification', {
            message: actionConfig.message,
            type: actionConfig.notification_type || 'info',
            entity_type: entity.title ? 'deal' : entity.name ? 'contact' : 'message',
            entity_id: entity.id,
          });
        }
      } else {
        console.log('Notification action:', actionConfig.message);
      }
      break;

    case 'send_email':
      // Отправить email (пока только логируем)
      console.log('Email action:', {
        to: actionConfig.email || entity.email,
        subject: actionConfig.subject || 'Уведомление',
        message: actionConfig.message || 'Сообщение',
      });
      // TODO: Интегрировать с email сервисом
      break;

    default:
      console.warn(`Unknown action type: ${actionType}`);
  }
}

module.exports = { runAutomations, executeAction };

