import React from 'react';
import { Typography, Card } from 'antd';

const { Title } = Typography;

const AutomationPage: React.FC = () => {
  return (
    <div>
      <Title level={2}>Автоматизация</Title>
      <Card>
        <p>Здесь будут правила автоматизации. В разработке...</p>
      </Card>
    </div>
  );
};

export default AutomationPage;

