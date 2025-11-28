const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ============================================
// НАСТРОЙКИ AI
// ============================================

// Получить все настройки
router.get('/settings', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ai_settings')
      .select('*')
      .order('key');

    if (error) throw error;

    // Преобразуем в объект key: value
    const settings = {};
    data.forEach(item => {
      settings[item.key] = item.value;
    });

    res.json({ settings, raw: data });
  } catch (error) {
    console.error('Error fetching AI settings:', error);
    res.status(400).json({ error: error.message });
  }
});

// Обновить настройку
router.patch('/settings/:key', auth, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const { data, error } = await supabase
      .from('ai_settings')
      .update({ 
        value: value,
        updated_at: new Date().toISOString(),
        updated_by: req.manager.id
      })
      .eq('key', key)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error updating AI setting:', error);
    res.status(400).json({ error: error.message });
  }
});

// Обновить несколько настроек сразу
router.post('/settings/batch', auth, async (req, res) => {
  try {
    const { settings } = req.body; // { key1: value1, key2: value2, ... }

    const updates = Object.entries(settings).map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: req.manager.id
    }));

    const { data, error } = await supabase
      .from('ai_settings')
      .upsert(updates, { onConflict: 'key' })
      .select();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error batch updating AI settings:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// ОПЕРАТОРЫ (Dataset.operator_styles)
// ============================================

// Получить всех операторов
router.get('/operators', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('operator_styles')
      .select('*')
      .order('operator_name');

    if (error) throw error;

    res.json({ operators: data });
  } catch (error) {
    console.error('Error fetching operators:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить оператора по ID
router.get('/operators/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('operator_styles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching operator:', error);
    res.status(400).json({ error: error.message });
  }
});

// Создать оператора
router.post('/operators', auth, async (req, res) => {
  try {
    const {
      operator_name,
      operator_id,
      telegram_user_id,
      role,
      style_data
    } = req.body;

    const { data, error } = await supabase
      .from('operator_styles')
      .insert({
        operator_name,
        operator_id: operator_id || `op_${Date.now()}`,
        telegram_user_id,
        role: role || 'Operator',
        style_data: style_data || {}
      })
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error creating operator:', error);
    res.status(400).json({ error: error.message });
  }
});

// Обновить оператора
router.patch('/operators/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body, updated_at: new Date().toISOString() };

    const { data, error } = await supabase
      .from('operator_styles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error updating operator:', error);
    res.status(400).json({ error: error.message });
  }
});

