const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Helper for Dataset schema
const dataset = () => supabase.schema('Dataset');

/**
 * Sanitizes search input for PostgREST .or() filter
 * Removes characters that could break the syntax: , ( ) .
 */
const sanitizeSearch = (term) => {
  if (!term) return '';
  return term.replace(/[(),.]/g, ' ').trim();
};

const aiService = {
  // ============================================
  // SETTINGS
  // ============================================

  async getSettings() {
    const { data, error } = await supabase.rpc('get_agent_config');
    if (error) throw error;

    const config = data || {};
    return {
      settings: {
        model: config.model || 'anthropic/claude-3.5-sonnet',
        temperature: config.temperature || 0.7,
        max_tokens: config.max_tokens || 1024,
        system_prompt: config.system_prompt || '',
        auto_suggestions_enabled: config.auto_suggestions ?? true,
        min_delay_seconds: config.min_delay_seconds || 5
      },
      raw: config
    };
  },

  async updateSetting(key, value) {
    const { data: current, error: getError } = await supabase.rpc('get_agent_config');
    if (getError) throw getError;

    const params = {
      p_model: current?.model || 'anthropic/claude-3.5-sonnet',
      p_temperature: current?.temperature || 0.7,
      p_max_tokens: current?.max_tokens || 1024,
      p_system_prompt: current?.system_prompt || '',
      p_auto_suggestions: current?.auto_suggestions_enabled ?? true,
      p_min_delay_seconds: current?.min_delay_seconds || 5
    };

    const keyMap = {
      model: 'p_model',
      temperature: 'p_temperature',
      max_tokens: 'p_max_tokens',
      system_prompt: 'p_system_prompt',
      auto_suggestions_enabled: 'p_auto_suggestions',
      min_delay_seconds: 'p_min_delay_seconds'
    };

    if (keyMap[key]) {
      params[keyMap[key]] = value;
    }

    const { data, error } = await supabase.rpc('update_agent_config', params);
    if (error) throw error;
    return data;
  },

  async updateSettingsBatch(settings) {
    const { data, error } = await supabase.rpc('update_agent_config', {
      p_model: settings.model || 'anthropic/claude-3.5-sonnet',
      p_temperature: parseFloat(settings.temperature) || 0.7,
      p_max_tokens: parseInt(settings.max_tokens) || 1024,
      p_system_prompt: settings.system_prompt || '',
      p_auto_suggestions: settings.auto_suggestions_enabled ?? true,
      p_min_delay_seconds: parseInt(settings.min_delay_seconds) || 5
    });

    if (error) throw error;
    return data;
  },

  // ============================================
  // OPERATORS
  // ============================================

  async getOperators() {
    const { data, error } = await dataset()
      .from('operator_styles')
      .select('*')
      .order('operator_name');
    if (error) throw error;
    return { operators: data };
  },

  async getOperator(id) {
    const { data, error } = await dataset()
      .from('operator_styles')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async createOperator(operatorData) {
    const {
      operator_name,
      operator_id,
      telegram_user_id,
      role,
      style_data
    } = operatorData;

    const { data, error } = await dataset()
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
    return data;
  },

  async updateOperator(id, operatorData) {
    const updateData = { ...operatorData, updated_at: new Date().toISOString() };
    const { data, error } = await dataset()
      .from('operator_styles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteOperator(id) {
    const { error } = await dataset()
      .from('operator_styles')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  // ============================================
  // KNOWLEDGE BASE
  // ============================================

  async getKnowledgeArticles({ category, search, limit = 100 }) {
    let query = dataset()
      .from('knowledge_base')
      .select('id, title, category, subcategory, content, priority, status, tags, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq('category', category);
    }

    if (search) {
      // SECURITY FIX: sanitize search input
      const safeSearch = sanitizeSearch(search);
      if (safeSearch) {
        query = query.or(`title.ilike.%${safeSearch}%,content.ilike.%${safeSearch}%`);
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    return { articles: data };
  },

  async getKnowledgeArticle(id) {
    const { data, error } = await dataset()
      .from('knowledge_base')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async createKnowledgeArticle(articleData) {
    const {
      title,
      category,
      subcategory,
      content,
      priority,
      status,
      tags
    } = articleData;

    const { data, error } = await dataset()
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
    return data;
  },

  async updateKnowledgeArticle(id, articleData) {
    const updateData = {
      ...articleData,
      date_updated: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await dataset()
      .from('knowledge_base')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteKnowledgeArticle(id) {
    const { error } = await dataset()
      .from('knowledge_base')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  async getKnowledgeCategories() {
    const { data, error } = await dataset()
      .from('knowledge_base')
      .select('category')
      .not('category', 'is', null);

    if (error) throw error;
    const categories = [...new Set(data.map(d => d.category))].filter(Boolean);
    return { categories };
  },

  // ============================================
  // ANSWER SCRIPTS
  // ============================================

  async getScripts({ search, limit = 100 }) {
    let query = dataset()
      .from('answer_scripts')
      .select('id, question_number, question, answer, note, created_at')
      .order('question_number');

    if (search) {
      // SECURITY FIX: sanitize search input
      const safeSearch = sanitizeSearch(search);
      if (safeSearch) {
        query = query.or(`question.ilike.%${safeSearch}%,answer.ilike.%${safeSearch}%`);
      }
    }

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { scripts: data };
  },

  async getScript(id) {
    const { data, error } = await dataset()
      .from('answer_scripts')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async createScript(scriptData) {
    const { question_number, question, answer, note } = scriptData;
    const { data, error } = await dataset()
      .from('answer_scripts')
      .insert({ question_number, question, answer, note })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateScript(id, scriptData) {
    const { data, error } = await dataset()
      .from('answer_scripts')
      .update(scriptData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteScript(id) {
    const { error } = await dataset()
      .from('answer_scripts')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  // ============================================
  // WEBSITE CONTENT
  // ============================================

  // ============================================
  // WEBSITE CONTENT
  // ============================================

  async getWebsiteContent({ section, search }) {
    // SEPARATION: chat_templates live in public.chat_templates
    // Everything else lives in Dataset.website_content

    if (section === 'chat_templates') {
      let query = supabase
        .from('chat_templates')
        .select('id, title, content, created_at')
        .order('created_at', { ascending: false });

      if (search) {
        const safeSearch = sanitizeSearch(search);
        if (safeSearch) {
          query = query.or(`title.ilike.%${safeSearch}%,content.ilike.%${safeSearch}%`);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      // Map to expected format (add section field for compatibility)
      const mapped = data.map(item => ({ ...item, section: 'chat_templates' }));
      return { content: mapped };
    }

    // Default: AI Content in Dataset
    let query = dataset()
      .from('website_content')
      .select('id, title, content, section, created_at')
      .order('created_at', { ascending: false });

    if (section) {
      query = query.eq('section', section);
    }

    if (search) {
      const safeSearch = sanitizeSearch(search);
      if (safeSearch) {
        query = query.or(`title.ilike.%${safeSearch}%,content.ilike.%${safeSearch}%`);
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    return { content: data };
  },

  async getWebsiteContentItem(id) {
    // Try public first (most likely for user interactions)
    // Actually, ID collision might be an issue if we just guess.
    // But since we separated them, we need to know WHERE to look.
    // The Frontend calls this with just ID.
    // Strategy: Try chat_templates first. If not found, try Dataset.

    let { data, error } = await supabase
      .from('chat_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (!error && data) {
      return { ...data, section: 'chat_templates' };
    }

    // Fallback to Dataset
    const { data: aiData, error: aiError } = await dataset()
      .from('website_content')
      .select('*')
      .eq('id', id)
      .single();

    if (aiError) throw aiError;
    return aiData;
  },

  async createWebsiteContent(contentData) {
    const { title, content, section } = contentData;

    if (section === 'chat_templates') {
      const { data, error } = await supabase
        .from('chat_templates')
        .insert({ title, content })
        .select()
        .single();
      if (error) throw error;
      return { ...data, section: 'chat_templates' };
    }

    const { data, error } = await dataset()
      .from('website_content')
      .insert({ title, content, section })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateWebsiteContent(id, contentData) {
    // First, check if it exists in chat_templates
    const { data: existing, error: checkError } = await supabase
      .from('chat_templates')
      .select('id')
      .eq('id', id)
      .maybeSingle(); // Don't throw if not found

    if (existing) {
      const { data, error } = await supabase
        .from('chat_templates')
        .update({
          title: contentData.title,
          content: contentData.content
          // ignore section update for this table
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return { ...data, section: 'chat_templates' };
    }

    // Otherwise update in Dataset
    const { data, error } = await dataset()
      .from('website_content')
      .update(contentData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteWebsiteContent(id) {
    // Try delete from chat_templates
    const { error: chatError, count } = await supabase
      .from('chat_templates')
      .delete()
      .eq('id', id); // delete doesn't return count by default in simple syntax unless we ask, but here we just check error.

    // If we assume IDs are unique enough or we just try both?
    // Safer to try both or check existence.
    // Let's try Dataset too if no error (or even if error?).

    // Actually, if we successfully deleted from chat_templates, we are done?
    // Supabase delete returns status 204.

    // Let's just try to delete from BOTH to be sure.

    await supabase.from('chat_templates').delete().eq('id', id);

    const { error } = await dataset()
      .from('website_content')
      .delete()
      .eq('id', id);

    // If it was in one of them, success. 
    // We can ignore 'not found' error if Supabase throws it, but usually delete just returns 0 rows affected.

    if (error) throw error;
    return { success: true };
  },

  async getWebsiteSections() {
    // Get sections from Dataset
    const { data, error } = await dataset()
      .from('website_content')
      .select('section')
      .not('section', 'is', null);

    if (error) throw error;
    const sections = [...new Set(data.map(d => d.section))].filter(Boolean);

    // Add 'chat_templates' manually as it's now special
    if (!sections.includes('chat_templates')) {
      sections.push('chat_templates');
    }

    return { sections };
  },

  // ============================================
  // ANALYTICS
  // ============================================

  async getAnalytics() {
    // Общая статистика
    const { data: suggestions, error: sugError } = await dataset()
      .from('ai_suggestions')
      .select('id, feedback, sent_to_telegram, created_at');

    if (sugError) throw sugError;

    // Успешные ответы
    const { data: successfulResponses, error: srError } = await dataset()
      .from('successful_responses')
      .select('id, feedback_type, created_at');

    if (srError) throw srError;

    const total = suggestions.length;
    const sent = suggestions.filter(s => s.sent_to_telegram).length;
    const feedbackStats = {
      good: suggestions.filter(s => s.feedback === 'good').length,
      bad: suggestions.filter(s => s.feedback === 'bad').length,
      edited: suggestions.filter(s => s.feedback === 'edited').length,
      no_feedback: suggestions.filter(s => !s.feedback).length
    };

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

    return {
      total,
      sent,
      feedbackStats,
      dailyStats,
      successfulResponsesCount: successfulResponses.length
    };
  },

  async getSuggestions({ limit = 20, feedback }) {
    let query = dataset()
      .from('ai_suggestions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (feedback) {
      query = query.eq('feedback', feedback);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { suggestions: data };
  },

  async getSuccessfulResponses({ limit = 50 }) {
    const { data, error } = await dataset()
      .from('successful_responses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return { responses: data };
  },

  // ============================================
  // AI GENERATION (Testing)
  // ============================================

  async testSuggestion({ client_message, operator_id }) {
    if (!client_message) {
      throw new Error('client_message is required');
    }

    // Config
    const { data: config, error: configError } = await supabase.rpc('get_agent_config');
    if (configError) throw configError;

    const model = config?.model || 'openai/gpt-4o-mini';
    const temperature = config?.temperature || 0.7;
    const max_tokens = config?.max_tokens || 500;
    const system_prompt = config?.system_prompt || 'Ты — AI-помощник оператора службы поддержки.';

    // Style
    let styleInfo = '';
    if (operator_id) {
      const { data: styleData } = await dataset()
        .from('operator_styles')
        .select('operator_name, style_data')
        .eq('telegram_user_id', operator_id)
        .single();

      if (styleData) {
        const s = styleData.style_data || {};
        styleInfo = `\n\nСтиль оператора ${styleData.operator_name}:\nТон: ${s.tone || 'профессиональный'}\nПаттерны: ${s.patterns || ''}\nФразы: ${s.phrases || ''}`;
      }
    }

    // OpenRouter Call
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterKey) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    const orResponse = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: model,
      messages: [
        { role: 'system', content: system_prompt + styleInfo },
        { role: 'user', content: `Сообщение клиента: ${client_message}\n\nПредложи ответ:` }
      ],
      max_tokens: max_tokens,
      temperature: temperature
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openrouterKey}`
      }
    });

    const suggestion = orResponse.data?.choices?.[0]?.message?.content || '';

    return {
      success: true,
      suggested_response: suggestion,
      config_used: { model, temperature, max_tokens },
      client_message: client_message
    };
  },

  getAvailableModels() {
    return [
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', recommended: true },
      { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', provider: 'Anthropic' },
      { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', recommended: true },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
      { id: 'google/gemini-pro', name: 'Gemini Pro', provider: 'Google' },
      { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', provider: 'Meta' },
    ];
  },

  // ============================================
  // INSTRUCTIONS
  // ============================================

  async getInstructions({ level, is_active, category, userRole = 'operator' }) {
    let query = dataset()
      .from('ai_instructions')
      .select('*')
      .order('level', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (level) query = query.eq('level', parseInt(level));
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getInstructionsForPrompt() {
    const { data, error } = await dataset()
      .from('ai_instructions')
      .select('level, title, content')
      .eq('is_active', true)
      .order('level', { ascending: true })
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return data;
  },

  async getInstruction(id) {
    const { data, error } = await dataset()
      .from('ai_instructions')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async createInstruction(instructionData, userId) {
    const { level, title, content, category, is_active, sort_order } = instructionData;

    const { data, error } = await dataset()
      .from('ai_instructions')
      .insert({
        level: level || 3,
        title,
        content,
        category,
        is_active: is_active !== false,
        sort_order: sort_order || 0,
        created_by: userId
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateInstruction(id, updateData) {
    const { data, error } = await dataset()
      .from('ai_instructions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteInstruction(id) {
    const { error } = await dataset()
      .from('ai_instructions')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  async getInstructionCategories() {
    const { data, error } = await dataset()
      .from('ai_instructions')
      .select('category')
      .not('category', 'is', null);

    if (error) throw error;
    const categories = [...new Set(data.map(d => d.category))].filter(Boolean);
    return { categories };
  },

  // ============================================
  // PROMPT ANALYTICS
  // ============================================

  async getPromptAnalytics(days = 30) {
    const { data: dailyStats, error: statsError } = await dataset()
      .from('prompt_analysis')
      .select('*')
      .order('analysis_date', { ascending: false })
      .limit(days);

    if (statsError) throw statsError;
    return dailyStats;
  },

  async getPromptImprovements({ status = 'pending', limit = 20 }) {
    let query = dataset()
      .from('prompt_improvements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async updatePromptImprovement(id, status, userId) {
    const updateData = {
      status,
      ...(status === 'applied' && {
        applied_at: new Date().toISOString(),
        applied_by: userId
      })
    };

    const { data, error } = await dataset()
      .from('prompt_improvements')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async runDailyAnalysis(date) {
    // Calling Edge Function
    const response = await axios.post(
      `${process.env.SUPABASE_URL}/functions/v1/daily-prompt-analysis`,
      { date },
      {
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  },

  async getEditExamples({ limit = 50, edit_type }) {
    let query = dataset()
      .from('ai_suggestions')
      .select('id, lead_id, client_message, suggested_response, actual_response, similarity_score, edit_type, created_at')
      .not('actual_response', 'is', null)
      .eq('was_edited', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (edit_type) {
      query = query.eq('edit_type', edit_type);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async trackResponse(record) {
    const response = await axios.post(
      `${process.env.SUPABASE_URL}/functions/v1/track-operator-response`,
      {
        type: 'INSERT',
        record
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  }
};

module.exports = aiService;
