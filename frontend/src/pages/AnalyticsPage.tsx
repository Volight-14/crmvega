import React from 'react';
import { Typography, Card } from 'antd';

const { Title } = Typography;

const AnalyticsPage: React.FC = () => {
  return (
    <div>
      <Title level={2}>Аналитика</Title>
      <Card>
        <p>Здесь будет аналитика и графики. В разработке...</p>
      </Card>
    </div>
  );
};

export default AnalyticsPage;