// Удалить оператора
router.delete('/operators/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('operator_styles')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting operator:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// БАЗА ЗНАНИЙ (Dataset.knowledge_base)
// ============================================

// Получить все статьи базы знаний
router.get('/knowledge', auth, async (req, res) => {
  try {
    const { category, search, limit = 100 } = req.query;

    let query = supabase
      .from('knowledge_base')
      .select('id, title, category, subcategory, content, priority, status, tags, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq('category', category);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ articles: data });
  } catch (error) {
    console.error('Error fetching knowledge base:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить статью по ID
router.get('/knowledge/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('knowledge_base')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching knowledge article:', error);
    res.status(400).json({ error: error.message });
  }
});

// Создать статью
router.post('/knowledge', auth, async (req, res) => {
  try {
    const {
      title,
      category,
      subcategory,
      content,
      priority,
      status,
      tags
    } = req.body;

    const { data, error } = await supabase
      .from('knowledge_base')
      .insert({
        title,
        category,
        subcategory,
        content,
        priority: priority || 'Normal',
        status: status || 'Active',
        tags,
        date_created: new Date().toISOString(),
        date_updated: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error creating knowledge article:', error);
    res.status(400).json({ error: error.message });
  }
});

// Обновить статью
router.patch('/knowledge/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { 
      ...req.body, 
      date_updated: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('knowledge_base')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error updating knowledge article:', error);
    res.status(400).json({ error: error.message });
  }
});

// Удалить статью
router.delete('/knowledge/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('knowledge_base')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting knowledge article:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить категории базы знаний
router.get('/knowledge-categories', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('knowledge_base')
      .select('category')
      .not('category', 'is', null);

    if (error) throw error;

    const categories = [...new Set(data.map(d => d.category))].filter(Boolean);
    res.json({ categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// СКРИПТЫ ОТВЕТОВ (Dataset.answer_scripts)
// ============================================

// Получить все скрипты
router.get('/scripts', auth, async (req, res) => {
  try {
    const { search, limit = 100 } = req.query;

    let query = supabase
      .from('answer_scripts')
      .select('id, question_number, question, answer, note, created_at')
      .order('question_number');

    if (search) {
      query = query.or(`question.ilike.%${search}%,answer.ilike.%${search}%`);
    }

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ scripts: data });
  } catch (error) {
    console.error('Error fetching scripts:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить скрипт по ID
router.get('/scripts/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('answer_scripts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching script:', error);
    res.status(400).json({ error: error.message });
  }
});

// Создать скрипт
router.post('/scripts', auth, async (req, res) => {
  try {
    const { question_number, question, answer, note } = req.body;

    const { data, error } = await supabase
      .from('answer_scripts')
      .insert({
        question_number,
        question,
        answer,
        note
      })
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error creating script:', error);
    res.status(400).json({ error: error.message });
  }
});

// Обновить скрипт
router.patch('/scripts/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('answer_scripts')
      .update(req.body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error updating script:', error);
    res.status(400).json({ error: error.message });
  }
});

// Удалить скрипт
router.delete('/scripts/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('answer_scripts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting script:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// КОНТЕНТ САЙТА (Dataset.website_content)
// ============================================

// Получить весь контент
router.get('/website-content', auth, async (req, res) => {
  try {
    const { section, search } = req.query;

    let query = supabase
      .from('website_content')
      .select('id, title, content, section, created_at')
      .order('created_at', { ascending: false });

    if (section) {
      query = query.eq('section', section);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ content: data });
  } catch (error) {
    console.error('Error fetching website content:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить контент по ID
router.get('/website-content/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('website_content')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching website content:', error);
    res.status(400).json({ error: error.message });
  }
});

// Создать контент
router.post('/website-content', auth, async (req, res) => {
  try {
    const { title, content, section } = req.body;

    const { data, error } = await supabase
      .from('website_content')
      .insert({ title, content, section })
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error creating website content:', error);
    res.status(400).json({ error: error.message });
  }
});

// Обновить контент
router.patch('/website-content/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('website_content')
      .update(req.body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error updating website content:', error);
    res.status(400).json({ error: error.message });
  }
});

// Удалить контент
router.delete('/website-content/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('website_content')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting website content:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить секции контента
router.get('/website-sections', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('website_content')
      .select('section')
      .not('section', 'is', null);

    if (error) throw error;

    const sections = [...new Set(data.map(d => d.section))].filter(Boolean);
    res.json({ sections });
  } catch (error) {
    console.error('Error fetching sections:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// АНАЛИТИКА AI
// ============================================

// Статистика подсказок
router.get('/analytics', auth, async (req, res) => {
  try {
    // Общая статистика
    const { data: suggestions, error: sugError } = await supabase
      .from('ai_suggestions')
      .select('id, feedback, sent_to_telegram, created_at');

    if (sugError) throw sugError;

    // Успешные ответы
    const { data: successfulResponses, error: srError } = await supabase
      .from('successful_responses')
      .select('id, feedback_type, created_at');

    if (srError) throw srError;

    // Считаем статистику
    const total = suggestions.length;
    const sent = suggestions.filter(s => s.sent_to_telegram).length;
    const feedbackStats = {
      good: suggestions.filter(s => s.feedback === 'good').length,
      bad: suggestions.filter(s => s.feedback === 'bad').length,
      edited: suggestions.filter(s => s.feedback === 'edited').length,
      no_feedback: suggestions.filter(s => !s.feedback).length
    };

    // Статистика по дням (последние 7 дней)
    const dailyStats = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayCount = suggestions.filter(s => 
        s.created_at && s.created_at.startsWith(dateStr)
      ).length;
      
      dailyStats.push({ date: dateStr, count: dayCount });
    }

    res.json({
      total,
      sent,
      feedbackStats,
      dailyStats,
      successfulResponsesCount: successfulResponses.length
    });
  } catch (error) {
    console.error('Error fetching AI analytics:', error);
    res.status(400).json({ error: error.message });
  }
});

// Последние подсказки
router.get('/suggestions', auth, async (req, res) => {
  try {
    const { limit = 20, feedback } = req.query;

    let query = supabase
      .from('ai_suggestions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (feedback) {
      query = query.eq('feedback', feedback);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ suggestions: data });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(400).json({ error: error.message });
  }
});

// Успешные ответы
router.get('/successful-responses', auth, async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const { data, error } = await supabase
      .from('successful_responses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({ responses: data });
  } catch (error) {
    console.error('Error fetching successful responses:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// ТЕСТИРОВАНИЕ AI (вызов Edge Function)
// ============================================

// Тестовая генерация подсказки
router.post('/test-suggestion', auth, async (req, res) => {
  try {
    const { client_message, lead_id, operator_id } = req.body;

    if (!client_message) {
      return res.status(400).json({ error: 'client_message is required' });
    }

    // Вызываем Edge Function напрямую
    const supabaseUrl = process.env.SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/functions/v1/on-new-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        type: 'INSERT',
        record: {
          lead_id: lead_id || 'test_' + Date.now(),
          author_type: 'Клиент',
          content: client_message,
          timestamp: Math.floor(Date.now() / 1000),
          telegram_user_id: operator_id
        },
        test_mode: true // Флаг для тестового режима
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge function error: ${errorText}`);
    }

    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error('Error testing suggestion:', error);
    res.status(400).json({ error: error.message });
  }
});

// Список доступных моделей OpenRouter
router.get('/models', auth, async (req, res) => {
  try {
    // Статический список популярных моделей OpenRouter
    const models = [
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', recommended: true },
      { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', provider: 'Anthropic' },
      { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', provider: 'Anthropic' },
      { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', recommended: true },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
      { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'OpenAI' },
      { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', provider: 'Google' },
      { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5', provider: 'Google' },
      { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', provider: 'Meta' },
      { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', provider: 'Meta' },
      { id: 'mistralai/mistral-large', name: 'Mistral Large', provider: 'Mistral' },
      { id: 'mistralai/mixtral-8x7b-instruct', name: 'Mixtral 8x7B', provider: 'Mistral' },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek' },
      { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B', provider: 'Alibaba' },
    ];

    res.json({ models });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;

