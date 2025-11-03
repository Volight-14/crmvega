const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Получить аналитику по сделкам
router.get('/deals', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Базовый запрос
    let dealsQuery = supabase.from('deals').select('*');

    if (startDate) {
      dealsQuery = dealsQuery.gte('created_at', startDate);
    }
    if (endDate) {
      dealsQuery = dealsQuery.lte('created_at', endDate);
    }

    const { data: deals, error } = await dealsQuery;

    if (error) throw error;

    // Статистика по статусам
    const statusStats = {};
    let totalAmount = 0;
    let closedAmount = 0;

    deals?.forEach(deal => {
      if (!statusStats[deal.status]) {
        statusStats[deal.status] = { count: 0, amount: 0 };
      }
      statusStats[deal.status].count++;
      const amount = parseFloat(deal.amount) || 0;
      statusStats[deal.status].amount += amount;
      totalAmount += amount;
      if (deal.status === 'closed') {
        closedAmount += amount;
      }
    });

    // Воронка конверсии
    const funnel = {
      new: statusStats['new']?.count || 0,
      negotiation: statusStats['negotiation']?.count || 0,
      waiting: statusStats['waiting']?.count || 0,
      ready_to_close: statusStats['ready_to_close']?.count || 0,
      closed: statusStats['closed']?.count || 0,
      rejected: statusStats['rejected']?.count || 0,
    };

    // Продажи по месяцам
    const monthlySales = {};
    deals?.forEach(deal => {
      if (deal.status === 'closed') {
        const month = new Date(deal.closed_date || deal.updated_at).toISOString().slice(0, 7);
        if (!monthlySales[month]) {
          monthlySales[month] = 0;
        }
        monthlySales[month] += parseFloat(deal.amount) || 0;
      }
    });

    // Статистика по менеджерам
    const { data: managersData } = await supabase
      .from('managers')
      .select('id, name');

    const managerStats = {};
    managersData?.forEach(manager => {
      managerStats[manager.id] = {
        name: manager.name,
        deals: 0,
        closed: 0,
        amount: 0,
      };
    });

    deals?.forEach(deal => {
      if (deal.manager_id && managerStats[deal.manager_id]) {
        managerStats[deal.manager_id].deals++;
        const amount = parseFloat(deal.amount) || 0;
        managerStats[deal.manager_id].amount += amount;
        if (deal.status === 'closed') {
          managerStats[deal.manager_id].closed++;
        }
      }
    });

    // Источники сделок
    const sourceStats = {};
    deals?.forEach(deal => {
      const source = deal.source || 'Не указан';
      if (!sourceStats[source]) {
        sourceStats[source] = { count: 0, amount: 0 };
      }
      sourceStats[source].count++;
      sourceStats[source].amount += parseFloat(deal.amount) || 0;
    });

    res.json({
      summary: {
        total: deals?.length || 0,
        totalAmount,
        closedAmount,
        closedCount: statusStats['closed']?.count || 0,
        conversionRate: deals?.length > 0 
          ? ((statusStats['closed']?.count || 0) / deals.length * 100).toFixed(1)
          : 0,
      },
      statusStats,
      funnel,
      monthlySales: Object.entries(monthlySales)
        .map(([month, amount]) => ({ month, amount }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      managerStats: Object.values(managerStats),
      sourceStats: Object.entries(sourceStats).map(([source, data]) => ({
        source,
        ...data,
      })),
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить статистику по контактам
router.get('/contacts', auth, async (req, res) => {
  try {
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, status, created_at');

    if (error) throw error;

    const statusStats = {};
    const monthlyGrowth = {};

    contacts?.forEach(contact => {
      // Статистика по статусам
      const status = contact.status || 'active';
      statusStats[status] = (statusStats[status] || 0) + 1;

      // Рост по месяцам
      const month = new Date(contact.created_at).toISOString().slice(0, 7);
      monthlyGrowth[month] = (monthlyGrowth[month] || 0) + 1;
    });

    res.json({
      total: contacts?.length || 0,
      statusStats,
      monthlyGrowth: Object.entries(monthlyGrowth)
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    });
  } catch (error) {
    console.error('Error fetching contacts analytics:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;

