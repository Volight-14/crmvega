const express = require('express');
const auth = require('../middleware/auth');
const aiController = require('../controllers/aiController');

const router = express.Router();

// Settings
router.get('/settings', auth, aiController.getSettings);
router.patch('/settings/:key', auth, aiController.updateSetting);
router.post('/settings/batch', auth, aiController.updateSettingsBatch);

// Operators
router.get('/operators', auth, aiController.getOperators);
router.post('/operators', auth, aiController.createOperator);
router.get('/operators/:id', auth, aiController.getOperator);
router.patch('/operators/:id', auth, aiController.updateOperator);
router.delete('/operators/:id', auth, aiController.deleteOperator);

// Knowledge Base
router.get('/knowledge', auth, aiController.getKnowledgeArticles);
router.post('/knowledge', auth, aiController.createKnowledgeArticle);
router.get('/knowledge-categories', auth, aiController.getKnowledgeCategories);
router.get('/knowledge/:id', auth, aiController.getKnowledgeArticle);
router.patch('/knowledge/:id', auth, aiController.updateKnowledgeArticle);
router.delete('/knowledge/:id', auth, aiController.deleteKnowledgeArticle);

// Scripts
router.get('/scripts', auth, aiController.getScripts);
router.post('/scripts', auth, aiController.createScript);
router.get('/scripts/:id', auth, aiController.getScript);
router.patch('/scripts/:id', auth, aiController.updateScript);
router.delete('/scripts/:id', auth, aiController.deleteScript);

// Website Content
router.get('/website-content', auth, aiController.getWebsiteContent);
router.post('/website-content', auth, aiController.createWebsiteContent);
router.get('/website-sections', auth, aiController.getWebsiteSections);
router.get('/website-content/:id', auth, aiController.getWebsiteContentItem);
router.patch('/website-content/:id', auth, aiController.updateWebsiteContent);
router.delete('/website-content/:id', auth, aiController.deleteWebsiteContent);

// Analytics
router.get('/analytics', auth, aiController.getAnalytics);
router.get('/suggestions', auth, aiController.getSuggestions);
router.get('/successful-responses', auth, aiController.getSuccessfulResponses);

// Testing
router.post('/test-suggestion', auth, aiController.testSuggestion);
router.get('/models', auth, aiController.getModels);

// Instructions
router.get('/instructions', auth, aiController.getInstructions);
router.post('/instructions', auth, aiController.createInstruction);
router.get('/instructions/for-prompt', auth, aiController.getInstructionsForPrompt);
router.get('/instructions-categories', auth, aiController.getInstructionCategories);
router.get('/instructions/:id', auth, aiController.getInstruction);
router.patch('/instructions/:id', auth, aiController.updateInstruction);
router.delete('/instructions/:id', auth, aiController.deleteInstruction);

// Prompt Analytics
router.get('/prompt-analytics', auth, aiController.getPromptAnalytics);
router.get('/prompt-improvements', auth, aiController.getPromptImprovements);
router.patch('/prompt-improvements/:id', auth, aiController.updatePromptImprovement);
router.post('/run-daily-analysis', auth, aiController.runDailyAnalysis);
router.get('/edit-examples', auth, aiController.getEditExamples);
router.post('/track-response', auth, aiController.trackResponse);

module.exports = router;
