import React, { useState, useEffect } from 'react';
import {
  Typography,
  Card,
  Row,
  Col,
  Statistic,
  DatePicker,
  Space,
  Select,
  message,
  Spin,
} from 'antd';
import {
  DollarOutlined,
  RiseOutlined,
  ShoppingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { analyticsAPI } from '../services/api';
import { DEAL_STATUSES } from '../types';

const { Title } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

interface AnalyticsData {
  summary: {
    total: number;
    totalAmount: number;
    closedAmount: number;
    closedCount: number;
    conversionRate: string;
  };
  statusStats: Record<string, { count: number; amount: number }>;
  funnel: Record<string, number>;
  monthlySales: Array<{ month: string; amount: number }>;
  managerStats: Array<{
    name: string;
    deals: number;
    closed: number;
    amount: number;
  }>;
  sourceStats: Array<{
    source: string;
    count: number;
    amount: number;
  }>;
}

const AnalyticsPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([
    dayjs().subtract(30, 'days'),
    dayjs(),
  ]);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [contactsData, setContactsData] = useState<any>(null);

  useEffect(() => {
    fetchAnalytics();
    fetchContactsAnalytics();
  }, [dateRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (dateRange[0]) {
        params.startDate = dateRange[0].startOf('day').toISOString();
      }
      if (dateRange[1]) {
        params.endDate = dateRange[1].endOf('day').toISOString();
      }

      const analyticsData = await analyticsAPI.getDealsAnalytics(params);
      setData(analyticsData);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      message.error('Ошибка загрузки аналитики');
    } finally {
      setLoading(false);
    }
  };

  const fetchContactsAnalytics = async () => {
    try {
      const data = await analyticsAPI.getContactsAnalytics();
      setContactsData(data);
    } catch (error) {
      console.error('Error fetching contacts analytics:', error);
    }
  };

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
      </div>
    );
  }

  const statusChartData = data
    ? Object.entries(data.statusStats).map(([status, stats]) => ({
        name: DEAL_STATUSES[status as keyof typeof DEAL_STATUSES]?.label || status,
        count: stats.count,
        amount: stats.amount,
      }))
    : [];

  const funnelData = data
    ? [
        { name: 'Новые', value: data.funnel.new, fill: '#8884d8' },
        { name: 'Переговоры', value: data.funnel.negotiation, fill: '#82ca9d' },
        { name: 'Ожидание', value: data.funnel.waiting, fill: '#ffc658' },
        { name: 'Готовы к закрытию', value: data.funnel.ready_to_close, fill: '#ff7300' },
        { name: 'Закрыты', value: data.funnel.closed, fill: '#00ff00' },
      ].filter(item => item.value > 0)
    : [];

  const managerChartData = data?.managerStats
    .filter(m => m.deals > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10) || [];

  const sourceChartData = data?.sourceStats || [];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2}>Аналитика</Title>
        </Col>
        <Col>
          <Space>
            <RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates as [Dayjs | null, Dayjs | null])}
              format="DD.MM.YYYY"
            />
          </Space>
        </Col>
      </Row>

      {/* Сводные показатели */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Всего сделок"
              value={data?.summary.total || 0}
              prefix={<ShoppingOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Общая сумма"
              value={data?.summary.totalAmount || 0}
              prefix={<DollarOutlined />}
              suffix="₽"
              precision={0}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Закрыто на сумму"
              value={data?.summary.closedAmount || 0}
              prefix={<RiseOutlined />}
              suffix="₽"
              precision={0}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Конверсия"
              value={data?.summary.conversionRate || 0}
              suffix="%"
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Графики */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {/* Продажи по месяцам */}
        <Col span={24}>
          <Card title="Продажи по месяцам">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data?.monthlySales || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip
                  formatter={(value: number) => [`${value.toLocaleString('ru-RU')} ₽`, 'Сумма']}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="#1890ff"
                  strokeWidth={2}
                  name="Сумма продаж"
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {/* Распределение по статусам */}
        <Col span={12}>
          <Card title="Распределение сделок по статусам">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {statusChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        {/* Воронка продаж */}
        <Col span={12}>
          <Card title="Воронка конверсии">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={funnelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} />
                <Tooltip />
                <Bar dataKey="value" fill="#1890ff">
                  <LabelList dataKey="value" position="right" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {/* Топ менеджеров */}
        <Col span={12}>
          <Card title="Топ менеджеров по продажам">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={managerChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip
                  formatter={(value: number) => [`${value.toLocaleString('ru-RU')} ₽`, 'Сумма']}
                />
                <Legend />
                <Bar dataKey="amount" fill="#52c41a" name="Сумма продаж" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        {/* Источники сделок */}
        <Col span={12}>
          <Card title="Распределение по источникам">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={sourceChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ source, percent }: { source: string; percent: number }) => `${source} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {sourceChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {/* Статистика по контактам */}
      {contactsData && (
        <Row gutter={16}>
          <Col span={24}>
            <Card title="Статистика контактов">
              <Row gutter={16}>
                <Col span={6}>
                  <Statistic title="Всего контактов" value={contactsData.total || 0} />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="Активные"
                    value={contactsData.statusStats?.active || 0}
                    valueStyle={{ color: '#3f8600' }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="Требуют внимания"
                    value={contactsData.statusStats?.needs_attention || 0}
                    valueStyle={{ color: '#faad14' }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="Неактивные"
                    value={contactsData.statusStats?.inactive || 0}
                    valueStyle={{ color: '#cf1322' }}
                  />
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
};

export default AnalyticsPage;
