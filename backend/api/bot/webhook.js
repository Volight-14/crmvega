const { createClient } = require('@supabase/supabase-js');
const botModule = require('../../../bot/index');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Функция для отправки сообщения в CRM
async function sendMessageToCRM(telegramUserId, content) {
  try {
    // Сначала проверяем, есть ли активная заявка для этого пользователя
    const { data: leads, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('telegram_user_id', telegramUserId)
      .eq('status', 'in_progress')
      .limit(1);

    if (leadError) throw leadError;

    if (!leads || leads.length === 0) {
      // Создаем новую заявку
      const { data: lead, error: createError } = await supabase
        .from('leads')
        .insert({
          name: `Пользователь ${telegramUserId}`,
          source: 'telegram_bot',
          description: 'Автоматически созданная заявка из Telegram бота',
          telegram_user_id: telegramUserId,
          status: 'new'
        })
        .select()
        .single();

      if (createError) throw createError;

      // Отправляем первое сообщение
      await supabase
        .from('messages')
        .insert({
          lead_id: lead.id,
          content: content,
          sender_type: 'user'
        });

      return lead.id;
    } else {
      // Используем существующую заявку
      const leadId = leads[0].id;

      await supabase
        .from('messages')
        .insert({
          lead_id: leadId,
          content: content,
          sender_type: 'user'
        });

      return leadId;
    }
  } catch (error) {
    console.error('Error sending message to CRM:', error);
    return null;
  }
}

// Vercel serverless function
export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'Telegram webhook endpoint' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const update = req.body;

    // Проверяем, что это сообщение
    if (update.message && update.message.text) {
      const telegramUserId = update.message.from.id;
      const messageText = update.message.text;

      // Игнорируем команды
      if (messageText.startsWith('/')) {
        if (messageText === '/start') {
          // Обработка команды /start через webhook
          await botModule.sendMessageToUser(telegramUserId, 'Привет! Я бот поддержки CRM системы. Напишите ваше сообщение, и менеджер свяжется с вами.');
        }
        return res.status(200).end();
      }

      // Отправляем сообщение в CRM
      const leadId = await sendMessageToCRM(telegramUserId, messageText);

      if (leadId) {
        await botModule.sendMessageToUser(telegramUserId, 'Ваше сообщение отправлено менеджеру. Ожидайте ответа.');
      } else {
        await botModule.sendMessageToUser(telegramUserId, 'Произошла ошибка при отправке сообщения. Попробуйте позже.');
      }
    }

    res.status(200).end();
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
