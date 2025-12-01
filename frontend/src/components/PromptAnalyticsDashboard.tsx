import React, { useState, useEffect } from 'react';
import {
  Typography,
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Table,
  Tag,
  Button,
  Space,
  Alert,
  Spin,
  Empty,
  Tooltip,
  Modal,
  Collapse,
  Divider,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  EditOutlined,
  LineChartOutlined,
  BulbOutlined,
  ReloadOutlined,
  RocketOutlined,
  EyeOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { aiAPI } from '../services/api';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

const TARGET_EDIT_RATE = 5; // Цель: не более 5% редактирований

interface AnalyticsData {
  current: {
    date: string;
    edit_rate: number;
    acceptance_rate: number;
    total_suggestions: number;
    used_suggestions: number;
    edited_suggestions: number;
    avg_similarity: number;
    edit_type_distribution: Record<string, number>;
  };
  target: {
    edit_rate: number;
    met: boolean;
    gap: number;
  };
  trend: Array<{ date: string; edit_rate: number; acceptance_rate: number; total: number }>;
  recommendations: string;
  daily_stats: any[];
}

const PromptAnalyticsDashboard: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [runningAnalysis, setRunningAnalysis] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [improvements, setImprovements] = useState<any[]>([]);
  const [editExamples, setEditExamples] = useState<any[]>([]);
  const [exampleModalVisible, setExampleModalVisible] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [analyticsRes, improvementsRes, examplesRes] = await Promise.all([
        aiAPI.getPromptAnalytics({ days: 30 }),
        aiAPI.getPromptImprovements({ status: 'pending', limit: 10 }),
        aiAPI.getEditExamples({ limit: 20 }),
      ]);
      setData(analyticsRes);
      setImprovements(improvementsRes.improvements);
      setEditExamples(examplesRes.examples);
    } catch (error: any) {
      message.error('Ошибка загрузки аналитики');
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async () => {
    setRunningAnalysis(true);
    try {
      const result = await aiAPI.runDailyAnalysis();
      if (result.skipped) {
        message.info(result.skipped === 'already analyzed' 
          ? 'Анализ за этот день уже выполнен' 
          : 'Нет данных для анализа');
      } else {
        message.success(`Анализ завершён. Edit rate: ${result.stats?.edit_rate}`);
        loadData();
      }
    } catch (error: any) {
      message.error('Ошибка запуска анализа');
    } finally {
      setRunningAnalysis(false);
    }
  };

  const handleImprovementAction = async (id: number, status: 'approved' | 'rejected' | 'applied') => {
    try {
      await aiAPI.updatePromptImprovement(id, { status });
      message.success('Статус обновлён');
      loadData();
    } catch (error) {
      message.error('Ошибка обновления');
    }
  };

  if (loading) {
    return <Spin tip="Загрузка аналитики..." />;
  }

  if (!data) {
    return <Empty description="Нет данных для анализа" />;
  }

  const editRatePercent = (data.current.edit_rate || 0) * 100;
  const acceptanceRatePercent = (data.current.acceptance_rate || 0) * 100;
  const targetMet = editRatePercent <= TARGET_EDIT_RATE;

  // Определяем цвет прогресса
  const getProgressColor = (rate: number) => {
    if (rate <= 5) return '#52c41a';    // Зелёный - цель достигнута
    if (rate <= 15) return '#faad14';   // Жёлтый - близко
    return '#ff4d4f';                    // Красный - далеко от цели
  };

  const editTypeLabels: Record<string, { label: string; color: string }> = {
    'none': { label: 'Без изменений', color: 'green' },
    'minor': { label: 'Мелкие правки', color: 'blue' },
    'moderate': { label: 'Умеренные', color: 'orange' },
    'major': { label: 'Серьёзные', color: 'red' },
    'complete_rewrite': { label: 'Полная переписка', color: 'magenta' },
  };

  return (
    <div>
      {/* Главный показатель */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Progress
                type="dashboard"
                percent={100 - editRatePercent}
                format={() => (
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 'bold' }}>
                      {editRatePercent.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 12, color: '#999' }}>редактирований</div>
                  </div>
                )}
                strokeColor={getProgressColor(editRatePercent)}
                size={150}
              />
              <div style={{ marginTop: 8 }}>
                {targetMet ? (
                  <Tag icon={<TrophyOutlined />} color="success">Цель достигнута!</Tag>
                ) : (
                  <Tag icon={<WarningOutlined />} color="warning">
                    До цели: {(editRatePercent - TARGET_EDIT_RATE).toFixed(1)}%
                  </Tag>
                )}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Цель: ≤ {TARGET_EDIT_RATE}% редактирований
              </Text>
            </div>
          </Card>
        </Col>

        <Col span={16}>
          <Row gutter={[16, 16]}>
            <Col span={8}>
              <Card size="small">
                <Statistic
                  title="Всего подсказок"
                  value={data.current.total_suggestions || 0}
                  prefix={<BulbOutlined />}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic
                  title="Использовано"
                  value={data.current.used_suggestions || 0}
                  prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                  suffix={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      ({data.current.total_suggestions > 0 
                        ? ((data.current.used_suggestions / data.current.total_suggestions) * 100).toFixed(0) 
                        : 0}%)
                    </Text>
                  }
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic
                  title="Отредактировано"
                  value={data.current.edited_suggestions || 0}
                  prefix={<EditOutlined style={{ color: '#faad14' }} />}
                  valueStyle={{ color: editRatePercent > TARGET_EDIT_RATE ? '#ff4d4f' : '#52c41a' }}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small">
                <Statistic
                  title="Средняя схожесть"
                  value={(data.current.avg_similarity || 0) * 100}
                  precision={1}
                  suffix="%"
                  prefix={<LineChartOutlined />}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small">
                <Statistic
                  title="Принято без правок"
                  value={acceptanceRatePercent}
                  precision={1}
                  suffix="%"
                  valueStyle={{ color: acceptanceRatePercent >= 95 ? '#52c41a' : '#faad14' }}
                  prefix={<RocketOutlined />}
                />
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>

      {/* Кнопки действий */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={loadData}
            >
              Обновить
            </Button>
            <Button 
              type="primary"
              icon={<ThunderboltOutlined />} 
              onClick={runAnalysis}
              loading={runningAnalysis}
            >
              Запустить анализ
            </Button>
            <Button 
              icon={<EyeOutlined />} 
              onClick={() => setExampleModalVisible(true)}
            >
              Примеры корректировок ({editExamples.length})
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Распределение по типам редактирования */}
      {data.current.edit_type_distribution && Object.keys(data.current.edit_type_distribution).length > 0 && (
        <Card 
          title={<><EditOutlined /> Распределение корректировок</>}
          size="small"
          style={{ marginBottom: 16 }}
        >
          <Space wrap>
            {Object.entries(data.current.edit_type_distribution).map(([type, count]) => (
              <Tag 
                key={type} 
                color={editTypeLabels[type]?.color || 'default'}
              >
                {editTypeLabels[type]?.label || type}: {count}
              </Tag>
            ))}
          </Space>
        </Card>
      )}

      {/* Рекомендации AI */}
      {data.recommendations && (
        <Card 
          title={<><BulbOutlined /> Рекомендации по улучшению промптов</>}
          style={{ marginBottom: 16 }}
        >
          <Paragraph style={{ whiteSpace: 'pre-wrap' }}>
            {data.recommendations}
          </Paragraph>
        </Card>
      )}

      {/* Pending рекомендации */}
      {improvements.length > 0 && (
        <Card 
          title={<><WarningOutlined /> Требуют внимания ({improvements.length})</>}
          style={{ marginBottom: 16 }}
        >
          <Collapse>
            {improvements.map((imp: any) => (
              <Panel 
                key={imp.id}
                header={
                  <Space>
                    <Tag color="orange">{imp.improvement_type}</Tag>
                    <Text>{imp.problem_description?.slice(0, 100)}</Text>
                  </Space>
                }
                extra={
                  <Space onClick={e => e.stopPropagation()}>
                    <Button 
                      size="small" 
                      type="primary"
                      onClick={() => handleImprovementAction(imp.id, 'applied')}
                    >
                      Применить
                    </Button>
                    <Button 
                      size="small"
                      onClick={() => handleImprovementAction(imp.id, 'rejected')}
                    >
                      Отклонить
                    </Button>
                  </Space>
                }
              >
                <Paragraph><strong>Проблема:</strong> {imp.problem_description}</Paragraph>
                <Paragraph><strong>Рекомендация:</strong></Paragraph>
                <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, whiteSpace: 'pre-wrap' }}>
                  {imp.suggested_fix}
                </pre>
              </Panel>
            ))}
          </Collapse>
        </Card>
      )}

      {/* Тренд по дням */}
      {data.trend && data.trend.length > 0 && (
        <Card title={<><LineChartOutlined /> Тренд за последние дни</>}>
          <Table
            dataSource={data.trend.slice(-14)}
            rowKey="date"
            pagination={false}
            size="small"
            columns={[
              {
                title: 'Дата',
                dataIndex: 'date',
                key: 'date',
                render: (date: string) => new Date(date).toLocaleDateString('ru-RU'),
              },
              {
                title: 'Всего',
                dataIndex: 'total',
                key: 'total',
              },
              {
                title: 'Edit Rate',
                dataIndex: 'edit_rate',
                key: 'edit_rate',
                render: (rate: number) => {
                  const percent = (rate || 0) * 100;
                  return (
                    <Tag color={percent <= TARGET_EDIT_RATE ? 'green' : percent <= 15 ? 'orange' : 'red'}>
                      {percent.toFixed(1)}%
                    </Tag>
                  );
                },
              },
              {
                title: 'Acceptance',
                dataIndex: 'acceptance_rate',
                key: 'acceptance_rate',
                render: (rate: number) => `${((rate || 0) * 100).toFixed(1)}%`,
              },
            ]}
          />
        </Card>
      )}

      {/* Модальное окно с примерами */}
      <Modal
        title="Примеры корректировок операторами"
        open={exampleModalVisible}
        onCancel={() => setExampleModalVisible(false)}
        footer={<Button onClick={() => setExampleModalVisible(false)}>Закрыть</Button>}
        width={900}
      >
        <Table
          dataSource={editExamples}
          rowKey="id"
          pagination={{ pageSize: 5 }}
          size="small"
          expandable={{
            expandedRowRender: (record) => (
              <div>
                <Paragraph>
                  <strong>AI предложил:</strong>
                  <pre style={{ background: '#fff3cd', padding: 8, borderRadius: 4, whiteSpace: 'pre-wrap' }}>
                    {record.suggested_response}
                  </pre>
                </Paragraph>
                <Paragraph>
                  <strong>Оператор отправил:</strong>
                  <pre style={{ background: '#d4edda', padding: 8, borderRadius: 4, whiteSpace: 'pre-wrap' }}>
                    {record.actual_response}
                  </pre>
                </Paragraph>
              </div>
            ),
          }}
          columns={[
            {
              title: 'Дата',
              dataIndex: 'created_at',
              key: 'created_at',
              width: 100,
              render: (date: string) => new Date(date).toLocaleDateString('ru-RU'),
            },
            {
              title: 'Вопрос клиента',
              dataIndex: 'client_message',
              key: 'client_message',
              ellipsis: true,
              render: (text: string) => <Text ellipsis style={{ maxWidth: 300 }}>{text}</Text>,
            },
            {
              title: 'Схожесть',
              dataIndex: 'similarity_score',
              key: 'similarity_score',
              width: 100,
              render: (score: number) => (
                <Tag color={score >= 0.8 ? 'green' : score >= 0.5 ? 'orange' : 'red'}>
                  {((score || 0) * 100).toFixed(0)}%
                </Tag>
              ),
            },
            {
              title: 'Тип',
              dataIndex: 'edit_type',
              key: 'edit_type',
              width: 120,
              render: (type: string) => (
                <Tag color={editTypeLabels[type]?.color || 'default'}>
                  {editTypeLabels[type]?.label || type}
                </Tag>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
};

export default PromptAnalyticsDashboard;

