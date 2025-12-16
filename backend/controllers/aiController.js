const aiService = require('../services/aiService');

const INSTRUCTION_LEVELS = {
    1: { name: 'law', label: 'Закон', description: 'Неизменяемые правила, нарушать запрещено' },
    2: { name: 'priority', label: 'Приоритетная', description: 'Важные инструкции от администрации' },
    3: { name: 'normal', label: 'Обычная', description: 'Дополнительные инструкции для тонкой настройки' }
};

// Хелперы для проверки прав
function canCreateInstruction(role, level) {
    if (role === 'admin') return true;
    if (level === 1) return false;
    if (level === 2) return false;
    return true;
}

function canEditInstruction(role, level, userId = null, createdBy = null) {
    if (role === 'admin') return true;
    if (level === 1) return false;
    if (level === 2) return false;
    if (level === 3) {
        return role === 'admin' || (userId && userId === createdBy);
    }
    return false;
}

function canDeleteInstruction(role, level, userId = null, createdBy = null) {
    if (level === 1) return false;
    if (role === 'admin') return true;
    if (level === 2) return false;
    if (level === 3) {
        return role === 'admin' || (userId && userId === createdBy);
    }
    return false;
}

const aiController = {
    // SETTINGS
    async getSettings(req, res) {
        try {
            const result = await aiService.getSettings();
            res.json(result);
        } catch (error) {
            console.error('Error fetching AI settings:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async updateSetting(req, res) {
        try {
            const data = await aiService.updateSetting(req.params.key, req.body.value);
            res.json({ success: true, data });
        } catch (error) {
            console.error('Error updating AI setting:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async updateSettingsBatch(req, res) {
        try {
            const data = await aiService.updateSettingsBatch(req.body.settings);
            res.json({ success: true, data });
        } catch (error) {
            console.error('Error batch updating AI settings:', error);
            res.status(400).json({ error: error.message });
        }
    },

    // OPERATORS
    async getOperators(req, res) {
        try {
            const result = await aiService.getOperators();
            res.json(result);
        } catch (error) {
            console.error('Error fetching operators:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getOperator(req, res) {
        try {
            const data = await aiService.getOperator(req.params.id);
            res.json(data);
        } catch (error) {
            console.error('Error fetching operator:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async createOperator(req, res) {
        try {
            const data = await aiService.createOperator(req.body);
            res.json(data);
        } catch (error) {
            console.error('Error creating operator:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async updateOperator(req, res) {
        try {
            const data = await aiService.updateOperator(req.params.id, req.body);
            res.json(data);
        } catch (error) {
            console.error('Error updating operator:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async deleteOperator(req, res) {
        try {
            const result = await aiService.deleteOperator(req.params.id);
            res.json(result);
        } catch (error) {
            console.error('Error deleting operator:', error);
            res.status(400).json({ error: error.message });
        }
    },

    // KNOWLEDGE BASE
    async getKnowledgeArticles(req, res) {
        try {
            const result = await aiService.getKnowledgeArticles(req.query);
            res.json(result);
        } catch (error) {
            console.error('Error fetching knowledge base:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getKnowledgeArticle(req, res) {
        try {
            const data = await aiService.getKnowledgeArticle(req.params.id);
            res.json(data);
        } catch (error) {
            console.error('Error fetching knowledge article:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async createKnowledgeArticle(req, res) {
        try {
            const data = await aiService.createKnowledgeArticle(req.body);
            res.json(data);
        } catch (error) {
            console.error('Error creating knowledge article:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async updateKnowledgeArticle(req, res) {
        try {
            const data = await aiService.updateKnowledgeArticle(req.params.id, req.body);
            res.json(data);
        } catch (error) {
            console.error('Error updating knowledge article:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async deleteKnowledgeArticle(req, res) {
        try {
            const result = await aiService.deleteKnowledgeArticle(req.params.id);
            res.json(result);
        } catch (error) {
            console.error('Error deleting knowledge article:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getKnowledgeCategories(req, res) {
        try {
            const result = await aiService.getKnowledgeCategories();
            res.json(result);
        } catch (error) {
            console.error('Error fetching knowledge categories:', error);
            res.status(400).json({ error: error.message });
        }
    },

    // SCRIPTS
    async getScripts(req, res) {
        try {
            const result = await aiService.getScripts(req.query);
            res.json(result);
        } catch (error) {
            console.error('Error fetching scripts:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getScript(req, res) {
        try {
            const data = await aiService.getScript(req.params.id);
            res.json(data);
        } catch (error) {
            console.error('Error fetching script:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async createScript(req, res) {
        try {
            const data = await aiService.createScript(req.body);
            res.json(data);
        } catch (error) {
            console.error('Error creating script:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async updateScript(req, res) {
        try {
            const data = await aiService.updateScript(req.params.id, req.body);
            res.json(data);
        } catch (error) {
            console.error('Error updating script:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async deleteScript(req, res) {
        try {
            const result = await aiService.deleteScript(req.params.id);
            res.json(result);
        } catch (error) {
            console.error('Error deleting script:', error);
            res.status(400).json({ error: error.message });
        }
    },

    // WEBSITE CONTENT
    async getWebsiteContent(req, res) {
        try {
            const result = await aiService.getWebsiteContent(req.query);
            res.json(result);
        } catch (error) {
            console.error('Error fetching website content:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getWebsiteContentItem(req, res) {
        try {
            const data = await aiService.getWebsiteContentItem(req.params.id);
            res.json(data);
        } catch (error) {
            console.error('Error fetching website content:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async createWebsiteContent(req, res) {
        try {
            const data = await aiService.createWebsiteContent(req.body);
            res.json(data);
        } catch (error) {
            console.error('Error creating website content:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async updateWebsiteContent(req, res) {
        try {
            const data = await aiService.updateWebsiteContent(req.params.id, req.body);
            res.json(data);
        } catch (error) {
            console.error('Error updating website content:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async deleteWebsiteContent(req, res) {
        try {
            const result = await aiService.deleteWebsiteContent(req.params.id);
            res.json(result);
        } catch (error) {
            console.error('Error deleting website content:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getWebsiteSections(req, res) {
        try {
            const result = await aiService.getWebsiteSections();
            res.json(result);
        } catch (error) {
            console.error('Error fetching website sections:', error);
            res.status(400).json({ error: error.message });
        }
    },

    // ANALYTICS
    async getAnalytics(req, res) {
        try {
            const result = await aiService.getAnalytics();
            res.json(result);
        } catch (error) {
            console.error('Error fetching AI analytics:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getSuggestions(req, res) {
        try {
            const result = await aiService.getSuggestions(req.query);
            res.json(result);
        } catch (error) {
            console.error('Error fetching suggestions:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getSuccessfulResponses(req, res) {
        try {
            const result = await aiService.getSuccessfulResponses(req.query);
            res.json(result);
        } catch (error) {
            console.error('Error fetching successful responses:', error);
            res.status(400).json({ error: error.message });
        }
    },

    // TESTING
    async testSuggestion(req, res) {
        try {
            const result = await aiService.testSuggestion(req.body);
            res.json(result);
        } catch (error) {
            console.error('Error testing suggestion:', error.message);
            res.status(400).json({ error: error.message });
        }
    },

    async getModels(req, res) {
        try {
            const models = aiService.getAvailableModels();
            res.json({ models });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    },

    // INSTRUCTIONS
    async getInstructions(req, res) {
        try {
            const userRole = req.manager.role || 'operator';
            const instructions = await aiService.getInstructions({ ...req.query, userRole });

            const enriched = instructions.map(inst => ({
                ...inst,
                level_info: INSTRUCTION_LEVELS[inst.level],
                can_edit: canEditInstruction(userRole, inst.level),
                can_delete: canDeleteInstruction(userRole, inst.level)
            }));

            res.json({
                instructions: enriched,
                levels: INSTRUCTION_LEVELS,
                user_role: userRole
            });
        } catch (error) {
            console.error('Error fetching instructions:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getInstructionsForPrompt(req, res) {
        try {
            const data = await aiService.getInstructionsForPrompt();

            const grouped = {
                laws: data.filter(i => i.level === 1).map(i => `• ${i.title}: ${i.content}`),
                priority: data.filter(i => i.level === 2).map(i => `• ${i.title}: ${i.content}`),
                normal: data.filter(i => i.level === 3).map(i => `• ${i.title}: ${i.content}`)
            };

            let promptText = '';
            if (grouped.laws.length) promptText += `\n\n=== ЗАКОНЫ ===\n${grouped.laws.join('\n')}`;
            if (grouped.priority.length) promptText += `\n\n=== ПРИОРИТЕТНЫЕ ===\n${grouped.priority.join('\n')}`;
            if (grouped.normal.length) promptText += `\n\n=== ОБЫЧНЫЕ ===\n${grouped.normal.join('\n')}`;

            res.json({
                prompt_text: promptText,
                counts: {
                    laws: grouped.laws.length,
                    priority: grouped.priority.length,
                    normal: grouped.normal.length
                }
            });
        } catch (error) {
            console.error('Error fetching instructions for prompt:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getInstruction(req, res) {
        try {
            const data = await aiService.getInstruction(req.params.id);
            const userRole = req.manager.role || 'operator';

            res.json({
                ...data,
                level_info: INSTRUCTION_LEVELS[data.level],
                can_edit: canEditInstruction(userRole, data.level),
                can_delete: canDeleteInstruction(userRole, data.level)
            });
        } catch (error) {
            console.error('Error fetching instruction:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async createInstruction(req, res) {
        try {
            const { level, title } = req.body;
            const userRole = req.manager.role || 'operator';
            const userId = req.manager.id;

            if (!canCreateInstruction(userRole, level)) {
                return res.status(403).json({ error: 'Недостаточно прав' });
            }

            const data = await aiService.createInstruction(req.body, userId);
            res.json({ ...data, level_info: INSTRUCTION_LEVELS[data.level] });
        } catch (error) {
            console.error('Error creating instruction:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async updateInstruction(req, res) {
        try {
            const { id } = req.params;
            const userRole = req.manager.role || 'operator';
            const userId = req.manager.id;

            const existing = await aiService.getInstruction(id);

            if (!canEditInstruction(userRole, existing.level, userId, existing.created_by)) {
                return res.status(403).json({ error: 'Недостаточно прав' });
            }

            const updateData = { ...req.body };
            delete updateData.id;
            delete updateData.created_by;
            delete updateData.created_at;

            const data = await aiService.updateInstruction(id, updateData);
            res.json({ ...data, level_info: INSTRUCTION_LEVELS[data.level] });
        } catch (error) {
            console.error('Error updating instruction:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async deleteInstruction(req, res) {
        try {
            const { id } = req.params;
            const userRole = req.manager.role || 'operator';
            const userId = req.manager.id;

            const existing = await aiService.getInstruction(id);

            if (!canDeleteInstruction(userRole, existing.level, userId, existing.created_by)) {
                return res.status(403).json({ error: 'Недостаточно прав' });
            }

            await aiService.deleteInstruction(id);
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting instruction:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getInstructionCategories(req, res) {
        try {
            const result = await aiService.getInstructionCategories();
            res.json(result);
        } catch (error) {
            console.error('Error fetching categories:', error);
            res.status(400).json({ error: error.message });
        }
    },

    // PROMPT ANALYTICS
    async getPromptAnalytics(req, res) {
        try {
            const dailyStats = await aiService.getPromptAnalytics(req.query.days);
            const latest = dailyStats?.[0] || {};
            const targetEditRate = 0.05;
            const currentEditRate = latest.edit_rate || 0;

            res.json({
                current: { ...latest },
                target: {
                    edit_rate: targetEditRate,
                    met: currentEditRate <= targetEditRate,
                    gap: Math.max(0, currentEditRate - targetEditRate)
                },
                daily_stats: dailyStats
            });
        } catch (error) {
            console.error('Error fetching prompt analytics:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getPromptImprovements(req, res) {
        try {
            const data = await aiService.getPromptImprovements(req.query);
            res.json({ improvements: data });
        } catch (error) {
            console.error('Error fetching improvements:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async updatePromptImprovement(req, res) {
        try {
            const data = await aiService.updatePromptImprovement(req.params.id, req.body.status, req.manager.id);
            res.json(data);
        } catch (error) {
            console.error('Error updating improvement:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async runDailyAnalysis(req, res) {
        try {
            const data = await aiService.runDailyAnalysis(req.body.date);
            res.json(data);
        } catch (error) {
            console.error('Error running daily analysis:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getEditExamples(req, res) {
        try {
            const data = await aiService.getEditExamples(req.query);
            res.json({ examples: data });
        } catch (error) {
            console.error('Error fetching edit examples:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async trackResponse(req, res) {
        try {
            const { lead_id, content, author_type, timestamp } = req.body;
            const data = await aiService.trackResponse({ lead_id, content, author_type, timestamp });
            res.json(data);
        } catch (error) {
            console.error('Error tracking response:', error);
            res.json({ tracked: false, error: error.message });
        }
    }
};

module.exports = aiController;
