const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Функция для отправки сообщения пользователю через Telegram Bot API
async function sendMessageToUser(telegramUserId, message) {
  try {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TELEGRAM_BOT_TOKEN) {
      console.error('TELEGRAM_BOT_TOKEN не установлен');
      return false;
    }

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: telegramUserId,
        text: message
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Telegram API error:', errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending message to user:', error.message);
    return false;
  }
}

// Функция для отправки сообщения в CRM
async function sendMessageToCRM(telegramUserId, content, telegramMessageId, messageType = 'text', attachmentData = null) {
  try {
    // 1. Находим или создаем контакт
    // ... code for finding contact ...
    // 1. Ищем контакт по Telegram ID
    // Use .limit(1) instead of .single() to avoid errors if duplicates somehow exist
    const { data: existingContacts, error: findError } = await supabase
      .from('contacts')
      .select('id')
      .eq('telegram_user_id', telegramUserId)
      .limit(1);

    if (findError) console.error('Error searching contact:', findError);

    let contactId = null;

    if (existingContacts && existingContacts.length > 0) {
      contactId = existingContacts[0].id;
    } else {
      // Создаем контакт
      const { data: newContact, error: createError } = await supabase
        .from('contacts')
        .insert({
          name: `User ${telegramUserId}`,
          telegram_user_id: telegramUserId.toString(),
          status: 'active'
        })
        .select()
        .single();

      if (createError) throw createError;
      contactId = newContact.id;
    }

    // 2. Ищем активную заявку (Order)
    const terminalStatuses = ['completed', 'scammer', 'client_rejected', 'lost'];

    // Fetch recent orders effectively and filter in JS to avoid query syntax risks
    const { data: recentOrders, error: fetchOrderError } = await supabase
      .from('orders')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (fetchOrderError) console.error('Error fetching contact orders:', fetchOrderError);

    const activeOrders = recentOrders ? recentOrders.filter(o => !terminalStatuses.includes(o.status)) : [];

    let currentOrder = null;

    if (activeOrders && activeOrders.length > 0) {
      currentOrder = activeOrders[0]; // Take the most recent active one
    } else {
      // Генерируем новый main_id (numeric)
      const newMainId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);

      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          contact_id: contactId,
          title: `Order from TG ${telegramUserId}`,
          status: 'unsorted', // Неразобранное
          created_at: new Date().toISOString(),
          main_id: newMainId
        })
        .select()
        .single();

      if (orderError) throw orderError;
      currentOrder = newOrder;
    }

    // 3. Загружаем файл (если есть)
    let finalAttachmentUrl = null;
    if (attachmentData && attachmentData.buffer) {
      const fileName = `${Date.now()}_voice.ogg`;
      // Используем папку order_files как в orderMessages.js
      const filePath = `order_files/${currentOrder.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, attachmentData.buffer, {
          contentType: attachmentData.mimeType || 'audio/ogg',
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
      } else {
        const { data: urlData } = supabase.storage
          .from('attachments')
          .getPublicUrl(filePath);
        finalAttachmentUrl = urlData?.publicUrl;
      }
    }

    // 4. Сохраняем сообщение
    let linkId = currentOrder.main_id;

    if (!linkId) {
      const newId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
      await supabase.from('orders').update({ main_id: newId }).eq('id', currentOrder.id);
      linkId = newId;
    }

    const { data: savedMessage, error: msgError } = await supabase
      .from('messages')
      .insert({
        lead_id: linkId,
        main_id: linkId,
        content: content,
        author_type: 'user',
        message_id_tg: telegramMessageId,
        message_type: messageType,
        file_url: finalAttachmentUrl, // Correct column name matches DB
        'Created Date': new Date().toISOString()
      })
      .select()
      .single();

    if (msgError) {
      console.error('Error inserting message:', msgError);
      throw msgError;
    }

    // Также привяжем через order_messages для надежности
    if (savedMessage) {
      await supabase.from('order_messages').insert({
        order_id: currentOrder.id,
        message_id: savedMessage.id
      });
    }

    return linkId;

  } catch (error) {
    console.error('Error sending message to CRM:', error);
    return null;
  }
}

// Vercel serverless function
module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'Telegram webhook endpoint (Orders)' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const update = req.body;

    // Проверяем, что это сообщение
    if (update.message) {
      const telegramUserId = update.message.from.id;
      const messageId = update.message.message_id;

      let messageText = update.message.text || update.message.caption || '';
      let messageType = 'text';
      let attachmentUrl = null;
      let attachmentName = null;

      // Обработка голосового сообщения
      if (update.message.voice) {
        messageType = 'voice';
        const fileId = update.message.voice.file_id;
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

        try {
          // 1. Получаем путь к файлу
          const fileInfoRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
          const fileInfo = await fileInfoRes.json();

          if (fileInfo.ok && fileInfo.result.file_path) {
            const filePath = fileInfo.result.file_path;

            // 2. Скачиваем файл
            const fileRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`);
            const arrayBuffer = await fileRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // 3. Загружаем в Supabase
            // Нам нужен OrderId для пути, но мы его еще не знаем.
            // Можно временно сохранить в общую папку или сначала найти Order.
            // Придется сначала найти Order внутри sendMessageToCRM... 
            // Либо перенести логику поиска Order наружу.
            // Для упрощения (чтобы не дублировать код поиска) передадим Buffer в sendMessageToCRM
            // Но sendMessageToCRM - это отдельная функция.
            // Давайте передадим буфер и метаданные в sendMessageToCRM и там загрузим.

            // UPD: actually best to just fetch file link? No, Telegram links expire. Must re-upload.
            // Let's pass the buffer to sendMessageToCRM.
            attachmentUrl = { buffer, mimeType: 'audio/ogg', ext: 'ogg' };
          }
        } catch (e) {
          console.error('Error processing voice:', e);
          messageText = '[Ошибка загрузки голосового сообщения]';
        }
      }

      // Игнорируем команды
      if (messageText && messageText.startsWith('/')) {
        if (messageText === '/start') {
          await sendMessageToUser(telegramUserId, 'Привет! Я бот поддержки. Напишите, и мы создадим заявку.');
        }
        return res.status(200).end();
      }

      // Отправляем сообщение в CRM (если есть текст или вложение)
      if (messageText || messageType !== 'text') {
        const leadId = await sendMessageToCRM(telegramUserId, messageText, messageId, messageType, attachmentUrl);
      }
    }

    res.status(200).end();
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
